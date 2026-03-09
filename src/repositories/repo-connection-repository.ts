import type { DatabaseClient } from '../support/database.js';
import type { RepoConnectionUpdateInput, StoredRepoConnection } from '../types/onboarding.js';

export interface RepoConnectionRepository {
  create(connection: StoredRepoConnection): Promise<void>;
  findById(id: string): Promise<StoredRepoConnection | null>;
  findByProjectId(projectId: string): Promise<StoredRepoConnection[]>;
  findByProjectIdAndRepository(projectId: string, repository: string): Promise<StoredRepoConnection | null>;
  findByGitHubInstallationId(githubInstallationId: string): Promise<StoredRepoConnection[]>;
  findDefaultByProjectId(projectId: string): Promise<StoredRepoConnection | null>;
  update(id: string, input: RepoConnectionUpdateInput): Promise<StoredRepoConnection | null>;
}

interface RepoConnectionRow {
  id: string;
  project_id: string;
  github_installation_id: string | null;
  provider: 'github';
  repository: string;
  is_default: boolean;
  status: StoredRepoConnection['status'];
  config: Record<string, unknown>;
}

function mapRow(row: RepoConnectionRow): StoredRepoConnection {
  return {
    id: row.id,
    projectId: row.project_id,
    provider: row.provider,
    repository: row.repository,
    isDefault: row.is_default,
    status: row.status,
    config: row.config,
    ...(row.github_installation_id ? { githubInstallationId: row.github_installation_id } : {})
  };
}

export function createRepoConnectionRepository(database: DatabaseClient): RepoConnectionRepository {
  return {
    async create(connection) {
      await database.query(
        `INSERT INTO repo_connections (
          id,
          project_id,
          github_installation_id,
          provider,
          repository,
          is_default,
          status,
          config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          connection.id,
          connection.projectId,
          connection.githubInstallationId ?? null,
          connection.provider,
          connection.repository,
          connection.isDefault,
          connection.status,
          JSON.stringify(connection.config)
        ]
      );
    },
    async findById(id) {
      const result = await database.query<RepoConnectionRow>(
        `SELECT id, project_id, github_installation_id, provider, repository, is_default, status, config
         FROM repo_connections
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByProjectId(projectId) {
      const result = await database.query<RepoConnectionRow>(
        `SELECT id, project_id, github_installation_id, provider, repository, is_default, status, config
         FROM repo_connections
         WHERE project_id = $1
         ORDER BY is_default DESC, created_at DESC`,
        [projectId]
      );

      return result.rows.map(mapRow);
    },
    async findByProjectIdAndRepository(projectId, repository) {
      const result = await database.query<RepoConnectionRow>(
        `SELECT id, project_id, github_installation_id, provider, repository, is_default, status, config
         FROM repo_connections
         WHERE project_id = $1 AND repository = $2`,
        [projectId, repository]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByGitHubInstallationId(githubInstallationId) {
      const result = await database.query<RepoConnectionRow>(
        `SELECT id, project_id, github_installation_id, provider, repository, is_default, status, config
         FROM repo_connections
         WHERE github_installation_id = $1
         ORDER BY created_at DESC`,
        [githubInstallationId]
      );

      return result.rows.map(mapRow);
    },
    async findDefaultByProjectId(projectId) {
      const result = await database.query<RepoConnectionRow>(
        `SELECT id, project_id, github_installation_id, provider, repository, is_default, status, config
         FROM repo_connections
         WHERE project_id = $1 AND is_default = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [projectId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async update(id, input) {
      const current = await this.findById(id);
      if (!current) {
        return null;
      }

      const next = {
        ...current,
        ...(input.githubInstallationId ? { githubInstallationId: input.githubInstallationId } : {}),
        ...(typeof input.isDefault === 'boolean' ? { isDefault: input.isDefault } : {}),
        ...(input.status ? { status: input.status } : {}),
        config: input.config ? { ...current.config, ...input.config } : current.config
      };

      const result = await database.query<RepoConnectionRow>(
        `UPDATE repo_connections
         SET github_installation_id = $2,
             is_default = $3,
             status = $4,
             config = $5::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, project_id, github_installation_id, provider, repository, is_default, status, config`,
        [
          id,
          next.githubInstallationId ?? null,
          next.isDefault,
          next.status,
          JSON.stringify(next.config)
        ]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}