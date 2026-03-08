import type { DatabaseClient } from '../support/database.js';
import type { StoredWorkspace } from '../types/onboarding.js';

export interface WorkspaceRepository {
  create(workspace: StoredWorkspace): Promise<void>;
  findById(id: string): Promise<StoredWorkspace | null>;
  findBySlug(slug: string): Promise<StoredWorkspace | null>;
}

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
}

function mapRow(row: WorkspaceRow): StoredWorkspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
}

export function createWorkspaceRepository(database: DatabaseClient): WorkspaceRepository {
  return {
    async create(workspace) {
      await database.query(
        `INSERT INTO workspaces (id, slug, name)
         VALUES ($1, $2, $3)`,
        [workspace.id, workspace.slug, workspace.name]
      );
    },
    async findById(id) {
      const result = await database.query<WorkspaceRow>(
        `SELECT id, slug, name
         FROM workspaces
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findBySlug(slug) {
      const result = await database.query<WorkspaceRow>(
        `SELECT id, slug, name
         FROM workspaces
         WHERE slug = $1`,
        [slug]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}