import type { BranchCleanupCandidateRecord } from '../../repositories/agent-task-execution-repository.js';

export interface BranchCleanupPlanItem {
  executionId: string;
  agentTaskId: string;
  targetRepository: string;
  branchName: string;
  baseBranch: string;
  status: BranchCleanupCandidateRecord['status'];
  completedAt: string;
  ageHours: number;
  reason: string;
}

export interface BranchCleanupPlan {
  scaffoldOnly: true;
  ttlHours: number;
  maxItems: number;
  candidates: BranchCleanupPlanItem[];
}

export function computeBranchCleanupPlan(input: {
  now: Date;
  ttlHours: number;
  maxItems: number;
  candidates: BranchCleanupCandidateRecord[];
}): BranchCleanupPlan {
  const planned = input.candidates
    .slice(0, input.maxItems)
    .map((candidate) => {
      const completedAt = new Date(candidate.completedAt);
      const ageHours = Math.max(0, (input.now.getTime() - completedAt.getTime()) / (1000 * 60 * 60));

      return {
        executionId: candidate.executionId,
        agentTaskId: candidate.agentTaskId,
        targetRepository: candidate.targetRepository,
        branchName: candidate.branchName,
        baseBranch: candidate.baseBranch,
        status: candidate.status,
        completedAt: candidate.completedAt,
        ageHours: Number(ageHours.toFixed(2)),
        reason: `completed branch older than ${input.ttlHours}h TTL`
      } satisfies BranchCleanupPlanItem;
    });

  return {
    scaffoldOnly: true,
    ttlHours: input.ttlHours,
    maxItems: input.maxItems,
    candidates: planned
  };
}
