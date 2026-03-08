import type { StoredGitHubIssueLink } from '../../types/issues.js';
import type { StoredFeedbackReport } from '../../types/reports.js';

export interface SimilarReportCandidate {
  reportId: string;
  source: StoredFeedbackReport['source'];
  severity: StoredFeedbackReport['severity'];
  title: string | null;
  distance: number;
  heuristicScore: number;
  combinedScore: number;
  reasons: string[];
  issueUrl?: string;
  issueNumber?: number;
}

export interface SimilarReportResolution {
  candidates: SimilarReportCandidate[];
}

function tokenize(value: string | undefined): Set<string> {
  if (!value) {
    return new Set<string>();
  }

  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2)
  );
}

function jaccardScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function severityScore(left: StoredFeedbackReport['severity'], right: StoredFeedbackReport['severity']): number {
  return left === right ? 0.2 : 0;
}

function sourceScore(left: StoredFeedbackReport['source'], right: StoredFeedbackReport['source']): number {
  return left === right ? 0.15 : 0;
}

function externalIdScore(left?: string, right?: string): number {
  if (!left || !right) {
    return 0;
  }

  return left === right ? 0.5 : 0;
}

function embeddingScore(distance: number): number {
  return Math.max(0, 1 - Math.min(distance, 1.5) / 1.5);
}

export async function resolveSimilarReports(input: {
  report: StoredFeedbackReport;
  embedding: number[];
  loadNearestNeighbors: (embedding: number[], limit: number) => Promise<Array<{ feedbackReportId: string; distance: number }>>;
  loadReportById: (reportId: string) => Promise<StoredFeedbackReport | null>;
  loadIssueLinkByReportId?: (reportId: string) => Promise<StoredGitHubIssueLink | null>;
  limit?: number;
}): Promise<SimilarReportResolution> {
  const nearest = await input.loadNearestNeighbors(input.embedding, (input.limit ?? 5) + 1);
  const currentTitleTokens = tokenize(input.report.title);
  const candidates: SimilarReportCandidate[] = [];

  for (const neighbor of nearest) {
    if (neighbor.feedbackReportId === input.report.id) {
      continue;
    }

    const report = await input.loadReportById(neighbor.feedbackReportId);
    if (!report) {
      continue;
    }

    const titleTokens = tokenize(report.title);
    const titleSimilarity = jaccardScore(currentTitleTokens, titleTokens);
    const heuristicScore = Number((
      titleSimilarity
      + severityScore(input.report.severity, report.severity)
      + sourceScore(input.report.source, report.source)
      + externalIdScore(input.report.externalId, report.externalId)
    ).toFixed(4));
    const combinedScore = Number(((embeddingScore(neighbor.distance) * 0.7) + (heuristicScore * 0.3)).toFixed(4));

    const reasons: string[] = [
      `embedding distance ${neighbor.distance.toFixed(4)}`
    ];
    if (titleSimilarity > 0) {
      reasons.push(`title similarity ${titleSimilarity.toFixed(4)}`);
    }
    if (input.report.severity === report.severity) {
      reasons.push(`same severity ${report.severity}`);
    }
    if (input.report.source === report.source) {
      reasons.push(`same source ${report.source}`);
    }
    if (input.report.externalId && report.externalId && input.report.externalId === report.externalId) {
      reasons.push('same external identifier');
    }

    const issueLink = input.loadIssueLinkByReportId
      ? await input.loadIssueLinkByReportId(report.id)
      : null;

    candidates.push({
      reportId: report.id,
      source: report.source,
      severity: report.severity,
      title: report.title ?? null,
      distance: Number(neighbor.distance.toFixed(4)),
      heuristicScore,
      combinedScore,
      reasons,
      ...(issueLink?.issueUrl ? { issueUrl: issueLink.issueUrl } : {}),
      ...(typeof issueLink?.issueNumber === 'number' ? { issueNumber: issueLink.issueNumber } : {})
    });
  }

  return {
    candidates: candidates
      .sort((left, right) => right.combinedScore - left.combinedScore)
      .slice(0, input.limit ?? 5)
  };
}