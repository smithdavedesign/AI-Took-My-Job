import type { DatabaseClient } from '../support/database.js';
import type { StoredProjectRolloutChecklist } from '../types/learn.js';

export interface ProjectRolloutChecklistRepository {
  ensureSchema(): Promise<void>;
  findByProjectId(projectId: string): Promise<StoredProjectRolloutChecklist | null>;
  upsert(checklist: Omit<StoredProjectRolloutChecklist, 'createdAt' | 'updatedAt'>): Promise<StoredProjectRolloutChecklist>;
}

interface ProjectRolloutChecklistRow {
  id: string;
  project_id: string;
  steps: StoredProjectRolloutChecklist['steps'];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

function mapRow(row: ProjectRolloutChecklistRow): StoredProjectRolloutChecklist {
  return {
    id: row.id,
    projectId: row.project_id,
    steps: row.steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.updated_by ? { updatedBy: row.updated_by } : {})
  };
}

export function createProjectRolloutChecklistRepository(database: DatabaseClient): ProjectRolloutChecklistRepository {
  return {
    async ensureSchema() {
      await database.query(`
        CREATE TABLE IF NOT EXISTS project_rollout_checklists (
          id UUID PRIMARY KEY,
          project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
          steps JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await database.query(`
        CREATE INDEX IF NOT EXISTS project_rollout_checklists_project_idx
          ON project_rollout_checklists (project_id, updated_at DESC)
      `);
    },
    async findByProjectId(projectId) {
      const result = await database.query<ProjectRolloutChecklistRow>(
        `SELECT id, project_id, steps, created_at, updated_at, updated_by
         FROM project_rollout_checklists
         WHERE project_id = $1`,
        [projectId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async upsert(checklist) {
      const result = await database.query<ProjectRolloutChecklistRow>(
        `INSERT INTO project_rollout_checklists (id, project_id, steps, updated_by)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (project_id)
         DO UPDATE SET
           steps = EXCLUDED.steps,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id, project_id, steps, created_at, updated_at, updated_by`,
        [
          checklist.id,
          checklist.projectId,
          JSON.stringify(checklist.steps),
          checklist.updatedBy ?? null
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('project rollout checklist upsert returned no row');
      }

      return mapRow(row);
    }
  };
}