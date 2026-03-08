import type {
  StoredAgentTask,
  StoredAgentTaskExecution,
  StoredAgentTaskExecutionPullRequest,
  StoredAgentTaskExecutionReview,
  StoredAgentTaskValidationPolicy
} from '../../types/agent-tasks.js';

type GateStatus = 'passed' | 'failed' | 'pending' | 'not-run' | 'not-applicable' | 'blocked' | 'ready' | 'opened' | 'merged';

function buildReference(baseUrl: string | undefined, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function hasExecutionChanges(execution: StoredAgentTaskExecution): boolean {
  if (typeof execution.resultSummary.commitSha === 'string' && execution.resultSummary.commitSha.length > 0) {
    return true;
  }

  return ['changes-generated', 'validated', 'pr-opened'].includes(execution.status);
}

export function buildExecutionCloseout(input: {
  baseUrl?: string;
  task: StoredAgentTask;
  execution: StoredAgentTaskExecution;
  review: StoredAgentTaskExecutionReview | null;
  pullRequest: StoredAgentTaskExecutionPullRequest | null;
  validationPolicy: StoredAgentTaskValidationPolicy | null;
  githubPromotionEnabled: boolean;
}): Record<string, unknown> {
  const validationEvidence = toObject(input.execution.validationEvidence);
  const resultSummary = toObject(input.execution.resultSummary);
  const replayValidation = toObject(validationEvidence.replayValidation);
  const contract = toObject(validationEvidence.agentOutputContract);
  const hasChanges = hasExecutionChanges(input.execution);
  const validationStatus = typeof resultSummary.validationStatus === 'string'
    ? resultSummary.validationStatus
    : 'not-run';
  const contractStatus = typeof resultSummary.contractStatus === 'string'
    ? resultSummary.contractStatus
    : 'not-run';
  const replayStatus = typeof replayValidation.status === 'string'
    ? replayValidation.status
    : 'not-run';
  const replayContext = toObject(input.task.preparedContext.replay);
  const replayRequired = Object.keys(replayContext).length > 0;
  const reviewStatus = input.review?.status ?? (hasChanges ? 'pending' : 'not-applicable');
  const reportedChangedFiles = toStringArray(contract.reportedChangedFiles);
  const actualChangedFiles = toStringArray(contract.actualChangedFiles);
  const contractWarnings = toStringArray(contract.warnings);

  const blockers: string[] = [];
  if (input.execution.status === 'failed') {
    blockers.push(typeof input.execution.failureReason === 'string' && input.execution.failureReason.length > 0
      ? input.execution.failureReason
      : 'Execution failed before closeout criteria were satisfied.');
  }

  if (input.execution.status === 'cancelled') {
    blockers.push('Execution was cancelled before closeout criteria were satisfied.');
  }

  if (hasChanges && contractStatus === 'failed') {
    blockers.push('Agent output contract does not match the repository changes.');
  }

  if (hasChanges && validationStatus === 'failed') {
    blockers.push('One or more requested validations failed.');
  }

  if (hasChanges && replayRequired && replayStatus !== 'passed') {
    blockers.push('Replay-backed validation must pass before promotion when replay evidence exists.');
  }

  if (hasChanges && reviewStatus !== 'approved') {
    blockers.push(reviewStatus === 'rejected'
      ? 'Human review rejected this execution.'
      : 'Human review approval is still required.');
  }

  if (hasChanges && input.githubPromotionEnabled && !input.execution.baseBranch && !input.pullRequest) {
    blockers.push('A usable base branch is required before GitHub promotion.');
  }

  const promotable = hasChanges
    && input.githubPromotionEnabled
    && !input.pullRequest
    && reviewStatus === 'approved'
    && validationStatus !== 'failed'
    && (!replayRequired || replayStatus === 'passed')
    && contractStatus !== 'failed'
    && Boolean(input.execution.baseBranch);

  const mergeable = input.pullRequest?.status === 'opened' && input.githubPromotionEnabled && reviewStatus === 'approved';

  let promotionStatus: GateStatus;
  if (!hasChanges || !input.githubPromotionEnabled) {
    promotionStatus = 'not-applicable';
  } else if (input.pullRequest?.status === 'opened') {
    promotionStatus = 'opened';
  } else if (input.pullRequest?.status === 'merged') {
    promotionStatus = 'merged';
  } else if (input.pullRequest?.status === 'promotion-failed') {
    promotionStatus = 'failed';
  } else if (promotable) {
    promotionStatus = 'ready';
  } else {
    promotionStatus = 'blocked';
  }

  let mergeStatus: GateStatus;
  if (!input.githubPromotionEnabled || !hasChanges) {
    mergeStatus = 'not-applicable';
  } else if (input.pullRequest?.status === 'merged') {
    mergeStatus = 'merged';
  } else if (input.pullRequest?.status === 'merge-failed') {
    mergeStatus = 'failed';
  } else if (mergeable) {
    mergeStatus = 'ready';
  } else if (input.pullRequest?.status === 'opened') {
    mergeStatus = 'blocked';
  } else {
    mergeStatus = 'not-applicable';
  }

  const closeoutStatus = input.pullRequest?.status === 'merged'
    ? 'completed'
    : mergeable
      ? 'ready-for-merge'
      : promotable
        ? 'ready-for-promotion'
        : ['failed', 'cancelled'].includes(input.execution.status)
          ? 'blocked'
        : blockers.length > 0
          ? 'blocked'
          : 'in-review';

  return {
    executionId: input.execution.id,
    agentTaskId: input.task.id,
    reportId: input.task.feedbackReportId,
    targetRepository: input.task.targetRepository,
    executionStatus: input.execution.status,
    closeoutStatus,
    outcome: typeof resultSummary.outcome === 'string' ? resultSummary.outcome : null,
    nextAction: typeof resultSummary.nextAction === 'string' ? resultSummary.nextAction : null,
    promotable,
    mergeable,
    blockers,
    contract: {
      status: contractStatus,
      version: typeof contract.contractVersion === 'string' ? contract.contractVersion : null,
      reportedOutcome: typeof contract.reportedOutcome === 'string' ? contract.reportedOutcome : null,
      reportedChangedFiles,
      actualChangedFiles,
      warnings: contractWarnings
    },
    gates: {
      agentOutputContract: {
        status: contractStatus,
        warningCount: contractWarnings.length
      },
      validation: {
        status: validationStatus,
        policyStatus: input.validationPolicy?.status ?? 'not-run'
      },
      replayValidation: {
        status: replayStatus,
        required: replayRequired,
        expectation: typeof replayValidation.expectation === 'string' ? replayValidation.expectation : null
      },
      review: {
        status: reviewStatus,
        reviewerId: input.review?.reviewerId ?? null,
        reviewedAt: input.review?.reviewedAt ?? null
      },
      promotion: {
        status: promotionStatus,
        pullRequestStatus: input.pullRequest?.status ?? null
      },
      merge: {
        status: mergeStatus,
        pullRequestStatus: input.pullRequest?.status ?? null
      }
    },
    evidenceReferences: {
      execution: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}`),
      artifacts: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/artifacts`),
      closeout: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/closeout`),
      replayValidation: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/replay-validation`),
      validationPolicy: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/validation-policy`),
      review: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/review`),
      pullRequest: buildReference(input.baseUrl, `/internal/agent-task-executions/${input.execution.id}/pull-request`)
    }
  };
}