import type { DatabaseClient } from '../support/database.js';
import type { StoredReportReview } from '../types/report-reviews.js';

export interface ReportReviewRepository {
  upsert(review: StoredReportReview): Promise<void>;
  findByReportId(reportId: string): Promise<StoredReportReview | null>;
}

interface ReportReviewRow {
  id: string;
  feedback_report_id: string;
  status: StoredReportReview['status'];
  reviewer_id: string | null;
  repository: string | null;
  notes: string | null;
  reviewed_at: string | null;
}

function mapRow(row: ReportReviewRow): StoredReportReview {
  return {
    id: row.id,
    feedbackReportId: row.feedback_report_id,
    status: row.status,
    ...(row.reviewer_id ? { reviewerId: row.reviewer_id } : {}),
    ...(row.repository ? { repository: row.repository } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {})
  };
}

export function createReportReviewRepository(database: DatabaseClient): ReportReviewRepository {
  return {
    async upsert(review) {
      await database.query(
        `INSERT INTO report_reviews (
          id,
          feedback_report_id,
          status,
          reviewer_id,
          repository,
          notes,
          reviewed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (feedback_report_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          reviewer_id = EXCLUDED.reviewer_id,
          repository = EXCLUDED.repository,
          notes = EXCLUDED.notes,
          reviewed_at = EXCLUDED.reviewed_at,
          updated_at = NOW()`,
        [
          review.id,
          review.feedbackReportId,
          review.status,
          review.reviewerId ?? null,
          review.repository ?? null,
          review.notes ?? null,
          review.reviewedAt ?? null
        ]
      );
    },
    async findByReportId(reportId) {
      const result = await database.query<ReportReviewRow>(
        `SELECT id, feedback_report_id, status, reviewer_id, repository, notes, reviewed_at
         FROM report_reviews
         WHERE feedback_report_id = $1`,
        [reportId]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    }
  };
}