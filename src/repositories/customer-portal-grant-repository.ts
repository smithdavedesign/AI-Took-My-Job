import type { DatabaseClient } from '../support/database.js';
import type { StoredCustomerPortalGrant } from '../types/customer-portal.js';

export interface CustomerPortalGrantRepository {
  ensureSchema(): Promise<void>;
  create(grant: StoredCustomerPortalGrant): Promise<StoredCustomerPortalGrant>;
  findById(id: string): Promise<StoredCustomerPortalGrant | null>;
  findActiveByProjectIdAndEmail(projectId: string, customerEmail: string): Promise<StoredCustomerPortalGrant | null>;
  listByProjectId(projectId: string): Promise<StoredCustomerPortalGrant[]>;
  revoke(id: string): Promise<StoredCustomerPortalGrant | null>;
}

interface CustomerPortalGrantRow {
  id: string;
  project_id: string;
  customer_email: string;
  customer_name: string | null;
  status: StoredCustomerPortalGrant['status'];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  expires_at: string | null;
}

function mapRow(row: CustomerPortalGrantRow): StoredCustomerPortalGrant {
  return {
    id: row.id,
    projectId: row.project_id,
    customerEmail: row.customer_email,
    ...(row.customer_name ? { customerName: row.customer_name } : {}),
    status: row.status,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {})
  };
}

export function createCustomerPortalGrantRepository(database: DatabaseClient): CustomerPortalGrantRepository {
  return {
    async ensureSchema() {
      await database.query(`
        CREATE TABLE IF NOT EXISTS customer_portal_grants (
          id UUID PRIMARY KEY,
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          customer_email TEXT NOT NULL,
          customer_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          revoked_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await database.query(`
        CREATE INDEX IF NOT EXISTS customer_portal_grants_project_email_idx
          ON customer_portal_grants (project_id, customer_email, updated_at DESC)
      `);
    },
    async create(grant) {
      const result = await database.query<CustomerPortalGrantRow>(
        `INSERT INTO customer_portal_grants (
          id,
          project_id,
          customer_email,
          customer_name,
          status,
          metadata,
          revoked_at,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        RETURNING id, project_id, customer_email, customer_name, status, metadata, created_at, updated_at, revoked_at, expires_at`,
        [
          grant.id,
          grant.projectId,
          grant.customerEmail,
          grant.customerName ?? null,
          grant.status,
          JSON.stringify(grant.metadata),
          grant.revokedAt ?? null,
          grant.expiresAt ?? null
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('customer portal grant create returned no row');
      }

      return mapRow(row);
    },
    async findById(id) {
      const result = await database.query<CustomerPortalGrantRow>(
        `SELECT id, project_id, customer_email, customer_name, status, metadata, created_at, updated_at, revoked_at, expires_at
         FROM customer_portal_grants
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findActiveByProjectIdAndEmail(projectId, customerEmail) {
      const result = await database.query<CustomerPortalGrantRow>(
        `SELECT id, project_id, customer_email, customer_name, status, metadata, created_at, updated_at, revoked_at, expires_at
         FROM customer_portal_grants
         WHERE project_id = $1
           AND customer_email = $2
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY updated_at DESC
         LIMIT 1`,
        [projectId, customerEmail]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async listByProjectId(projectId) {
      const result = await database.query<CustomerPortalGrantRow>(
        `SELECT id, project_id, customer_email, customer_name, status, metadata, created_at, updated_at, revoked_at, expires_at
         FROM customer_portal_grants
         WHERE project_id = $1
         ORDER BY updated_at DESC`,
        [projectId]
      );

      return result.rows.map(mapRow);
    },
    async revoke(id) {
      const result = await database.query<CustomerPortalGrantRow>(
        `UPDATE customer_portal_grants
         SET status = 'revoked',
             revoked_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, project_id, customer_email, customer_name, status, metadata, created_at, updated_at, revoked_at, expires_at`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}