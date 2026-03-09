import { createHash } from 'node:crypto';

import type { DatabaseClient } from '../support/database.js';

export interface StoredServiceIdentity {
  id: string;
  tokenHash: string;
  scopes: string[];
  source: 'env' | 'manual';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface ServiceIdentityRepository {
  ensureSchema(): Promise<void>;
  upsertBootstrapPrincipal(input: {
    id: string;
    token: string;
    scopes: string[];
    metadata?: Record<string, unknown>;
  }): Promise<StoredServiceIdentity>;
  createManualPrincipal(input: {
    id: string;
    token: string;
    scopes: string[];
    metadata?: Record<string, unknown>;
  }): Promise<StoredServiceIdentity>;
  rotatePrincipal(input: {
    id: string;
    token: string;
    scopes?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<StoredServiceIdentity | null>;
  findById(id: string): Promise<StoredServiceIdentity | null>;
  listActive(): Promise<StoredServiceIdentity[]>;
  listAll(): Promise<StoredServiceIdentity[]>;
  revoke(id: string): Promise<StoredServiceIdentity | null>;
}

interface ServiceIdentityRow {
  id: string;
  token_hash: string;
  scopes: string[];
  source: 'env' | 'manual';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export function hashServiceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapRow(row: ServiceIdentityRow): StoredServiceIdentity {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    scopes: row.scopes,
    source: row.source,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
  };
}

export function createServiceIdentityRepository(database: DatabaseClient): ServiceIdentityRepository {
  return {
    async ensureSchema() {
      await database.query(`
        CREATE TABLE IF NOT EXISTS service_identities (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
          source TEXT NOT NULL DEFAULT 'manual',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await database.query(`
        CREATE INDEX IF NOT EXISTS service_identities_revoked_idx
          ON service_identities (revoked_at, updated_at DESC)
      `);
    },
    async upsertBootstrapPrincipal(input) {
      const result = await database.query<ServiceIdentityRow>(
        `INSERT INTO service_identities (
          id,
          token_hash,
          scopes,
          source,
          metadata,
          revoked_at
        ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, NULL)
        ON CONFLICT (id)
        DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          scopes = EXCLUDED.scopes,
          source = EXCLUDED.source,
          metadata = EXCLUDED.metadata,
          revoked_at = NULL,
          updated_at = NOW()
        RETURNING id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at`,
        [
          input.id,
          hashServiceToken(input.token),
          JSON.stringify(input.scopes),
          'env',
          JSON.stringify(input.metadata ?? {})
        ]
      );

      return mapRow(result.rows[0] as ServiceIdentityRow);
    },
    async createManualPrincipal(input) {
      const result = await database.query<ServiceIdentityRow>(
        `INSERT INTO service_identities (
          id,
          token_hash,
          scopes,
          source,
          metadata,
          revoked_at
        ) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, NULL)
        RETURNING id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at`,
        [
          input.id,
          hashServiceToken(input.token),
          JSON.stringify(input.scopes),
          'manual',
          JSON.stringify(input.metadata ?? {})
        ]
      );

      return mapRow(result.rows[0] as ServiceIdentityRow);
    },
    async rotatePrincipal(input) {
      const current = await this.findById(input.id);
      if (!current) {
        return null;
      }

      const result = await database.query<ServiceIdentityRow>(
        `UPDATE service_identities
         SET token_hash = $2,
             scopes = $3::jsonb,
             metadata = $4::jsonb,
             revoked_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at`,
        [
          input.id,
          hashServiceToken(input.token),
          JSON.stringify(input.scopes ?? current.scopes),
          JSON.stringify(input.metadata ?? current.metadata)
        ]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findById(id) {
      const result = await database.query<ServiceIdentityRow>(
        `SELECT id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at
         FROM service_identities
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async listActive() {
      const result = await database.query<ServiceIdentityRow>(
        `SELECT id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at
         FROM service_identities
         WHERE revoked_at IS NULL
         ORDER BY created_at ASC`
      );

      return result.rows.map(mapRow);
    },
    async listAll() {
      const result = await database.query<ServiceIdentityRow>(
        `SELECT id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at
         FROM service_identities
         ORDER BY created_at ASC`
      );

      return result.rows.map(mapRow);
    },
    async revoke(id) {
      const result = await database.query<ServiceIdentityRow>(
        `UPDATE service_identities
         SET revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, token_hash, scopes, source, metadata, created_at, updated_at, revoked_at`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}