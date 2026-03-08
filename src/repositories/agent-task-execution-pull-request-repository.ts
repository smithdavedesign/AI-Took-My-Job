import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskExecutionPullRequest } from '../types/agent-tasks.js';

export interface AgentTaskExecutionPullRequestRepository {
  upsert(record: StoredAgentTaskExecutionPullRequest): Promise<void>;
  findByExecutionId(executionId: string): Promise<StoredAgentTaskExecutionPullRequest | null>;
}

interface AgentTaskExecutionPullRequestRow {
  id: string;
  agent_task_execution_id: string;
  repository: string;
  head_branch: string;
  base_branch: string;
  head_commit_sha: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  draft: boolean;
  status: StoredAgentTaskExecutionPullRequest['status'];
  promoted_by: string | null;
  promoted_at: string | null;
  merged_by: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  metadata: Record<string, unknown>;
}

function mapRow(row: AgentTaskExecutionPullRequestRow): StoredAgentTaskExecutionPullRequest {
  return {
    id: row.id,
    agentTaskExecutionId: row.agent_task_execution_id,
    repository: row.repository,
    headBranch: row.head_branch,
    baseBranch: row.base_branch,
    draft: row.draft,
    status: row.status,
    metadata: row.metadata,
    ...(row.head_commit_sha ? { headCommitSha: row.head_commit_sha } : {}),
    ...(typeof row.pull_request_number === 'number' ? { pullRequestNumber: row.pull_request_number } : {}),
    ...(row.pull_request_url ? { pullRequestUrl: row.pull_request_url } : {}),
    ...(row.promoted_by ? { promotedBy: row.promoted_by } : {}),
    ...(row.promoted_at ? { promotedAt: row.promoted_at } : {}),
    ...(row.merged_by ? { mergedBy: row.merged_by } : {}),
    ...(row.merged_at ? { mergedAt: row.merged_at } : {}),
    ...(row.merge_commit_sha ? { mergeCommitSha: row.merge_commit_sha } : {})
  };
}

export function createAgentTaskExecutionPullRequestRepository(database: DatabaseClient): AgentTaskExecutionPullRequestRepository {
  return {
    async upsert(record) {
      await database.query(
        `INSERT INTO agent_task_execution_pull_requests (
          id,
          agent_task_execution_id,
          repository,
          head_branch,
          base_branch,
          head_commit_sha,
          pull_request_number,
          pull_request_url,
          draft,
          status,
          promoted_by,
          promoted_at,
          merged_by,
          merged_at,
          merge_commit_sha,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (agent_task_execution_id)
        DO UPDATE SET
          repository = EXCLUDED.repository,
          head_branch = EXCLUDED.head_branch,
          base_branch = EXCLUDED.base_branch,
          head_commit_sha = EXCLUDED.head_commit_sha,
          pull_request_number = EXCLUDED.pull_request_number,
          pull_request_url = EXCLUDED.pull_request_url,
          draft = EXCLUDED.draft,
          status = EXCLUDED.status,
          promoted_by = EXCLUDED.promoted_by,
          promoted_at = EXCLUDED.promoted_at,
          merged_by = EXCLUDED.merged_by,
          merged_at = EXCLUDED.merged_at,
          merge_commit_sha = EXCLUDED.merge_commit_sha,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()`,
        [
          record.id,
          record.agentTaskExecutionId,
          record.repository,
          record.headBranch,
          record.baseBranch,
          record.headCommitSha ?? null,
          record.pullRequestNumber ?? null,
          record.pullRequestUrl ?? null,
          record.draft,
          record.status,
          record.promotedBy ?? null,
          record.promotedAt ?? null,
          record.mergedBy ?? null,
          record.mergedAt ?? null,
          record.mergeCommitSha ?? null,
          JSON.stringify(record.metadata)
        ]
      );
    },
    async findByExecutionId(executionId) {
      const result = await database.query<AgentTaskExecutionPullRequestRow>(
        `SELECT id, agent_task_execution_id, repository, head_branch, base_branch, head_commit_sha,
                pull_request_number, pull_request_url, draft, status, promoted_by, promoted_at,
                merged_by, merged_at, merge_commit_sha, metadata
         FROM agent_task_execution_pull_requests
         WHERE agent_task_execution_id = $1`,
        [executionId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}