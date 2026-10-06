import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskExecution, StoredAgentTaskExecutionTimelineEvent } from '../types/agent-tasks.js';

export interface AgentTaskExecutionRepository {
  create(execution: StoredAgentTaskExecution): Promise<void>;
  updateProcessingJobId(id: string, processingJobId: string): Promise<void>;
  update(execution: StoredAgentTaskExecution): Promise<void>;
  findById(id: string): Promise<StoredAgentTaskExecution | null>;
  findByTaskId(agentTaskId: string): Promise<StoredAgentTaskExecution[]>;
  findBranchCleanupCandidates(input: {
    ttlHours: number;
    maxItems: number;
    branchPrefix?: string;
  }): Promise<BranchCleanupCandidateRecord[]>;
}

export interface BranchCleanupCandidateRecord {
  executionId: string;
  agentTaskId: string;
  targetRepository: string;
  branchName: string;
  baseBranch: string;
  status: StoredAgentTaskExecution['status'];
  completedAt: string;
}

interface AgentTaskExecutionRow {
  id: string;
  agent_task_id: string;
  processing_job_id: string | null;
  status: StoredAgentTaskExecution['status'];
  branch_name: string | null;
  base_branch: string | null;
  worktree_path: string | null;
  correlation_id: string | null;
  telemetry: Record<string, unknown> | null;
  execution_timeline: Array<Record<string, unknown>> | null;
  result_summary: Record<string, unknown>;
  findings: string[];
  patch_summary: string | null;
  pull_request_url: string | null;
  validation_evidence: Record<string, unknown>;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface BranchCleanupCandidateRow {
  execution_id: string;
  agent_task_id: string;
  target_repository: string;
  branch_name: string;
  base_branch: string;
  status: StoredAgentTaskExecution['status'];
  completed_at: string;
}

function mapRow(row: AgentTaskExecutionRow): StoredAgentTaskExecution {
  return {
    id: row.id,
    agentTaskId: row.agent_task_id,
    status: row.status,
    resultSummary: row.result_summary,
    findings: row.findings,
    validationEvidence: row.validation_evidence,
    ...(row.processing_job_id ? { processingJobId: row.processing_job_id } : {}),
    ...(row.branch_name ? { branchName: row.branch_name } : {}),
    ...(row.base_branch ? { baseBranch: row.base_branch } : {}),
    ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.telemetry && Object.keys(row.telemetry).length > 0 ? { telemetry: row.telemetry as Record<string, unknown> } : {}),
    ...(row.execution_timeline && row.execution_timeline.length > 0 ? { executionTimeline: row.execution_timeline as unknown as StoredAgentTaskExecutionTimelineEvent[] } : {}),
    ...(row.patch_summary ? { patchSummary: row.patch_summary } : {}),
    ...(row.pull_request_url ? { pullRequestUrl: row.pull_request_url } : {}),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {})
  };
}

export function createAgentTaskExecutionRepository(database: DatabaseClient): AgentTaskExecutionRepository {
  return {
    async create(execution) {
      await database.query(
        `INSERT INTO agent_task_executions (
          id,
          agent_task_id,
          processing_job_id,
          status,
          branch_name,
          base_branch,
          worktree_path,
          correlation_id,
          telemetry,
          execution_timeline,
          result_summary,
          findings,
          patch_summary,
          pull_request_url,
          validation_evidence,
          failure_reason,
          started_at,
          completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb, $16, $17, $18)`,
        [
          execution.id,
          execution.agentTaskId,
          execution.processingJobId ?? null,
          execution.status,
          execution.branchName ?? null,
          execution.baseBranch ?? null,
          execution.worktreePath ?? null,
          execution.correlationId ?? null,
          JSON.stringify(execution.telemetry ?? {}),
          JSON.stringify(execution.executionTimeline ?? []),
          JSON.stringify(execution.resultSummary),
          JSON.stringify(execution.findings),
          execution.patchSummary ?? null,
          execution.pullRequestUrl ?? null,
          JSON.stringify(execution.validationEvidence),
          execution.failureReason ?? null,
          execution.startedAt ?? null,
          execution.completedAt ?? null
        ]
      );
    },
    async updateProcessingJobId(id, processingJobId) {
      await database.query(
        `UPDATE agent_task_executions
         SET processing_job_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, processingJobId]
      );
    },
    async update(execution) {
      await database.query(
        `UPDATE agent_task_executions
         SET status = $2,
             branch_name = $3,
             base_branch = $4,
             worktree_path = $5,
             correlation_id = $6,
             telemetry = $7::jsonb,
             execution_timeline = $8::jsonb,
             result_summary = $9::jsonb,
             findings = $10::jsonb,
             patch_summary = $11,
             pull_request_url = $12,
             validation_evidence = $13::jsonb,
             failure_reason = $14,
             started_at = $15,
             completed_at = $16,
             updated_at = NOW()
         WHERE id = $1`,
        [
          execution.id,
          execution.status,
          execution.branchName ?? null,
          execution.baseBranch ?? null,
          execution.worktreePath ?? null,
          execution.correlationId ?? null,
          JSON.stringify(execution.telemetry ?? {}),
          JSON.stringify(execution.executionTimeline ?? []),
          JSON.stringify(execution.resultSummary),
          JSON.stringify(execution.findings),
          execution.patchSummary ?? null,
          execution.pullRequestUrl ?? null,
          JSON.stringify(execution.validationEvidence),
          execution.failureReason ?? null,
          execution.startedAt ?? null,
          execution.completedAt ?? null
        ]
      );
    },
    async findById(id) {
      const result = await database.query<AgentTaskExecutionRow>(
        `SELECT id, agent_task_id, processing_job_id, status, branch_name, base_branch, worktree_path,
                correlation_id, telemetry, execution_timeline, result_summary, findings, patch_summary,
                pull_request_url, validation_evidence, failure_reason, started_at, completed_at
         FROM agent_task_executions
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByTaskId(agentTaskId) {
      const result = await database.query<AgentTaskExecutionRow>(
        `SELECT id, agent_task_id, processing_job_id, status, branch_name, base_branch, worktree_path,
                correlation_id, telemetry, execution_timeline, result_summary, findings, patch_summary,
                pull_request_url, validation_evidence, failure_reason, started_at, completed_at
         FROM agent_task_executions
         WHERE agent_task_id = $1
         ORDER BY created_at DESC`,
        [agentTaskId]
      );

      return result.rows.map(mapRow);
    },
    async findBranchCleanupCandidates(input) {
      const pattern = `${input.branchPrefix ?? 'feature/bot'}/%`;
      const result = await database.query<BranchCleanupCandidateRow>(
        `SELECT
           e.id AS execution_id,
           e.agent_task_id,
           t.target_repository,
           e.branch_name,
           e.base_branch,
           e.status,
           to_char(e.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS completed_at
         FROM agent_task_executions e
         JOIN agent_tasks t ON t.id = e.agent_task_id
         WHERE e.branch_name LIKE $1
           AND e.base_branch IS NOT NULL
           AND e.completed_at IS NOT NULL
           AND e.status IN ('completed', 'failed', 'cancelled')
           AND e.completed_at < (NOW() - (($2::text || ' hours')::interval))
         ORDER BY e.completed_at ASC
         LIMIT $3`,
        [pattern, input.ttlHours, input.maxItems]
      );

      return result.rows.map((row) => ({
        executionId: row.execution_id,
        agentTaskId: row.agent_task_id,
        targetRepository: row.target_repository,
        branchName: row.branch_name,
        baseBranch: row.base_branch,
        status: row.status,
        completedAt: row.completed_at
      }));
    }
  };
}