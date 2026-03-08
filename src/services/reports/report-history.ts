import type { StoredAgentTask, StoredAgentTaskExecution, StoredAgentTaskExecutionPullRequest } from '../../types/agent-tasks.js';
import type { StoredGitHubIssueLink } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

import { resolveSimilarReports } from './similar-reports.js';

export interface ReportHistoryIssueLink {
  reportId: string;
  repository: string;
  state: StoredGitHubIssueLink['state'];
  draftTitle: string;
  source: 'current-report' | 'similar-report';
  issueNumber?: number;
  issueUrl?: string;
  similarityScore?: number;
  reasons?: string[];
}

export interface ReportHistoryPullRequestLink {
  reportId: string;
  executionId: string;
  repository: string;
  headBranch: string;
  baseBranch: string;
  status: StoredAgentTaskExecutionPullRequest['status'];
  source: 'current-report' | 'similar-report';
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  mergeCommitSha?: string;
  mergedAt?: string;
  similarityScore?: number;
  reasons?: string[];
}

export interface ReportHistoryResolution {
  summary: {
    relatedIssueCount: number;
    relatedPullRequestCount: number;
    mergedPullRequestCount: number;
    similarReportCount: number;
  };
  relatedIssues: ReportHistoryIssueLink[];
  relatedPullRequests: ReportHistoryPullRequestLink[];
}

export async function resolveReportHistory(input: {
  report: StoredFeedbackReport;
  embedding?: number[];
  loadNearestNeighbors?: (embedding: number[], limit: number) => Promise<Array<{ feedbackReportId: string; distance: number }>>;
  loadReportById?: (reportId: string) => Promise<StoredFeedbackReport | null>;
  loadIssueLinkByReportId: (reportId: string) => Promise<StoredGitHubIssueLink | null>;
  loadTasksByReportId: (reportId: string) => Promise<StoredAgentTask[]>;
  loadExecutionsByTaskId: (agentTaskId: string) => Promise<StoredAgentTaskExecution[]>;
  loadPullRequestByExecutionId: (executionId: string) => Promise<StoredAgentTaskExecutionPullRequest | null>;
  limit?: number;
}): Promise<ReportHistoryResolution> {
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

  const relatedIssues: ReportHistoryIssueLink[] = [];
  const relatedPullRequests: ReportHistoryPullRequestLink[] = [];

  const candidateMetadata = new Map(similar.candidates.map((candidate) => [candidate.reportId, candidate]));
  const relatedReportIds = [
    input.report.id,
    ...similar.candidates.map((candidate) => candidate.reportId)
  ];

  for (const relatedReportId of relatedReportIds) {
    const candidate = candidateMetadata.get(relatedReportId);
    const source: 'current-report' | 'similar-report' = relatedReportId === input.report.id ? 'current-report' : 'similar-report';

    const issueLink = await input.loadIssueLinkByReportId(relatedReportId);
    if (issueLink) {
      relatedIssues.push({
        reportId: relatedReportId,
        repository: issueLink.repository,
        state: issueLink.state,
        draftTitle: issueLink.draftTitle,
        source,
        ...(typeof issueLink.issueNumber === 'number' ? { issueNumber: issueLink.issueNumber } : {}),
        ...(issueLink.issueUrl ? { issueUrl: issueLink.issueUrl } : {}),
        ...(candidate ? { similarityScore: candidate.combinedScore, reasons: candidate.reasons } : {})
      });
    }

    const tasks = await input.loadTasksByReportId(relatedReportId);
    for (const task of tasks) {
      const executions = await input.loadExecutionsByTaskId(task.id);
      for (const execution of executions) {
        const pullRequest = await input.loadPullRequestByExecutionId(execution.id);
        if (!pullRequest) {
          continue;
        }

        relatedPullRequests.push({
          reportId: relatedReportId,
          executionId: execution.id,
          repository: pullRequest.repository,
          headBranch: pullRequest.headBranch,
          baseBranch: pullRequest.baseBranch,
          status: pullRequest.status,
          source,
          ...(typeof pullRequest.pullRequestNumber === 'number' ? { pullRequestNumber: pullRequest.pullRequestNumber } : {}),
          ...(pullRequest.pullRequestUrl ? { pullRequestUrl: pullRequest.pullRequestUrl } : {}),
          ...(pullRequest.mergeCommitSha ? { mergeCommitSha: pullRequest.mergeCommitSha } : {}),
          ...(pullRequest.mergedAt ? { mergedAt: pullRequest.mergedAt } : {}),
          ...(candidate ? { similarityScore: candidate.combinedScore, reasons: candidate.reasons } : {})
        });
      }
    }
  }

  relatedIssues.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === 'current-report' ? -1 : 1;
    }

    return (right.similarityScore ?? 0) - (left.similarityScore ?? 0);
  });

  relatedPullRequests.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === 'current-report' ? -1 : 1;
    }

    const leftTimestamp = left.mergedAt ?? '';
    const rightTimestamp = right.mergedAt ?? '';
    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp.localeCompare(leftTimestamp);
    }

    return (right.similarityScore ?? 0) - (left.similarityScore ?? 0);
  });

  return {
    summary: {
      relatedIssueCount: relatedIssues.length,
      relatedPullRequestCount: relatedPullRequests.length,
      mergedPullRequestCount: relatedPullRequests.filter((pullRequest) => pullRequest.status === 'merged').length,
      similarReportCount: similar.candidates.length
    },
    relatedIssues,
    relatedPullRequests
  };
}