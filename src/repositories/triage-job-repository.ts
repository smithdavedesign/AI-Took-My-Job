import type { DatabaseClient } from '../support/database.js';
import type { StoredTriageJob } from '../types/reports.js';

export interface TriageJobRepository {
  create(job: StoredTriageJob): Promise<void>;
  updateStatus(id: string, status: StoredTriageJob['status']): Promise<void>;
  updatePriorityAndPayload(id: string, priority: number, payload: Record<string, unknown>): Promise<void>;
}

export function createTriageJobRepository(database: DatabaseClient): TriageJobRepository {
  return {
    async create(job) {
      await database.query(
        `INSERT INTO triage_jobs (
          id,
          feedback_report_id,
          job_type,
          status,
          priority,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          job.id,
          job.reportId,
          job.jobType,
          job.status,
          job.priority,
          JSON.stringify(job.payload)
        ]
      );
    },
    async updateStatus(id, status) {
      await database.query(
        `UPDATE triage_jobs
         SET status = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, status]
      );
    },
    async updatePriorityAndPayload(id, priority, payload) {
      await database.query(
        `UPDATE triage_jobs
         SET priority = $2,
             payload = $3::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [id, priority, JSON.stringify(payload)]
      );
    }
  };
}