import type { DatabaseClient } from '../support/database.js';
import type { StoredFeedbackReport } from '../types/reports.js';

export interface FeedbackRepository {
  create(report: StoredFeedbackReport): Promise<void>;
  findById(id: string): Promise<StoredFeedbackReport | null>;
  listRecent(limit: number): Promise<StoredFeedbackReport[]>;
  updateStatus(id: string, status: StoredFeedbackReport['status']): Promise<void>;
  updatePayload(id: string, payload: Record<string, unknown>): Promise<void>;
}

interface FeedbackRow {
  id: string;
  project_id: string | null;
  source: StoredFeedbackReport['source'];
  external_id: string | null;
  title: string | null;
  status: StoredFeedbackReport['status'];
  severity: StoredFeedbackReport['severity'];
  reporter_identifier: string | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
}

function mapRow(row: FeedbackRow): StoredFeedbackReport {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    severity: row.severity,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.external_id ? { externalId: row.external_id } : {}),
    ...(row.title ? { title: row.title } : {}),
    ...(row.reporter_identifier ? { reporterIdentifier: row.reporter_identifier } : {})
  };
}

export function createFeedbackRepository(database: DatabaseClient): FeedbackRepository {
  return {
    async create(report) {
      await database.query(
        `INSERT INTO feedback_reports (
          id,
          project_id,
          source,
          external_id,
          title,
          status,
          severity,
          reporter_identifier,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          report.id,
          report.projectId ?? null,
          report.source,
          report.externalId ?? null,
          report.title ?? null,
          report.status,
          report.severity,
          report.reporterIdentifier ?? null,
          JSON.stringify(report.payload)
        ]
      );
    },
    async findById(id) {
      const result = await database.query<FeedbackRow>(
        `SELECT id, project_id, source, external_id, title, status, severity, reporter_identifier, created_at, updated_at, payload
         FROM feedback_reports
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async listRecent(limit) {
      const result = await database.query<FeedbackRow>(
        `SELECT id, project_id, source, external_id, title, status, severity, reporter_identifier, created_at, updated_at, payload
         FROM feedback_reports
         ORDER BY updated_at DESC, created_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map(mapRow);
    },
    async updateStatus(id, status) {
      await database.query(
        `UPDATE feedback_reports
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, status]
      );
    },
    async updatePayload(id, payload) {
      await database.query(
        `UPDATE feedback_reports
         SET payload = $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [id, JSON.stringify(payload)]
      );
    }
  };
}