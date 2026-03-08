import type { DatabaseClient } from '../support/database.js';
import type { StoredReplayRun } from '../types/replay.js';

export interface ReplayRunRepository {
  create(run: StoredReplayRun): Promise<void>;
  update(run: StoredReplayRun): Promise<void>;
  findLatestByReportId(reportId: string): Promise<StoredReplayRun | null>;
}

interface ReplayRunRow {
  id: string;
  feedback_report_id: string;
  artifact_id: string;
  status: StoredReplayRun['status'];
  summary: Record<string, unknown>;
  replay_plan: Record<string, unknown> | null;
  failure_reason: string | null;
}

export function createReplayRunRepository(database: DatabaseClient): ReplayRunRepository {
  return {
    async create(run) {
      await database.query(
        `INSERT INTO replay_runs (
          id,
          feedback_report_id,
          artifact_id,
          status,
          summary,
          replay_plan,
          failure_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          run.id,
          run.feedbackReportId,
          run.artifactId,
          run.status,
          JSON.stringify(run.summary),
          run.replayPlan ? JSON.stringify(run.replayPlan) : null,
          run.failureReason ?? null
        ]
      );
    },
    async update(run) {
      await database.query(
        `UPDATE replay_runs
         SET status = $2,
             summary = $3,
             replay_plan = $4,
             failure_reason = $5,
             updated_at = NOW()
         WHERE id = $1`,
        [
          run.id,
          run.status,
          JSON.stringify(run.summary),
          run.replayPlan ? JSON.stringify(run.replayPlan) : null,
          run.failureReason ?? null
        ]
      );
    },
    async findLatestByReportId(reportId) {
      const result = await database.query<ReplayRunRow>(
        `SELECT id, feedback_report_id, artifact_id, status, summary, replay_plan, failure_reason
         FROM replay_runs
         WHERE feedback_report_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [reportId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const replayRun: StoredReplayRun = {
        id: row.id,
        feedbackReportId: row.feedback_report_id,
        artifactId: row.artifact_id,
        status: row.status,
        summary: row.summary
      };

      if (row.replay_plan) {
        replayRun.replayPlan = row.replay_plan as unknown as NonNullable<StoredReplayRun['replayPlan']>;
      }

      if (row.failure_reason) {
        replayRun.failureReason = row.failure_reason;
      }

      return replayRun;
    }
  };
}