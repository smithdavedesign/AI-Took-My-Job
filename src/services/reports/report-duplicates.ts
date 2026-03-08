import type { StoredGitHubIssueLink } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

import { resolveSimilarReports } from './similar-reports.js';

export interface DuplicateReportCandidate {
  reportId: string;
  title: string | null;
  duplicateScore: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  issueUrl?: string;
  issueNumber?: number;
  repository?: string;
}

export interface DuplicateReportResolution {
  candidates: DuplicateReportCandidate[];
}

function tokenize(value: string | undefined): Set<string> {
  if (!value) {
    return new Set<string>();
  }

  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...left, ...right]).size;
}

function classifyConfidence(score: number): DuplicateReportCandidate['confidence'] {
  if (score >= 0.8) {
    return 'high';
  }
  if (score >= 0.6) {
    return 'medium';
  }
  return 'low';
}

export async function resolveDuplicateReports(input: {
  report: StoredFeedbackReport;
  embedding?: number[];
  loadNearestNeighbors?: (embedding: number[], limit: number) => Promise<Array<{ feedbackReportId: string; distance: number }>>;
  loadReportById?: (reportId: string) => Promise<StoredFeedbackReport | null>;
  loadIssueLinkByReportId?: (reportId: string) => Promise<StoredGitHubIssueLink | null>;
  limit?: number;
}): Promise<DuplicateReportResolution> {
  if (!input.embedding || !input.loadNearestNeighbors || !input.loadReportById) {
    return { candidates: [] };
  }

  const similar = await resolveSimilarReports({
    report: input.report,
    embedding: input.embedding,
    loadNearestNeighbors: input.loadNearestNeighbors,
    loadReportById: input.loadReportById,
    ...(input.loadIssueLinkByReportId ? { loadIssueLinkByReportId: input.loadIssueLinkByReportId } : {}),
    ...(typeof input.limit === 'number' ? { limit: input.limit } : {})
  });

  const currentTitleTokens = tokenize(input.report.title);
  const currentPayloadTokens = tokenize(JSON.stringify(input.report.payload));
  const candidates: DuplicateReportCandidate[] = [];

  for (const candidate of similar.candidates) {
    const report = await input.loadReportById(candidate.reportId);
    if (!report) {
      continue;
    }

    const titleSimilarity = jaccard(currentTitleTokens, tokenize(report.title));
    const payloadSimilarity = jaccard(currentPayloadTokens, tokenize(JSON.stringify(report.payload)));
    const exactExternalId = Boolean(input.report.externalId && report.externalId && input.report.externalId === report.externalId);
    const exactNormalizedTitle = input.report.title && report.title && input.report.title.trim().toLowerCase() === report.title.trim().toLowerCase();
    const duplicateScore = Number(Math.min(1, (candidate.combinedScore * 0.45)
      + (titleSimilarity * 0.25)
      + (payloadSimilarity * 0.15)
      + (exactExternalId ? 0.2 : 0)
      + (exactNormalizedTitle ? 0.1 : 0)
      + (input.report.source === report.source ? 0.05 : 0)).toFixed(4));

    const issueLink = input.loadIssueLinkByReportId
      ? await input.loadIssueLinkByReportId(report.id)
      : null;

    candidates.push({
      reportId: report.id,
      title: report.title ?? null,
      duplicateScore,
      confidence: classifyConfidence(duplicateScore),
      reasons: [
        ...candidate.reasons,
        ...(titleSimilarity > 0 ? [`title similarity ${titleSimilarity.toFixed(4)}`] : []),
        ...(payloadSimilarity > 0 ? [`payload similarity ${payloadSimilarity.toFixed(4)}`] : []),
        ...(exactExternalId ? ['same external identifier'] : []),
        ...(exactNormalizedTitle ? ['same normalized title'] : [])
      ],
      ...(issueLink?.issueUrl ? { issueUrl: issueLink.issueUrl } : {}),
      ...(typeof issueLink?.issueNumber === 'number' ? { issueNumber: issueLink.issueNumber } : {}),
      ...(issueLink?.repository ? { repository: issueLink.repository } : {})
    });
  }

  return {
    candidates: candidates
      .sort((left, right) => right.duplicateScore - left.duplicateScore)
      .slice(0, input.limit ?? 5)
  };
}