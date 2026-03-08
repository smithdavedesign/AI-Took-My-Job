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
  source: StoredFeedbackReport['source'];
  external_id: string | null;
  title: string | null;
  status: StoredFeedbackReport['status'];
  severity: StoredFeedbackReport['severity'];
  reporter_identifier: string | null;
  payload: Record<string, unknown>;
}

export function createFeedbackRepository(database: DatabaseClient): FeedbackRepository {
  return {
    async create(report) {
      await database.query(
        `INSERT INTO feedback_reports (
          id,
          source,
          external_id,
          title,
          status,
          severity,
          reporter_identifier,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          report.id,
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
        `SELECT id, source, external_id, title, status, severity, reporter_identifier, payload
         FROM feedback_reports
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        source: row.source,
        status: row.status,
        severity: row.severity,
        payload: row.payload,
        ...(row.external_id ? { externalId: row.external_id } : {}),
        ...(row.title ? { title: row.title } : {}),
        ...(row.reporter_identifier ? { reporterIdentifier: row.reporter_identifier } : {})
      };
    },
    async listRecent(limit) {
      const result = await database.query<FeedbackRow>(
        `SELECT id, source, external_id, title, status, severity, reporter_identifier, payload
         FROM feedback_reports
         ORDER BY updated_at DESC, created_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        id: row.id,
        source: row.source,
        status: row.status,
        severity: row.severity,
        payload: row.payload,
        ...(row.external_id ? { externalId: row.external_id } : {}),
        ...(row.title ? { title: row.title } : {}),
        ...(row.reporter_identifier ? { reporterIdentifier: row.reporter_identifier } : {})
      }));
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