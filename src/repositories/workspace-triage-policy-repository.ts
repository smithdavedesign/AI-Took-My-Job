import type { DatabaseClient } from '../support/database.js';
import type { StoredWorkspaceTriagePolicy } from '../types/workspace-triage-policy.js';

export interface WorkspaceTriagePolicyRepository {
  ensureSchema(): Promise<void>;
  findByWorkspaceId(workspaceId: string): Promise<StoredWorkspaceTriagePolicy | null>;
  upsert(policy: StoredWorkspaceTriagePolicy): Promise<StoredWorkspaceTriagePolicy>;
  deleteByWorkspaceId(workspaceId: string): Promise<boolean>;
}

interface WorkspaceTriagePolicyRow {
  id: string;
  workspace_id: string;
  ownership_rules: StoredWorkspaceTriagePolicy['ownershipRules'];
  priority_rules: StoredWorkspaceTriagePolicy['priorityRules'];
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkspaceTriagePolicyRow): StoredWorkspaceTriagePolicy {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownershipRules: row.ownership_rules,
    priorityRules: row.priority_rules,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createWorkspaceTriagePolicyRepository(database: DatabaseClient): WorkspaceTriagePolicyRepository {
  return {
    async ensureSchema() {
      await database.query(`
        CREATE TABLE IF NOT EXISTS workspace_triage_policies (
          id UUID PRIMARY KEY,
          workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
          ownership_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
          priority_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    },
    async findByWorkspaceId(workspaceId) {
      const result = await database.query<WorkspaceTriagePolicyRow>(
        `SELECT id, workspace_id, ownership_rules, priority_rules, created_at, updated_at
         FROM workspace_triage_policies
         WHERE workspace_id = $1`,
        [workspaceId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async upsert(policy) {
      const result = await database.query<WorkspaceTriagePolicyRow>(
        `INSERT INTO workspace_triage_policies (
          id,
          workspace_id,
          ownership_rules,
          priority_rules
        ) VALUES ($1, $2, $3::jsonb, $4::jsonb)
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          ownership_rules = EXCLUDED.ownership_rules,
          priority_rules = EXCLUDED.priority_rules,
          updated_at = NOW()
        RETURNING id, workspace_id, ownership_rules, priority_rules, created_at, updated_at`,
        [
          policy.id,
          policy.workspaceId,
          JSON.stringify(policy.ownershipRules),
          JSON.stringify(policy.priorityRules)
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('workspace triage policy upsert returned no row');
      }

      return mapRow(row);
    },
    async deleteByWorkspaceId(workspaceId) {
      const result = await database.query<Pick<WorkspaceTriagePolicyRow, 'id'>>(
        `DELETE FROM workspace_triage_policies
         WHERE workspace_id = $1
         RETURNING id`,
        [workspaceId]
      );

      return result.rows.length > 0;
    }
  };
}