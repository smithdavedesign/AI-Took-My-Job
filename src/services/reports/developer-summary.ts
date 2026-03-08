import type { StoredReplayRun } from '../../types/replay.js';

function normalizeCandidates(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
}

export function buildDeveloperSummary(input: {
  ownershipCandidates?: unknown;
  similarCandidates?: unknown;
  duplicateCandidates?: unknown;
  replay?: StoredReplayRun | null;
  impactScore?: number | null;
  agentTaskCount?: number;
}): Record<string, unknown> {
  const ownershipCandidates = normalizeCandidates(input.ownershipCandidates);
  const similarCandidates = normalizeCandidates(input.similarCandidates);
  const duplicateCandidates = normalizeCandidates(input.duplicateCandidates);
  const highConfidenceDuplicates = duplicateCandidates.filter((candidate) => candidate.confidence === 'high');
  const topOwner = ownershipCandidates[0];
  const replayStatus = input.replay?.status ?? 'not-run';
  const replayExecutionStatus = input.replay?.replayPlan?.execution?.status ?? null;
  const matchedFailingStepCount = Array.isArray(input.replay?.replayPlan?.execution?.matchedFailingStepOrders)
    ? input.replay?.replayPlan?.execution?.matchedFailingStepOrders.length
    : 0;

  let nextAction = 'inspect-report-context';
  if (replayStatus === 'processing') {
    nextAction = 'wait-for-replay';
  } else if (highConfidenceDuplicates.length > 0) {
    nextAction = 'reuse-existing-issue';
  } else if (replayExecutionStatus === 'reproduced') {
    nextAction = 'prepare-fix-work';
  } else if (replayExecutionStatus === 'not-reproduced') {
    nextAction = 'review-environment-drift';
  }

  return {
    topOwner: typeof topOwner?.label === 'string' ? topOwner.label : null,
    ownerCandidateCount: ownershipCandidates.length,
    similarReportCount: similarCandidates.length,
    duplicateCandidateCount: duplicateCandidates.length,
    highConfidenceDuplicateCount: highConfidenceDuplicates.length,
    replayStatus,
    replayExecutionStatus,
    matchedFailingStepCount,
    impactScore: input.impactScore ?? null,
    agentTaskCount: input.agentTaskCount ?? 0,
    nextAction
  };
}