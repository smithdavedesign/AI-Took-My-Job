import type { DatabaseClient } from '../support/database.js';
import type { GitHubInstallationUpsertInput, StoredGitHubInstallation } from '../types/onboarding.js';

export interface GitHubInstallationRepository {
  create(installation: StoredGitHubInstallation): Promise<void>;
  upsert(installation: GitHubInstallationUpsertInput): Promise<StoredGitHubInstallation>;
  findById(id: string): Promise<StoredGitHubInstallation | null>;
  findByInstallationId(installationId: number): Promise<StoredGitHubInstallation | null>;
  findByWorkspaceId(workspaceId: string): Promise<StoredGitHubInstallation[]>;
}

interface GitHubInstallationRow {
  id: string;
  workspace_id: string;
  provider: 'github';
  installation_id: number;
  account_login: string | null;
  account_type: string | null;
  metadata: Record<string, unknown>;
}

function mapRow(row: GitHubInstallationRow): StoredGitHubInstallation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    installationId: row.installation_id,
    metadata: row.metadata,
    ...(row.account_login ? { accountLogin: row.account_login } : {}),
    ...(row.account_type ? { accountType: row.account_type } : {})
  };
}

export function createGitHubInstallationRepository(database: DatabaseClient): GitHubInstallationRepository {
  return {
    async create(installation) {
      await database.query(
        `INSERT INTO github_installations (
          id,
          workspace_id,
          provider,
          installation_id,
          account_login,
          account_type,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          installation.id,
          installation.workspaceId,
          installation.provider,
          installation.installationId,
          installation.accountLogin ?? null,
          installation.accountType ?? null,
          JSON.stringify(installation.metadata)
        ]
      );
    },
    async findById(id) {
      const result = await database.query<GitHubInstallationRow>(
        `SELECT id, workspace_id, provider, installation_id, account_login, account_type, metadata
         FROM github_installations
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async upsert(installation) {
      const result = await database.query<GitHubInstallationRow>(
        `INSERT INTO github_installations (
          id,
          workspace_id,
          provider,
          installation_id,
          account_login,
          account_type,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (installation_id)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          account_login = EXCLUDED.account_login,
          account_type = EXCLUDED.account_type,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id, workspace_id, provider, installation_id, account_login, account_type, metadata`,
        [
          installation.id,
          installation.workspaceId,
          installation.provider,
          installation.installationId,
          installation.accountLogin ?? null,
          installation.accountType ?? null,
          JSON.stringify(installation.metadata)
        ]
      );

      return mapRow(result.rows[0] as GitHubInstallationRow);
    },
    async findByInstallationId(installationId) {
      const result = await database.query<GitHubInstallationRow>(
        `SELECT id, workspace_id, provider, installation_id, account_login, account_type, metadata
         FROM github_installations
         WHERE installation_id = $1`,
        [installationId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByWorkspaceId(workspaceId) {
      const result = await database.query<GitHubInstallationRow>(
        `SELECT id, workspace_id, provider, installation_id, account_login, account_type, metadata
         FROM github_installations
         WHERE workspace_id = $1
         ORDER BY created_at DESC`,
        [workspaceId]
      );

      return result.rows.map(mapRow);
    }
  };
}