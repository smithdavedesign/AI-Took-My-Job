import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskReplayValidation } from '../types/agent-tasks.js';

export interface AgentTaskReplayValidationRepository {
  upsert(validation: StoredAgentTaskReplayValidation): Promise<void>;
  findByExecutionId(executionId: string): Promise<StoredAgentTaskReplayValidation | null>;
}

interface AgentTaskReplayValidationRow {
  id: string;
  agent_task_execution_id: string;
  replay_run_id: string | null;
  status: StoredAgentTaskReplayValidation['status'];
  expectation: StoredAgentTaskReplayValidation['expectation'];
  target_origin: string | null;
  baseline_status: StoredAgentTaskReplayValidation['baselineStatus'] | null;
  actual_status: StoredAgentTaskReplayValidation['actualStatus'] | null;
  baseline_summary: Record<string, unknown>;
  post_change_summary: Record<string, unknown>;
}

function mapRow(row: AgentTaskReplayValidationRow): StoredAgentTaskReplayValidation {
  return {
    id: row.id,
    agentTaskExecutionId: row.agent_task_execution_id,
    status: row.status,
    expectation: row.expectation,
    baselineSummary: row.baseline_summary,
    postChangeSummary: row.post_change_summary,
    ...(row.replay_run_id ? { replayRunId: row.replay_run_id } : {}),
    ...(row.target_origin ? { targetOrigin: row.target_origin } : {}),
    ...(row.baseline_status ? { baselineStatus: row.baseline_status } : {}),
    ...(row.actual_status ? { actualStatus: row.actual_status } : {})
  };
}

export function createAgentTaskReplayValidationRepository(database: DatabaseClient): AgentTaskReplayValidationRepository {
  return {
    async upsert(validation) {
      await database.query(
        `INSERT INTO agent_task_replay_validations (
          id,
          agent_task_execution_id,
          replay_run_id,
          status,
          expectation,
          target_origin,
          baseline_status,
          actual_status,
          baseline_summary,
          post_change_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
        ON CONFLICT (agent_task_execution_id)
        DO UPDATE SET
          replay_run_id = EXCLUDED.replay_run_id,
          status = EXCLUDED.status,
          expectation = EXCLUDED.expectation,
          target_origin = EXCLUDED.target_origin,
          baseline_status = EXCLUDED.baseline_status,
          actual_status = EXCLUDED.actual_status,
          baseline_summary = EXCLUDED.baseline_summary,
          post_change_summary = EXCLUDED.post_change_summary,
          updated_at = NOW()`,
        [
          validation.id,
          validation.agentTaskExecutionId,
          validation.replayRunId ?? null,
          validation.status,
          validation.expectation,
          validation.targetOrigin ?? null,
          validation.baselineStatus ?? null,
          validation.actualStatus ?? null,
          JSON.stringify(validation.baselineSummary),
          JSON.stringify(validation.postChangeSummary)
        ]
      );
    },
    async findByExecutionId(executionId) {
      const result = await database.query<AgentTaskReplayValidationRow>(
        `SELECT id, agent_task_execution_id, replay_run_id, status, expectation, target_origin,
                baseline_status, actual_status, baseline_summary, post_change_summary
         FROM agent_task_replay_validations
         WHERE agent_task_execution_id = $1`,
        [executionId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}