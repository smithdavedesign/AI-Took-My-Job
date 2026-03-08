import type { DatabaseClient } from '../support/database.js';
import type { StoredShadowSuiteRun } from '../types/shadow-suite.js';

export interface ShadowSuiteRunRepository {
  create(run: StoredShadowSuiteRun): Promise<void>;
  update(run: StoredShadowSuiteRun): Promise<void>;
  findById(id: string): Promise<StoredShadowSuiteRun | null>;
  findBySuiteId(shadowSuiteId: string): Promise<StoredShadowSuiteRun[]>;
}

interface ShadowSuiteRunRow {
  id: string;
  shadow_suite_id: string;
  replay_run_id: string | null;
  status: StoredShadowSuiteRun['status'];
  target_origin: string | null;
  expected_outcome: StoredShadowSuiteRun['expectedOutcome'];
  actual_outcome: StoredShadowSuiteRun['actualOutcome'] | null;
  triggered_by: string | null;
  summary: Record<string, unknown>;
  failure_reason: string | null;
}

function mapRow(row: ShadowSuiteRunRow): StoredShadowSuiteRun {
  return {
    id: row.id,
    shadowSuiteId: row.shadow_suite_id,
    status: row.status,
    expectedOutcome: row.expected_outcome,
    summary: row.summary,
    ...(row.replay_run_id ? { replayRunId: row.replay_run_id } : {}),
    ...(row.target_origin ? { targetOrigin: row.target_origin } : {}),
    ...(row.actual_outcome ? { actualOutcome: row.actual_outcome } : {}),
    ...(row.triggered_by ? { triggeredBy: row.triggered_by } : {}),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {})
  };
}

export function createShadowSuiteRunRepository(database: DatabaseClient): ShadowSuiteRunRepository {
  return {
    async create(run) {
      await database.query(
        `INSERT INTO shadow_suite_runs (
          id,
          shadow_suite_id,
          replay_run_id,
          status,
          target_origin,
          expected_outcome,
          actual_outcome,
          triggered_by,
          summary,
          failure_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          run.id,
          run.shadowSuiteId,
          run.replayRunId ?? null,
          run.status,
          run.targetOrigin ?? null,
          run.expectedOutcome,
          run.actualOutcome ?? null,
          run.triggeredBy ?? null,
          JSON.stringify(run.summary),
          run.failureReason ?? null
        ]
      );
    },
    async update(run) {
      await database.query(
        `UPDATE shadow_suite_runs
         SET replay_run_id = $2,
             status = $3,
             target_origin = $4,
             expected_outcome = $5,
             actual_outcome = $6,
             triggered_by = $7,
             summary = $8::jsonb,
             failure_reason = $9,
             updated_at = NOW()
         WHERE id = $1`,
        [
          run.id,
          run.replayRunId ?? null,
          run.status,
          run.targetOrigin ?? null,
          run.expectedOutcome,
          run.actualOutcome ?? null,
          run.triggeredBy ?? null,
          JSON.stringify(run.summary),
          run.failureReason ?? null
        ]
      );
    },
    async findById(id) {
      const result = await database.query<ShadowSuiteRunRow>(
        `SELECT id, shadow_suite_id, replay_run_id, status, target_origin,
                expected_outcome, actual_outcome, triggered_by, summary, failure_reason
         FROM shadow_suite_runs
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findBySuiteId(shadowSuiteId) {
      const result = await database.query<ShadowSuiteRunRow>(
        `SELECT id, shadow_suite_id, replay_run_id, status, target_origin,
                expected_outcome, actual_outcome, triggered_by, summary, failure_reason
         FROM shadow_suite_runs
         WHERE shadow_suite_id = $1
         ORDER BY created_at DESC`,
        [shadowSuiteId]
      );

      return result.rows.map(mapRow);
    }
  };
}