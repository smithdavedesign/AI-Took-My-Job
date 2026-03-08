import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const createAgentTaskSchema = z.object({
  reportId: z.string().uuid(),
  targetRepository: z.string().min(1).max(255).optional(),
  title: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).max(5000),
  executionMode: z.enum(['investigate', 'fix']).default('fix'),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).max(20).default([]),
  contextNotes: z.string().min(1).max(5000).optional()
});

const taskIdParamsSchema = z.object({
  taskId: z.string().uuid()
});

const reportIdParamsSchema = z.object({
  reportId: z.string().uuid()
});

function mapSeverityToPriority(severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical'): number {
  switch (severity) {
    case 'critical':
      return 95;
    case 'high':
      return 80;
    case 'medium':
      return 60;
    case 'low':
      return 40;
    case 'unknown':
    default:
      return 50;
  }
}

export function registerAgentTaskInternalRoutes(app: FastifyInstance): void {
  app.post('/internal/agent-tasks', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createAgentTaskSchema.parse(request.body);

    const report = await app.reports.findById(payload.reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const existingDraft = await app.githubIssueLinks.findByReportId(report.id);
    const taskId = randomUUID();
    const targetRepository = payload.targetRepository
      ?? existingDraft?.repository
      ?? app.github.repository
      ?? 'local-only';
    const title = payload.title ?? report.title ?? `Agent task for report ${report.id}`;

    await app.agentTasks.create({
      id: taskId,
      feedbackReportId: report.id,
      requestedBy: principal.id,
      targetRepository,
      title,
      objective: payload.objective,
      executionMode: payload.executionMode,
      acceptanceCriteria: payload.acceptanceCriteria,
      status: 'queued',
      preparedContext: {},
      ...(payload.contextNotes ? { contextNotes: payload.contextNotes } : {})
    });

    const queueResult = await app.jobs.enqueue({
      type: 'agent-task',
      reportId: report.id,
      source: report.source,
      priority: mapSeverityToPriority(report.severity),
      payload: {
        agentTaskId: taskId,
        objective: payload.objective,
        executionMode: payload.executionMode,
        acceptanceCriteria: payload.acceptanceCriteria,
        ...(payload.contextNotes ? { contextNotes: payload.contextNotes } : {})
      }
    });

    await app.agentTasks.updateProcessingJobId(taskId, queueResult.jobId);

    await app.audit.write({
      eventType: 'agent_task.requested',
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        agentTaskId: taskId,
        reportId: report.id,
        processingJobId: queueResult.jobId,
        targetRepository,
        executionMode: payload.executionMode
      }
    });

    return reply.code(202).send({
      accepted: true,
      agentTaskId: taskId,
      processingJobId: queueResult.jobId,
      status: 'queued'
    });
  });

  app.get('/internal/agent-tasks/:taskId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { taskId } = taskIdParamsSchema.parse(request.params);
    const task = await app.agentTasks.findById(taskId);

    if (!task) {
      throw app.httpErrors.notFound('agent task not found');
    }

    return task;
  });

  app.get('/internal/reports/:reportId/agent-tasks', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    return app.agentTasks.findByReportId(reportId);
  });
}