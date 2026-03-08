import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskExecution } from '../types/agent-tasks.js';

export interface AgentTaskExecutionRepository {
  create(execution: StoredAgentTaskExecution): Promise<void>;
  updateProcessingJobId(id: string, processingJobId: string): Promise<void>;
  update(execution: StoredAgentTaskExecution): Promise<void>;
  findById(id: string): Promise<StoredAgentTaskExecution | null>;
  findByTaskId(agentTaskId: string): Promise<StoredAgentTaskExecution[]>;
}

interface AgentTaskExecutionRow {
  id: string;
  agent_task_id: string;
  processing_job_id: string | null;
  status: StoredAgentTaskExecution['status'];
  branch_name: string | null;
  base_branch: string | null;
  worktree_path: string | null;
  result_summary: Record<string, unknown>;
  findings: string[];
  patch_summary: string | null;
  pull_request_url: string | null;
  validation_evidence: Record<string, unknown>;
  failure_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
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
          result_summary,
          findings,
          patch_summary,
          pull_request_url,
          validation_evidence,
          failure_reason,
          started_at,
          completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12::jsonb, $13, $14, $15)`,
        [
          execution.id,
          execution.agentTaskId,
          execution.processingJobId ?? null,
          execution.status,
          execution.branchName ?? null,
          execution.baseBranch ?? null,
          execution.worktreePath ?? null,
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
             result_summary = $6::jsonb,
             findings = $7::jsonb,
             patch_summary = $8,
             pull_request_url = $9,
             validation_evidence = $10::jsonb,
             failure_reason = $11,
             started_at = $12,
             completed_at = $13,
             updated_at = NOW()
         WHERE id = $1`,
        [
          execution.id,
          execution.status,
          execution.branchName ?? null,
          execution.baseBranch ?? null,
          execution.worktreePath ?? null,
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
                result_summary, findings, patch_summary, pull_request_url, validation_evidence,
                failure_reason, started_at, completed_at
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
                result_summary, findings, patch_summary, pull_request_url, validation_evidence,
                failure_reason, started_at, completed_at
         FROM agent_task_executions
         WHERE agent_task_id = $1
         ORDER BY created_at DESC`,
        [agentTaskId]
      );

      return result.rows.map(mapRow);
    }
  };
}