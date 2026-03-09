import type { StoredFeedbackReport } from '../../types/reports.js';
import type { StoredWorkspaceTriagePolicy } from '../../types/workspace-triage-policy.js';

import { resolveSimilarReports } from './similar-reports.js';
import { evaluateOwnershipPolicyRules } from './triage-policy.js';

export interface OwnershipCandidate {
  label: string;
  kind: 'explicit-owner' | 'repository-owner' | 'reporter' | 'similar-report-owner' | 'policy-owner';
  score: number;
  reasons: string[];
  supportingReportIds: string[];
}

export interface ReportOwnershipResolution {
  candidates: OwnershipCandidate[];
  neighbors: Array<{ reportId: string; distance: number }>;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function getNestedRecordValue(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function readStringCandidates(report: StoredFeedbackReport): Array<{ label: string; kind: OwnershipCandidate['kind']; reason: string; score: number }> {
  const candidates: Array<{ label: string; kind: OwnershipCandidate['kind']; reason: string; score: number }> = [];
  const explicitOwnerPaths = [
    ['metadata', 'owner'],
    ['owner'],
    ['details', 'owner']
  ];

  for (const path of explicitOwnerPaths) {
    const value = getNestedRecordValue(report.payload, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      candidates.push({
        label: value.trim(),
        kind: 'explicit-owner',
        reason: `report payload includes owner via ${path.join('.')}`,
        score: 1
      });
    }
  }

  if (report.reporterIdentifier && !['extension', 'slack', 'sentry', 'datadog', 'newrelic'].includes(report.reporterIdentifier)) {
    candidates.push({
      label: report.reporterIdentifier,
      kind: 'reporter',
      reason: 'reporter identifier may indicate the owning team or service contact',
      score: 0.45
    });
  }

  return candidates;
}

function upsertCandidate(
  registry: Map<string, OwnershipCandidate>,
  candidate: { label: string; kind: OwnershipCandidate['kind']; reason: string; score: number; reportId?: string }
): void {
  const key = normalizeLabel(candidate.label);
  const existing = registry.get(key);

  if (!existing) {
    registry.set(key, {
      label: candidate.label,
      kind: candidate.kind,
      score: Number(candidate.score.toFixed(4)),
      reasons: [candidate.reason],
      supportingReportIds: candidate.reportId ? [candidate.reportId] : []
    });
    return;
  }

  existing.score = Number((existing.score + candidate.score).toFixed(4));
  if (!existing.reasons.includes(candidate.reason)) {
    existing.reasons.push(candidate.reason);
  }
  if (candidate.reportId && !existing.supportingReportIds.includes(candidate.reportId)) {
    existing.supportingReportIds.push(candidate.reportId);
  }
}

export async function resolveOwnershipCandidates(input: {
  report: StoredFeedbackReport;
  repository?: string | null;
  policy?: StoredWorkspaceTriagePolicy | null;
  embedding?: number[];
  loadNearestNeighbors?: (embedding: number[], limit: number) => Promise<Array<{ feedbackReportId: string; distance: number }>>;
  loadReportById?: (reportId: string) => Promise<StoredFeedbackReport | null>;
  limit?: number;
}): Promise<ReportOwnershipResolution> {
  const registry = new Map<string, OwnershipCandidate>();

  for (const candidate of readStringCandidates(input.report)) {
    upsertCandidate(registry, candidate);
  }

  if (input.repository) {
    const owner = input.repository.split('/').filter(Boolean)[0];
    if (owner) {
      upsertCandidate(registry, {
        label: owner,
        kind: 'repository-owner',
        reason: 'repository owner linked to the report draft or task target',
        score: 0.55
      });
    }
  }

  for (const candidate of evaluateOwnershipPolicyRules({
    policy: input.policy ?? null,
    report: input.report,
    repository: input.repository
  })) {
    upsertCandidate(registry, {
      label: candidate.label,
      kind: 'policy-owner',
      reason: candidate.reason,
      score: candidate.score
    });
  }

  let neighbors: Array<{ reportId: string; distance: number }> = [];

  if (input.embedding && input.loadNearestNeighbors && input.loadReportById) {
    const similar = await resolveSimilarReports({
      report: input.report,
      embedding: input.embedding,
      loadNearestNeighbors: input.loadNearestNeighbors,
      loadReportById: input.loadReportById,
      ...(typeof input.limit === 'number' ? { limit: input.limit } : {})
    });
    neighbors = similar.candidates.map((candidate) => ({ reportId: candidate.reportId, distance: candidate.distance }));

    for (const neighbor of neighbors) {
      const report = await input.loadReportById(neighbor.reportId);
      if (!report) {
        continue;
      }

      const similarityWeight = Math.max(0.15, 1 - Math.min(neighbor.distance, 1.5) / 1.5);
      for (const candidate of readStringCandidates(report)) {
        upsertCandidate(registry, {
          label: candidate.label,
          kind: 'similar-report-owner',
          reason: `similar report ${neighbor.reportId} suggests the same owner (distance ${neighbor.distance.toFixed(4)})`,
          score: Number((candidate.score * similarityWeight).toFixed(4)),
          reportId: neighbor.reportId
        });
      }
    }
  }

  const candidates = Array.from(registry.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, input.limit ?? 5);

  return {
    candidates,
    neighbors
  };
}