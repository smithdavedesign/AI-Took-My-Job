import type { DatabaseClient } from '../support/database.js';
import type { StoredProject } from '../types/onboarding.js';

export interface ProjectRepository {
  create(project: StoredProject): Promise<void>;
  findById(id: string): Promise<StoredProject | null>;
  findByKey(projectKey: string): Promise<StoredProject | null>;
  findByWorkspaceId(workspaceId: string): Promise<StoredProject[]>;
}

interface ProjectRow {
  id: string;
  workspace_id: string;
  project_key: string;
  name: string;
  status: StoredProject['status'];
  routing_config: Record<string, unknown>;
}

function mapRow(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectKey: row.project_key,
    name: row.name,
    status: row.status,
    routingConfig: row.routing_config
  };
}

export function createProjectRepository(database: DatabaseClient): ProjectRepository {
  return {
    async create(project) {
      await database.query(
        `INSERT INTO projects (id, workspace_id, project_key, name, status, routing_config)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          project.id,
          project.workspaceId,
          project.projectKey,
          project.name,
          project.status,
          JSON.stringify(project.routingConfig)
        ]
      );
    },
    async findById(id) {
      const result = await database.query<ProjectRow>(
        `SELECT id, workspace_id, project_key, name, status, routing_config
         FROM projects
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByKey(projectKey) {
      const result = await database.query<ProjectRow>(
        `SELECT id, workspace_id, project_key, name, status, routing_config
         FROM projects
         WHERE project_key = $1`,
        [projectKey]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByWorkspaceId(workspaceId) {
      const result = await database.query<ProjectRow>(
        `SELECT id, workspace_id, project_key, name, status, routing_config
         FROM projects
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
      );

      return result.rows.map(mapRow);
    }
  };
}