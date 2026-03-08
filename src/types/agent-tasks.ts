export interface StoredAgentTask {
  id: string;
  feedbackReportId: string;
  projectId?: string;
  processingJobId?: string;
  requestedBy: string;
  targetRepository: string;
  title: string;
  objective: string;
  executionMode: 'investigate' | 'fix';
  acceptanceCriteria: string[];
  contextNotes?: string;
  status: 'queued' | 'preparing' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
  preparedContext: Record<string, unknown>;
  failureReason?: string;
}

export interface StoredAgentTaskExecution {
  id: string;
  agentTaskId: string;
  processingJobId?: string;
  status: 'queued' | 'running' | 'changes-generated' | 'validated' | 'pr-opened' | 'completed' | 'failed' | 'cancelled';
  branchName?: string;
  baseBranch?: string;
  worktreePath?: string;
  resultSummary: Record<string, unknown>;
  findings: string[];
  patchSummary?: string;
  pullRequestUrl?: string;
  validationEvidence: Record<string, unknown>;
  failureReason?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface StoredAgentTaskReplayValidation {
  id: string;
  agentTaskExecutionId: string;
  replayRunId?: string;
  status: 'passed' | 'failed';
  expectation: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  targetOrigin?: string;
  baselineStatus?: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  actualStatus?: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  baselineSummary: Record<string, unknown>;
  postChangeSummary: Record<string, unknown>;
}

export interface StoredAgentTaskValidationPolicy {
  id: string;
  agentTaskExecutionId: string;
  policyName: string;
  status: 'passed' | 'failed';
  baselineRequirement: string;
  outcomeRequirement: string;
  baselineRequirementMet: boolean;
  outcomeRequirementMet: boolean;
  details: Record<string, unknown>;
}

export interface StoredAgentTaskExecutionReview {
  id: string;
  agentTaskExecutionId: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId?: string;
  notes?: string;
  reviewedAt?: string;
}

export interface StoredAgentTaskExecutionPullRequest {
  id: string;
  agentTaskExecutionId: string;
  repository: string;
  headBranch: string;
  baseBranch: string;
  headCommitSha?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  draft: boolean;
  status: 'opened' | 'promotion-failed' | 'merged' | 'merge-failed';
  promotedBy?: string;
  promotedAt?: string;
  mergedBy?: string;
  mergedAt?: string;
  mergeCommitSha?: string;
  metadata: Record<string, unknown>;
}