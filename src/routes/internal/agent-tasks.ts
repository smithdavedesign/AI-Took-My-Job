import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildExecutionCloseout } from '../../services/agent-tasks/execution-closeout.js';
import { isGitHubRepository, promoteExecutionPullRequest } from '../../services/agent-tasks/pull-request-promotion.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const promoteExecutionSchema = z.object({
  draft: z.boolean().optional()
});

const mergeExecutionSchema = z.object({
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional()
});

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

const executionIdParamsSchema = z.object({
  executionId: z.string().uuid()
});

const executionReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes: z.string().min(1).max(5000).optional()
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

  app.post('/internal/agent-tasks/:taskId/execute', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { taskId } = taskIdParamsSchema.parse(request.params);
    const task = await app.agentTasks.findById(taskId);

    if (!task) {
      throw app.httpErrors.notFound('agent task not found');
    }

    if (!['ready', 'completed'].includes(task.status)) {
      throw app.httpErrors.conflict(`agent task must be ready before execution, current status: ${task.status}`);
    }

    const executionId = randomUUID();
    await app.agentTaskExecutions.create({
      id: executionId,
      agentTaskId: taskId,
      status: 'queued',
      resultSummary: {},
      findings: [],
      validationEvidence: {}
    });

    const queueResult = await app.jobs.enqueue({
      type: 'agent-execution',
      reportId: task.feedbackReportId,
      source: 'agent-task',
      priority: 70,
      payload: {
        agentTaskId: taskId,
        executionId
      }
    });

    await app.agentTaskExecutions.updateProcessingJobId(executionId, queueResult.jobId);

    await app.audit.write({
      eventType: 'agent_task.execution_requested',
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        agentTaskId: taskId,
        executionId,
        processingJobId: queueResult.jobId
      }
    });

    return reply.code(202).send({
      accepted: true,
      executionId,
      processingJobId: queueResult.jobId,
      status: 'queued'
    });
  });

  app.get('/internal/agent-tasks/:taskId/executions', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { taskId } = taskIdParamsSchema.parse(request.params);
    return app.agentTaskExecutions.findByTaskId(taskId);
  });

  app.get('/internal/agent-task-executions/:executionId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    return execution;
  });

  app.get('/internal/agent-task-executions/:executionId/artifacts', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    return app.artifacts.findByExecutionId(executionId);
  });

  app.get('/internal/agent-task-executions/:executionId/replay-validation', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    const replayValidation = await app.agentTaskReplayValidations.findByExecutionId(executionId);

    if (!replayValidation) {
      throw app.httpErrors.notFound('replay validation not found for execution');
    }

    return replayValidation;
  });

  app.get('/internal/agent-task-executions/:executionId/validation-policy', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    const policy = await app.agentTaskValidationPolicies.findByExecutionId(executionId);
    if (!policy) {
      throw app.httpErrors.notFound('validation policy not found for execution');
    }

    return policy;
  });

  app.get('/internal/agent-task-executions/:executionId/closeout', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    const task = await app.agentTasks.findById(execution.agentTaskId);
    if (!task) {
      throw app.httpErrors.notFound('agent task not found');
    }

    const [review, pullRequest, validationPolicy] = await Promise.all([
      app.agentTaskExecutionReviews.findByExecutionId(executionId),
      app.agentTaskExecutionPullRequests.findByExecutionId(executionId),
      app.agentTaskValidationPolicies.findByExecutionId(executionId)
    ]);

    return buildExecutionCloseout({
      ...(app.config.APP_BASE_URL ? { baseUrl: app.config.APP_BASE_URL } : {}),
      task,
      execution,
      review,
      pullRequest,
      validationPolicy,
      githubPromotionEnabled: app.github.enabled && isGitHubRepository(task.targetRepository)
    });
  });

  app.get('/internal/agent-task-executions/:executionId/review', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    const review = await app.agentTaskExecutionReviews.findByExecutionId(executionId);
    if (!review) {
      return {
        agentTaskExecutionId: executionId,
        status: 'pending'
      };
    }

    return review;
  });

  app.post('/internal/agent-task-executions/:executionId/review', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const payload = executionReviewSchema.parse(request.body);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    if (['queued', 'running'].includes(execution.status)) {
      throw app.httpErrors.conflict(`agent task execution cannot be reviewed while status is ${execution.status}`);
    }

    const review = {
      id: randomUUID(),
      agentTaskExecutionId: executionId,
      status: payload.status,
      reviewerId: principal.id,
      reviewedAt: new Date().toISOString(),
      ...(payload.notes ? { notes: payload.notes } : {})
    } as const;

    await app.agentTaskExecutionReviews.upsert(review);

    await app.agentTaskExecutions.update({
      ...execution,
      resultSummary: {
        ...execution.resultSummary,
        reviewStatus: payload.status,
        reviewUpdatedAt: review.reviewedAt
      },
      validationEvidence: {
        ...execution.validationEvidence,
        review: {
          status: payload.status,
          reviewerId: principal.id,
          notes: payload.notes ?? null,
          reviewedAt: review.reviewedAt
        }
      }
    });

    await app.audit.write({
      eventType: 'agent_task.execution_reviewed',
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        executionId,
        status: payload.status,
        ...(payload.notes ? { notes: payload.notes } : {})
      }
    });

    return review;
  });

  app.get('/internal/agent-task-executions/:executionId/pull-request', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    const pullRequest = await app.agentTaskExecutionPullRequests.findByExecutionId(executionId);
    if (!pullRequest) {
      throw app.httpErrors.notFound('pull request record not found for execution');
    }

    return pullRequest;
  });

  app.post('/internal/agent-task-executions/:executionId/promote', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = promoteExecutionSchema.parse(request.body ?? {});

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    if (execution.status === 'pr-opened' || execution.pullRequestUrl) {
      throw app.httpErrors.conflict('agent task execution already has an opened pull request');
    }

    if (['queued', 'running', 'failed', 'cancelled'].includes(execution.status)) {
      throw app.httpErrors.conflict(`agent task execution cannot be promoted while status is ${execution.status}`);
    }

    const task = await app.agentTasks.findById(execution.agentTaskId);
    if (!task) {
      throw app.httpErrors.notFound('agent task not found');
    }

    if (!app.github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    if (!isGitHubRepository(task.targetRepository)) {
      throw app.httpErrors.conflict('agent task target repository does not support GitHub promotion');
    }

    const review = await app.agentTaskExecutionReviews.findByExecutionId(executionId);
    if (!review || review.status !== 'approved') {
      throw app.httpErrors.conflict('agent task execution must be approved before promotion');
    }

    const validationStatus = typeof execution.resultSummary.validationStatus === 'string'
      ? execution.resultSummary.validationStatus
      : 'not-run';
    if (validationStatus === 'failed') {
      throw app.httpErrors.conflict('agent task execution cannot be promoted while validation is failed');
    }

    const contractStatus = typeof execution.resultSummary.contractStatus === 'string'
      ? execution.resultSummary.contractStatus
      : 'not-run';
    if (contractStatus === 'failed') {
      throw app.httpErrors.conflict('agent task execution cannot be promoted while the agent output contract is mismatched');
    }

    const replayContext = task.preparedContext.replay && typeof task.preparedContext.replay === 'object'
      ? task.preparedContext.replay as Record<string, unknown>
      : null;
    const replayValidation = execution.validationEvidence.replayValidation && typeof execution.validationEvidence.replayValidation === 'object'
      ? execution.validationEvidence.replayValidation as Record<string, unknown>
      : null;
    if (replayContext && (!replayValidation || replayValidation.status !== 'passed')) {
      throw app.httpErrors.conflict('agent task execution cannot be promoted until replay-backed validation has passed');
    }

    const existingPullRequest = await app.agentTaskExecutionPullRequests.findByExecutionId(executionId);

    try {
      const promoted = await promoteExecutionPullRequest({
        config: app.config,
        github: app.github,
        task,
        execution,
        ...(typeof payload.draft === 'boolean' ? { draft: payload.draft } : {})
      });
      const promotedAt = new Date().toISOString();

      await app.agentTaskExecutionPullRequests.upsert({
        id: existingPullRequest?.id ?? randomUUID(),
        agentTaskExecutionId: executionId,
        repository: task.targetRepository,
        headBranch: execution.branchName ?? 'unknown',
        baseBranch: execution.baseBranch ?? 'unknown',
        ...(typeof execution.resultSummary.commitSha === 'string' ? { headCommitSha: execution.resultSummary.commitSha } : {}),
        pullRequestNumber: promoted.pullRequestNumber,
        pullRequestUrl: promoted.pullRequestUrl,
        draft: payload.draft ?? true,
        status: 'opened',
        promotedBy: principal.id,
        promotedAt,
        metadata: {
          reviewStatus: review.status,
          validationStatus
        }
      });

      const promotedExecution = {
        ...execution,
        status: 'pr-opened' as const,
        pullRequestUrl: promoted.pullRequestUrl,
        resultSummary: {
          ...execution.resultSummary,
          outcome: 'pr-opened',
          nextAction: 'await-human-review',
          pullRequestUrl: promoted.pullRequestUrl
        },
        validationEvidence: {
          ...execution.validationEvidence,
          reviewGate: {
            required: true,
            status: 'approved'
          },
          pullRequest: {
            status: 'opened',
            number: promoted.pullRequestNumber,
            url: promoted.pullRequestUrl,
            draft: payload.draft ?? true,
            promotedBy: principal.id,
            promotedAt
          }
        }
      };

      await app.agentTaskExecutions.update(promotedExecution);
      await app.agentTasks.updateStatus(task.id, 'completed', {
        preparedContext: {
          ...task.preparedContext,
          execution: {
            ...(task.preparedContext.execution && typeof task.preparedContext.execution === 'object'
              ? task.preparedContext.execution as Record<string, unknown>
              : {}),
            executionId,
            resultSummary: promotedExecution.resultSummary,
            validationEvidence: promotedExecution.validationEvidence,
            pullRequestUrl: promoted.pullRequestUrl
          }
        }
      });

      await app.audit.write({
        eventType: 'agent_task.execution_promoted',
        actorType: 'system',
        actorId: principal.id,
        requestId: request.id,
        payload: {
          executionId,
          agentTaskId: task.id,
          pullRequestUrl: promoted.pullRequestUrl,
          pullRequestNumber: promoted.pullRequestNumber
        }
      });

      return {
        promoted: true,
        executionId,
        pullRequestNumber: promoted.pullRequestNumber,
        pullRequestUrl: promoted.pullRequestUrl,
        status: 'pr-opened'
      };
    } catch (error) {
      await app.agentTaskExecutionPullRequests.upsert({
        id: existingPullRequest?.id ?? randomUUID(),
        agentTaskExecutionId: executionId,
        repository: task.targetRepository,
        headBranch: execution.branchName ?? 'unknown',
        baseBranch: execution.baseBranch ?? 'unknown',
        ...(typeof execution.resultSummary.commitSha === 'string' ? { headCommitSha: execution.resultSummary.commitSha } : {}),
        draft: payload.draft ?? true,
        status: 'promotion-failed',
        promotedBy: principal.id,
        promotedAt: new Date().toISOString(),
        metadata: {
          error: error instanceof Error ? error.message : 'unknown pull request promotion failure'
        }
      });

      await app.audit.write({
        eventType: 'agent_task.execution_promotion_failed',
        actorType: 'system',
        actorId: principal.id,
        requestId: request.id,
        payload: {
          executionId,
          agentTaskId: task.id,
          error: error instanceof Error ? error.message : 'unknown pull request promotion failure'
        }
      });

      await app.agentTaskExecutions.update({
        ...execution,
        validationEvidence: {
          ...execution.validationEvidence,
          pullRequest: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'unknown pull request promotion failure'
          }
        }
      });

      throw error;
    }
  });

  app.post('/internal/agent-task-executions/:executionId/merge', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = mergeExecutionSchema.parse(request.body ?? {});

    const { executionId } = executionIdParamsSchema.parse(request.params);
    const execution = await app.agentTaskExecutions.findById(executionId);

    if (!execution) {
      throw app.httpErrors.notFound('agent task execution not found');
    }

    if (execution.status !== 'pr-opened') {
      throw app.httpErrors.conflict(`agent task execution cannot be merged while status is ${execution.status}`);
    }

    const task = await app.agentTasks.findById(execution.agentTaskId);
    if (!task) {
      throw app.httpErrors.notFound('agent task not found');
    }

    const review = await app.agentTaskExecutionReviews.findByExecutionId(executionId);
    if (!review || review.status !== 'approved') {
      throw app.httpErrors.conflict('agent task execution must be approved before merge');
    }

    const pullRequest = await app.agentTaskExecutionPullRequests.findByExecutionId(executionId);
    if (!pullRequest || !pullRequest.pullRequestNumber) {
      throw app.httpErrors.conflict('agent task execution has no persisted pull request metadata');
    }

    if (!app.github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    try {
      const merged = await app.github.mergePullRequest({
        repository: task.targetRepository,
        pullRequestNumber: pullRequest.pullRequestNumber,
        ...(payload.mergeMethod ? { mergeMethod: payload.mergeMethod } : {})
      });
      const mergedAt = new Date().toISOString();

      await app.agentTaskExecutionPullRequests.upsert({
        ...pullRequest,
        status: 'merged',
        mergedBy: principal.id,
        mergedAt,
        mergeCommitSha: merged.mergeCommitSha,
        metadata: {
          ...pullRequest.metadata,
          mergeMethod: payload.mergeMethod ?? 'merge',
          mergeMessage: merged.message
        }
      });

      const completedExecution = {
        ...execution,
        status: 'completed' as const,
        resultSummary: {
          ...execution.resultSummary,
          outcome: 'merged',
          nextAction: 'none',
          mergedAt,
          mergeCommitSha: merged.mergeCommitSha
        },
        validationEvidence: {
          ...execution.validationEvidence,
          pullRequest: {
            ...(execution.validationEvidence.pullRequest && typeof execution.validationEvidence.pullRequest === 'object'
              ? execution.validationEvidence.pullRequest as Record<string, unknown>
              : {}),
            status: 'merged',
            number: pullRequest.pullRequestNumber,
            url: pullRequest.pullRequestUrl ?? execution.pullRequestUrl ?? null,
            mergedBy: principal.id,
            mergedAt,
            mergeCommitSha: merged.mergeCommitSha,
            mergeMethod: payload.mergeMethod ?? 'merge'
          }
        }
      };

      await app.agentTaskExecutions.update(completedExecution);
      await app.audit.write({
        eventType: 'agent_task.execution_merged',
        actorType: 'system',
        actorId: principal.id,
        requestId: request.id,
        payload: {
          executionId,
          agentTaskId: task.id,
          pullRequestNumber: pullRequest.pullRequestNumber,
          ...(pullRequest.pullRequestUrl ? { pullRequestUrl: pullRequest.pullRequestUrl } : {}),
          mergeCommitSha: merged.mergeCommitSha,
          mergeMethod: payload.mergeMethod ?? 'merge'
        }
      });

      return {
        merged: true,
        executionId,
        pullRequestNumber: pullRequest.pullRequestNumber,
        pullRequestUrl: pullRequest.pullRequestUrl ?? execution.pullRequestUrl ?? null,
        mergeCommitSha: merged.mergeCommitSha,
        status: 'completed'
      };
    } catch (error) {
      await app.agentTaskExecutionPullRequests.upsert({
        ...pullRequest,
        status: 'merge-failed',
        metadata: {
          ...pullRequest.metadata,
          mergeMethod: payload.mergeMethod ?? 'merge',
          error: error instanceof Error ? error.message : 'unknown merge failure'
        }
      });

      await app.audit.write({
        eventType: 'agent_task.execution_merge_failed',
        actorType: 'system',
        actorId: principal.id,
        requestId: request.id,
        payload: {
          executionId,
          agentTaskId: task.id,
          pullRequestNumber: pullRequest.pullRequestNumber,
          error: error instanceof Error ? error.message : 'unknown merge failure'
        }
      });

      throw error;
    }
  });

  app.get('/internal/reports/:reportId/agent-tasks', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    return app.agentTasks.findByReportId(reportId);
  });
}