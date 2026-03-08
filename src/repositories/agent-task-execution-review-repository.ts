import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskExecutionReview } from '../types/agent-tasks.js';

export interface AgentTaskExecutionReviewRepository {
  upsert(review: StoredAgentTaskExecutionReview): Promise<void>;
  findByExecutionId(executionId: string): Promise<StoredAgentTaskExecutionReview | null>;
}

interface AgentTaskExecutionReviewRow {
  id: string;
  agent_task_execution_id: string;
  status: StoredAgentTaskExecutionReview['status'];
  reviewer_id: string | null;
  notes: string | null;
  reviewed_at: string | null;
}

function mapRow(row: AgentTaskExecutionReviewRow): StoredAgentTaskExecutionReview {
  return {
    id: row.id,
    agentTaskExecutionId: row.agent_task_execution_id,
    status: row.status,
    ...(row.reviewer_id ? { reviewerId: row.reviewer_id } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {})
  };
}

export function createAgentTaskExecutionReviewRepository(database: DatabaseClient): AgentTaskExecutionReviewRepository {
  return {
    async upsert(review) {
      await database.query(
        `INSERT INTO agent_task_execution_reviews (
          id,
          agent_task_execution_id,
          status,
          reviewer_id,
          notes,
          reviewed_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (agent_task_execution_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          reviewer_id = EXCLUDED.reviewer_id,
          notes = EXCLUDED.notes,
          reviewed_at = EXCLUDED.reviewed_at,
          updated_at = NOW()`,
        [
          review.id,
          review.agentTaskExecutionId,
          review.status,
          review.reviewerId ?? null,
          review.notes ?? null,
          review.reviewedAt ?? null
        ]
      );
    },
    async findByExecutionId(executionId) {
      const result = await database.query<AgentTaskExecutionReviewRow>(
        `SELECT id, agent_task_execution_id, status, reviewer_id, notes, reviewed_at
         FROM agent_task_execution_reviews
         WHERE agent_task_execution_id = $1`,
        [executionId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}