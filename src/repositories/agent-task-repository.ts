import type { DatabaseClient } from '../support/database.js';
import type { StoredAgentTask } from '../types/agent-tasks.js';

export interface AgentTaskRepository {
  create(task: StoredAgentTask): Promise<void>;
  updateProcessingJobId(id: string, processingJobId: string): Promise<void>;
  updateStatus(id: string, status: StoredAgentTask['status'], options?: {
    preparedContext?: Record<string, unknown>;
    failureReason?: string;
  }): Promise<void>;
  findById(id: string): Promise<StoredAgentTask | null>;
  findByReportId(reportId: string): Promise<StoredAgentTask[]>;
}

interface AgentTaskRow {
  id: string;
  feedback_report_id: string;
  project_id: string | null;
  processing_job_id: string | null;
  requested_by: string;
  target_repository: string;
  title: string;
  objective: string;
  execution_mode: StoredAgentTask['executionMode'];
  acceptance_criteria: string[];
  context_notes: string | null;
  status: StoredAgentTask['status'];
  prepared_context: Record<string, unknown>;
  failure_reason: string | null;
}

function mapRow(row: AgentTaskRow): StoredAgentTask {
  return {
    id: row.id,
    feedbackReportId: row.feedback_report_id,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    requestedBy: row.requested_by,
    targetRepository: row.target_repository,
    title: row.title,
    objective: row.objective,
    executionMode: row.execution_mode,
    acceptanceCriteria: row.acceptance_criteria,
    status: row.status,
    preparedContext: row.prepared_context,
    ...(row.processing_job_id ? { processingJobId: row.processing_job_id } : {}),
    ...(row.context_notes ? { contextNotes: row.context_notes } : {}),
    ...(row.failure_reason ? { failureReason: row.failure_reason } : {})
  };
}

export function createAgentTaskRepository(database: DatabaseClient): AgentTaskRepository {
  return {
    async create(task) {
      await database.query(
        `INSERT INTO agent_tasks (
          id,
          feedback_report_id,
          project_id,
          processing_job_id,
          requested_by,
          target_repository,
          title,
          objective,
          execution_mode,
          acceptance_criteria,
          context_notes,
          status,
          prepared_context,
          failure_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          task.id,
          task.feedbackReportId,
          task.projectId ?? null,
          task.processingJobId ?? null,
          task.requestedBy,
          task.targetRepository,
          task.title,
          task.objective,
          task.executionMode,
          JSON.stringify(task.acceptanceCriteria),
          task.contextNotes ?? null,
          task.status,
          JSON.stringify(task.preparedContext),
          task.failureReason ?? null
        ]
      );
    },
    async updateProcessingJobId(id, processingJobId) {
      await database.query(
        `UPDATE agent_tasks
         SET processing_job_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [id, processingJobId]
      );
    },
    async updateStatus(id, status, options) {
      await database.query(
        `UPDATE agent_tasks
         SET status = $2,
             prepared_context = COALESCE($3, prepared_context),
             failure_reason = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          status,
          options?.preparedContext ? JSON.stringify(options.preparedContext) : null,
          options?.failureReason ?? null
        ]
      );
    },
    async findById(id) {
      const result = await database.query<AgentTaskRow>(
        `SELECT id, feedback_report_id, project_id, processing_job_id, requested_by, target_repository, title, objective,
                execution_mode, acceptance_criteria, context_notes, status, prepared_context, failure_reason
         FROM agent_tasks
         WHERE id = $1`,
        [id]
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },
    async findByReportId(reportId) {
      const result = await database.query<AgentTaskRow>(
        `SELECT id, feedback_report_id, project_id, processing_job_id, requested_by, target_repository, title, objective,
                execution_mode, acceptance_criteria, context_notes, status, prepared_context, failure_reason
         FROM agent_tasks
         WHERE feedback_report_id = $1
         ORDER BY created_at DESC`,
        [reportId]
      );

      return result.rows.map(mapRow);
    }
  };
}