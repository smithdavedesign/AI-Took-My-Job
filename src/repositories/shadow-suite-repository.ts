import type { DatabaseClient } from '../support/database.js';
import type { StoredShadowSuite } from '../types/shadow-suite.js';

export interface ShadowSuiteRepository {
  create(suite: StoredShadowSuite): Promise<void>;
  update(suite: StoredShadowSuite): Promise<void>;
  findById(id: string): Promise<StoredShadowSuite | null>;
  list(filters?: { status?: StoredShadowSuite['status']; environment?: string }): Promise<StoredShadowSuite[]>;
  listDue(limit: number, environment?: string): Promise<StoredShadowSuite[]>;
}

interface ShadowSuiteRow {
  id: string;
  feedback_report_id: string;
  replay_run_id: string | null;
  name: string;
  environment: string;
  target_origin: string | null;
  cadence_seconds: number;
  expected_outcome: StoredShadowSuite['expectedOutcome'];
  status: StoredShadowSuite['status'];
  retention_reason: string | null;
  metadata: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
}

function mapRow(row: ShadowSuiteRow): StoredShadowSuite {
  return {
    id: row.id,
    feedbackReportId: row.feedback_report_id,
    name: row.name,
    environment: row.environment,
    cadenceSeconds: row.cadence_seconds,
    expectedOutcome: row.expected_outcome,
    status: row.status,
    metadata: row.metadata,
    ...(row.replay_run_id ? { replayRunId: row.replay_run_id } : {}),
    ...(row.target_origin ? { targetOrigin: row.target_origin } : {}),
    ...(row.retention_reason ? { retentionReason: row.retention_reason } : {}),
    ...(row.last_run_at ? { lastRunAt: row.last_run_at } : {}),
    ...(row.next_run_at ? { nextRunAt: row.next_run_at } : {})
  };
}

export function createShadowSuiteRepository(database: DatabaseClient): ShadowSuiteRepository {
  return {
    async create(suite) {
      await database.query(
        `INSERT INTO shadow_suites (
          id,
          feedback_report_id,
          replay_run_id,
          name,
          environment,
          target_origin,
          cadence_seconds,
          expected_outcome,
          status,
          retention_reason,
          metadata,
          last_run_at,
          next_run_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          suite.id,
          suite.feedbackReportId,
          suite.replayRunId ?? null,
          suite.name,
          suite.environment,
          suite.targetOrigin ?? null,
          suite.cadenceSeconds,
          suite.expectedOutcome,
          suite.status,
          suite.retentionReason ?? null,
          JSON.stringify(suite.metadata),
          suite.lastRunAt ?? null,
          suite.nextRunAt ?? null
        ]
      );
    },
    async update(suite) {
      await database.query(
        `UPDATE shadow_suites
         SET replay_run_id = $2,
             name = $3,
             environment = $4,
             target_origin = $5,
             cadence_seconds = $6,
             expected_outcome = $7,
             status = $8,
             retention_reason = $9,
             metadata = $10::jsonb,
             last_run_at = $11,
             next_run_at = $12,
             updated_at = NOW()
         WHERE id = $1`,
        [
          suite.id,
          suite.replayRunId ?? null,
          suite.name,
          suite.environment,
          suite.targetOrigin ?? null,
          suite.cadenceSeconds,
          suite.expectedOutcome,
          suite.status,
          suite.retentionReason ?? null,
          JSON.stringify(suite.metadata),
          suite.lastRunAt ?? null,
          suite.nextRunAt ?? null
        ]
      );
    },
    async findById(id) {
      const result = await database.query<ShadowSuiteRow>(
        `SELECT id, feedback_report_id, replay_run_id, name, environment, target_origin,
                cadence_seconds, expected_outcome, status, retention_reason, metadata,
                last_run_at, next_run_at
         FROM shadow_suites
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async list(filters) {
      const conditions: string[] = [];
      const values: unknown[] = [];

      if (filters?.status) {
        values.push(filters.status);
        conditions.push(`status = $${values.length}`);
      }

      if (filters?.environment) {
        values.push(filters.environment);
        conditions.push(`environment = $${values.length}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await database.query<ShadowSuiteRow>(
        `SELECT id, feedback_report_id, replay_run_id, name, environment, target_origin,
                cadence_seconds, expected_outcome, status, retention_reason, metadata,
                last_run_at, next_run_at
         FROM shadow_suites
         ${whereClause}
         ORDER BY created_at DESC`,
        values
      );

      return result.rows.map(mapRow);
    },
    async listDue(limit, environment) {
      const values: unknown[] = [];
      let environmentClause = '';

      if (environment) {
        values.push(environment);
        environmentClause = `AND environment = $${values.length}`;
      }

      values.push(limit);
      const result = await database.query<ShadowSuiteRow>(
        `SELECT id, feedback_report_id, replay_run_id, name, environment, target_origin,
                cadence_seconds, expected_outcome, status, retention_reason, metadata,
                last_run_at, next_run_at
         FROM shadow_suites
         WHERE status = 'active'
           AND (next_run_at IS NULL OR next_run_at <= NOW())
           ${environmentClause}
         ORDER BY COALESCE(next_run_at, created_at) ASC
         LIMIT $${values.length}`,
        values
      );

      return result.rows.map(mapRow);
    }
  };
}