import type { DatabaseClient } from '../support/database.js';
import type { StoredGitHubIssueLink } from '../types/issues.js';

export interface GitHubIssueLinkRepository {
  upsert(link: StoredGitHubIssueLink): Promise<void>;
  findByReportId(reportId: string): Promise<StoredGitHubIssueLink | null>;
  listRecent(limit: number): Promise<StoredGitHubIssueLink[]>;
}

interface GitHubIssueLinkRow {
  id: string;
  feedback_report_id: string;
  repository: string;
  draft_title: string;
  draft_body: string;
  draft_labels: string[];
  issue_number: number | null;
  issue_url: string | null;
  state: StoredGitHubIssueLink['state'];
}

export function createGitHubIssueLinkRepository(database: DatabaseClient): GitHubIssueLinkRepository {
  return {
    async upsert(link) {
      await database.query(
        `INSERT INTO github_issue_links (
          id,
          feedback_report_id,
          repository,
          draft_title,
          draft_body,
          draft_labels,
          issue_number,
          issue_url,
          state
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
        ON CONFLICT (feedback_report_id)
        DO UPDATE SET
          repository = EXCLUDED.repository,
          draft_title = EXCLUDED.draft_title,
          draft_body = EXCLUDED.draft_body,
          draft_labels = EXCLUDED.draft_labels,
          issue_number = EXCLUDED.issue_number,
          issue_url = EXCLUDED.issue_url,
          state = EXCLUDED.state,
          updated_at = NOW()`,
        [
          link.id,
          link.feedbackReportId,
          link.repository,
          link.draftTitle,
          link.draftBody,
          JSON.stringify(link.draftLabels),
          link.issueNumber ?? null,
          link.issueUrl ?? null,
          link.state
        ]
      );
    },
    async findByReportId(reportId) {
      const result = await database.query<GitHubIssueLinkRow>(
        `SELECT
           id,
           feedback_report_id,
           repository,
           draft_title,
           draft_body,
           draft_labels,
           issue_number,
           issue_url,
           state
         FROM github_issue_links
         WHERE feedback_report_id = $1`,
        [reportId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        repository: row.repository,
        draftTitle: row.draft_title,
        draftBody: row.draft_body,
        draftLabels: row.draft_labels,
        state: row.state,
        ...(row.issue_number ? { issueNumber: row.issue_number } : {}),
        ...(row.issue_url ? { issueUrl: row.issue_url } : {})
      };
    },
    async listRecent(limit) {
      const result = await database.query<GitHubIssueLinkRow>(
        `SELECT
           id,
           feedback_report_id,
           repository,
           draft_title,
           draft_body,
           draft_labels,
           issue_number,
           issue_url,
           state
         FROM github_issue_links
         ORDER BY updated_at DESC, created_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        repository: row.repository,
        draftTitle: row.draft_title,
        draftBody: row.draft_body,
        draftLabels: row.draft_labels,
        state: row.state,
        ...(row.issue_number ? { issueNumber: row.issue_number } : {}),
        ...(row.issue_url ? { issueUrl: row.issue_url } : {})
      }));
    }
  };
}