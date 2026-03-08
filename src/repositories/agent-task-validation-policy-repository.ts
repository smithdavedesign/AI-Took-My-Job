import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTaskValidationPolicy } from '../types/agent-tasks.js';

export interface AgentTaskValidationPolicyRepository {
  upsert(policy: StoredAgentTaskValidationPolicy): Promise<void>;
  findByExecutionId(executionId: string): Promise<StoredAgentTaskValidationPolicy | null>;
}

interface AgentTaskValidationPolicyRow {
  id: string;
  agent_task_execution_id: string;
  policy_name: string;
  status: StoredAgentTaskValidationPolicy['status'];
  baseline_requirement: string;
  outcome_requirement: string;
  baseline_requirement_met: boolean;
  outcome_requirement_met: boolean;
  details: Record<string, unknown>;
}

function mapRow(row: AgentTaskValidationPolicyRow): StoredAgentTaskValidationPolicy {
  return {
    id: row.id,
    agentTaskExecutionId: row.agent_task_execution_id,
    policyName: row.policy_name,
    status: row.status,
    baselineRequirement: row.baseline_requirement,
    outcomeRequirement: row.outcome_requirement,
    baselineRequirementMet: row.baseline_requirement_met,
    outcomeRequirementMet: row.outcome_requirement_met,
    details: row.details
  };
}

export function createAgentTaskValidationPolicyRepository(database: DatabaseClient): AgentTaskValidationPolicyRepository {
  return {
    async upsert(policy) {
      await database.query(
        `INSERT INTO agent_task_validation_policies (
          id,
          agent_task_execution_id,
          policy_name,
          status,
          baseline_requirement,
          outcome_requirement,
          baseline_requirement_met,
          outcome_requirement_met,
          details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (agent_task_execution_id)
        DO UPDATE SET
          policy_name = EXCLUDED.policy_name,
          status = EXCLUDED.status,
          baseline_requirement = EXCLUDED.baseline_requirement,
          outcome_requirement = EXCLUDED.outcome_requirement,
          baseline_requirement_met = EXCLUDED.baseline_requirement_met,
          outcome_requirement_met = EXCLUDED.outcome_requirement_met,
          details = EXCLUDED.details,
          updated_at = NOW()`,
        [
          policy.id,
          policy.agentTaskExecutionId,
          policy.policyName,
          policy.status,
          policy.baselineRequirement,
          policy.outcomeRequirement,
          policy.baselineRequirementMet,
          policy.outcomeRequirementMet,
          JSON.stringify(policy.details)
        ]
      );
    },
    async findByExecutionId(executionId) {
      const result = await database.query<AgentTaskValidationPolicyRow>(
        `SELECT id, agent_task_execution_id, policy_name, status, baseline_requirement,
                outcome_requirement, baseline_requirement_met, outcome_requirement_met, details
         FROM agent_task_validation_policies
         WHERE agent_task_execution_id = $1`,
        [executionId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}