import { computeInitialImpactScore } from '../../domain/impact-score.js';
import type { StoredAgentTask, StoredAgentTaskExecution, StoredAgentTaskExecutionPullRequest } from '../../types/agent-tasks.js';
import type { StoredGitHubIssueLink } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';
import type { StoredWorkspaceTriagePolicy } from '../../types/workspace-triage-policy.js';

import { resolveOwnershipCandidates } from './ownership-candidates.js';
import { resolveReportHistory } from './report-history.js';
import { resolveSimilarReports } from './similar-reports.js';
import { evaluatePriorityPolicyRules } from './triage-policy.js';

export interface RefinedImpactAssessment {
  score: number;
  band: 'low' | 'medium' | 'high' | 'critical';
  factors: {
    baseScore: number;
    recurrenceCount: number;
    breadthEstimate: number;
    relatedIssueCount: number;
    relatedPullRequestCount: number;
    mergedPullRequestCount: number;
    uniqueSourceCount: number;
    uniqueReporterCount: number;
    ownerCandidateCount: number;
    policyDelta: number;
  };
  reasons: string[];
}

function readStoredImpactScore(report: StoredFeedbackReport): number | null {
  const value = report.payload.impactScore;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreToBand(score: number): RefinedImpactAssessment['band'] {
  if (score >= 85) {
    return 'critical';
  }
  if (score >= 65) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

export async function resolveRefinedImpactAssessment(input: {
  report: StoredFeedbackReport;
  repository?: string | null;
  policy?: StoredWorkspaceTriagePolicy | null;
  embedding?: number[];
  loadNearestNeighbors?: (embedding: number[], limit: number) => Promise<Array<{ feedbackReportId: string; distance: number }>>;
  loadReportById?: (reportId: string) => Promise<StoredFeedbackReport | null>;
  loadIssueLinkByReportId: (reportId: string) => Promise<StoredGitHubIssueLink | null>;
  loadTasksByReportId: (reportId: string) => Promise<StoredAgentTask[]>;
  loadExecutionsByTaskId: (agentTaskId: string) => Promise<StoredAgentTaskExecution[]>;
  loadPullRequestByExecutionId: (executionId: string) => Promise<StoredAgentTaskExecutionPullRequest | null>;
  limit?: number;
}): Promise<RefinedImpactAssessment> {
  const baseScore = readStoredImpactScore(input.report)
    ?? computeInitialImpactScore({
      source: input.report.source,
      breadth: 1,
      frequency: 1,
      ...(input.report.severity !== 'unknown' ? { severity: input.report.severity } : {})
    });

  const similar = input.embedding && input.loadNearestNeighbors && input.loadReportById
    ? await resolveSimilarReports({
      report: input.report,
      embedding: input.embedding,
      loadNearestNeighbors: input.loadNearestNeighbors,
      loadReportById: input.loadReportById,
      loadIssueLinkByReportId: input.loadIssueLinkByReportId,
      ...(typeof input.limit === 'number' ? { limit: input.limit } : {})
    })
    : { candidates: [] };

  const ownership = await resolveOwnershipCandidates({
    report: input.report,
    ...(input.repository ? { repository: input.repository } : {}),
    ...(input.policy ? { policy: input.policy } : {}),
    ...(input.embedding && input.loadNearestNeighbors && input.loadReportById
      ? {
        embedding: input.embedding,
        loadNearestNeighbors: input.loadNearestNeighbors,
        loadReportById: input.loadReportById,
        ...(typeof input.limit === 'number' ? { limit: input.limit } : {})
      }
      : {})
  });

  const history = await resolveReportHistory({
    report: input.report,
    ...(input.embedding && input.loadNearestNeighbors && input.loadReportById
      ? {
        embedding: input.embedding,
        loadNearestNeighbors: input.loadNearestNeighbors,
        loadReportById: input.loadReportById,
        ...(typeof input.limit === 'number' ? { limit: input.limit } : {})
      }
      : {}),
    loadIssueLinkByReportId: input.loadIssueLinkByReportId,
    loadTasksByReportId: input.loadTasksByReportId,
    loadExecutionsByTaskId: input.loadExecutionsByTaskId,
    loadPullRequestByExecutionId: input.loadPullRequestByExecutionId
  });

  const similarReports = [input.report, ...(await Promise.all(
    similar.candidates.map(async (candidate) => input.loadReportById ? input.loadReportById(candidate.reportId) : null)
  )).filter((report): report is StoredFeedbackReport => Boolean(report))];

  const uniqueSources = new Set(similarReports.map((report) => report.source));
  const uniqueReporters = new Set(
    similarReports
      .map((report) => report.reporterIdentifier)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  );

  const recurrenceCount = similar.candidates.filter((candidate) => candidate.combinedScore >= 0.45).length;
  const breadthEstimate = Math.max(uniqueSources.size, uniqueReporters.size, ownership.candidates.length);

  const recurrenceBoost = Math.min(
    (recurrenceCount * 6)
      + (history.summary.relatedIssueCount * 2)
      + (history.summary.mergedPullRequestCount * 4),
    30
  );
  const breadthBoost = Math.min(
    (Math.max(uniqueSources.size - 1, 0) * 5)
      + (Math.max(uniqueReporters.size - 1, 0) * 4)
      + (Math.min(ownership.candidates.length, 4) * 3),
    20
  );
  const historyBoost = Math.min(
    (history.summary.relatedPullRequestCount * 3) + history.summary.relatedIssueCount,
    15
  );

  const priorityPolicy = evaluatePriorityPolicyRules({
    policy: input.policy ?? null,
    report: input.report,
    repository: input.repository,
    ownerLabels: ownership.candidates.map((candidate) => candidate.label)
  });

  const score = Math.max(0, Math.min(100, Math.round(baseScore + recurrenceBoost + breadthBoost + historyBoost + priorityPolicy.delta)));

  return {
    score,
    band: scoreToBand(score),
    factors: {
      baseScore,
      recurrenceCount,
      breadthEstimate,
      relatedIssueCount: history.summary.relatedIssueCount,
      relatedPullRequestCount: history.summary.relatedPullRequestCount,
      mergedPullRequestCount: history.summary.mergedPullRequestCount,
      uniqueSourceCount: uniqueSources.size,
      uniqueReporterCount: uniqueReporters.size,
      ownerCandidateCount: ownership.candidates.length,
      policyDelta: priorityPolicy.delta
    },
    reasons: [
      `base score ${baseScore}`,
      `recurrence boost ${recurrenceBoost} from ${recurrenceCount} similar reports and ${history.summary.relatedIssueCount} related issues`,
      `breadth boost ${breadthBoost} from ${uniqueSources.size} sources, ${uniqueReporters.size} reporters, and ${ownership.candidates.length} owner candidates`,
      `history boost ${historyBoost} from ${history.summary.relatedPullRequestCount} related pull requests`,
      ...(priorityPolicy.matches.length > 0
        ? priorityPolicy.matches.map((match) => `${match.reason} (${match.scoreDelta >= 0 ? '+' : ''}${match.scoreDelta})`)
        : [])
    ]
  };
}