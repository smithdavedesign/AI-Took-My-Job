import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { buildExecutionCloseout } from '../../services/agent-tasks/execution-closeout.js';
import { computeBranchCleanupPlan } from '../../services/agent-tasks/branch-cleanup.js';
import { isGitHubRepository, promoteExecutionPullRequest } from '../../services/agent-tasks/pull-request-promotion.js';
import {
  assertAutonomousPromotionBranchPolicy,
  isAutonomousTaskContext,
  parseTaskContextNotes
} from '../../support/agent-branch-policy.js';
import { upsertNotionExecutionLedger } from '../../services/notion/execution-ledger.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';
import { notifyRepoHQ } from '../../services/repohq/brief-fetcher.js';
import { resolveProjectRepositoryScope } from '../../support/project-repositories.js';

const promoteExecutionSchema = z.object({
  draft: z.boolean().optional()
});

const mergeExecutionSchema = z.object({
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional()
});

const createAgentTaskSchema = z.object({
  reportId: z.string().uuid().optional(),
  targetRepository: z.string().min(1).max(255).optional(),
  title: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).max(5000),
  executionMode: z.enum(['investigate', 'fix']).default('fix'),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).max(50).default([]),
  contextNotes: z.string().min(1).max(5000).optional()
});

const taskIdParamsSchema = z.object({
  taskId: z.string().uuid()
});

const executionIdParamsSchema = z.object({
  executionId: z.string().uuid()
});

const branchCleanupPreviewQuerySchema = z.object({
  ttlHours: z.coerce.number().int().min(1).max(24 * 90).optional(),
  maxItems: z.coerce.number().int().min(1).max(500).optional(),
  branchPrefix: z.string().min(1).max(200).optional()
});

const branchCleanupExecuteSchema = z.object({
  dryRun: z.boolean().optional(),
  ttlHours: z.coerce.number().int().min(1).max(24 * 90).optional(),
  maxItems: z.coerce.number().int().min(1).max(500).optional(),
  branchPrefix: z.string().min(1).max(200).optional()
});

const executionReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes: z.string().trim().min(1).max(5000).optional()
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

    // RepoHQ portfolio-score tasks arrive without a feedback report (source: 'portfolio-score')
    // For these we skip report lookup and create the task directly.
    const isPortfolioScoreTask = !payload.reportId;

    // Hoist so both branches can set and the common section can read
    let finalTaskId: string = '';
    let finalJobId: string = '';

    let report: Awaited<ReturnType<typeof app.reports.findById>> | null = null;
    if (!isPortfolioScoreTask) {
      report = await app.reports.findById(payload.reportId!);
      if (!report) {
        throw app.httpErrors.notFound('report not found');
      }

      const projectScope = report.projectId
        ? await resolveProjectRepositoryScope({
          projectId: report.projectId,
          repository: payload.targetRepository,
          projects: app.projects,
          repoConnections: app.repoConnections
        })
        : null;

      let approvedHostedFeedbackRepository: string | undefined;
      if (report.source === 'hosted-feedback') {
        const review = await app.reportReviews.findByReportId(report.id);
        if (!review || review.status !== 'approved') {
          throw app.httpErrors.conflict('hosted feedback reports require an approved review before agent tasks can be created');
        }

        if (!review.repository) {
          throw app.httpErrors.conflict('hosted feedback reports must be approved against a concrete project repository before agent tasks can be created');
        }

        approvedHostedFeedbackRepository = review.repository;
        if (payload.targetRepository && payload.targetRepository !== review.repository) {
          throw app.httpErrors.conflict('hosted feedback agent tasks must target the repository approved during review');
        }
      }

      const existingDraft = await app.githubIssueLinks.findByReportId(report.id);
      const defaultRepository = await app.github.resolveRepository({
        projectId: report.projectId,
        strictProjectScoped: Boolean(report.projectId)
      });
      const targetRepositoryForReport = payload.targetRepository
        ?? approvedHostedFeedbackRepository
        ?? existingDraft?.repository
        ?? defaultRepository
        ?? 'local-only';

      if (projectScope && isGitHubRepository(targetRepositoryForReport) && !projectScope.availableRepositories.includes(targetRepositoryForReport)) {
        throw app.httpErrors.conflict('agent task target repository is not an active connection for this project');
      }

      const title = payload.title ?? report.title ?? `Agent task for report ${report.id}`;
      const taskId = randomUUID();

      await app.agentTasks.create({
        id: taskId,
        feedbackReportId: report.id,
        ...(report.projectId ? { projectId: report.projectId } : {}),
        requestedBy: principal.id,
        targetRepository: targetRepositoryForReport,
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
      // The shared audit + response below read these; without them report-based tasks
      // were returned as `agentTaskId: ""` (regressed when reportId became optional).
      finalTaskId = taskId;
      finalJobId = queueResult.jobId;
    } else {
      // Portfolio-score task: create a synthetic report to satisfy the NOT NULL FK
      if (!payload.targetRepository) {
        throw app.httpErrors.badRequest('targetRepository is required when no reportId is provided');
      }

      const syntheticReportId = randomUUID();
      await app.reports.create({
        id: syntheticReportId,
        source: 'portfolio-score',
        status: 'triaged',
        severity: 'medium',
        payload: {
          source: 'repohq-advisor',
          targetRepository: payload.targetRepository,
          objective: payload.objective,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      finalTaskId = randomUUID();
      const title = payload.title ?? `Portfolio task: ${payload.objective.slice(0, 80)}`;

      await app.agentTasks.create({
        id: finalTaskId,
        feedbackReportId: syntheticReportId,
        requestedBy: principal.id,
        targetRepository: payload.targetRepository,
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
        reportId: syntheticReportId,
        source: 'portfolio-score',
        priority: 60,
        payload: {
          agentTaskId: finalTaskId,
          objective: payload.objective,
          executionMode: payload.executionMode,
          acceptanceCriteria: payload.acceptanceCriteria,
          ...(payload.contextNotes ? { contextNotes: payload.contextNotes } : {})
        }
      });

      finalJobId = queueResult.jobId;
      await app.agentTasks.updateProcessingJobId(finalTaskId, queueResult.jobId);
    } // end else (portfolio-score task)

    // Common audit + response for both paths
    await app.audit.write({
      eventType: 'agent_task.requested',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        agentTaskId: finalTaskId,
        ...(report ? { reportId: report.id } : { source: 'portfolio-score' }),
        processingJobId: finalJobId,
        executionMode: payload.executionMode
      }
    });

    return reply.code(202).send({
      accepted: true,
      agentTaskId: finalTaskId,
      processingJobId: finalJobId,
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
      actorType: 'service',
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
      githubPromotionEnabled: await app.github.isEnabled({
        projectId: task.projectId,
        repository: task.targetRepository,
        strictProjectScoped: Boolean(task.projectId)
      }) && isGitHubRepository(task.targetRepository)
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

    const reviewNotes = payload.notes?.trim();
    if (!reviewNotes) {
      throw app.httpErrors.conflict('agent task execution review requires explicit notes');
    }

    const review = {
      id: randomUUID(),
      agentTaskExecutionId: executionId,
      status: payload.status,
      reviewerId: principal.id,
      reviewedAt: new Date().toISOString(),
      notes: reviewNotes
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
          notes: reviewNotes,
          reviewedAt: review.reviewedAt
        }
      }
    });

    await app.audit.write({
      eventType: 'agent_task.execution_reviewed',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        executionId,
        status: payload.status,
        notes: reviewNotes
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

  app.get('/internal/agent-task-branches/cleanup-preview', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const query = branchCleanupPreviewQuerySchema.parse(request.query ?? {});

    const ttlHours = query.ttlHours ?? app.config.AGENT_BRANCH_TTL_HOURS;
    const maxItems = query.maxItems ?? app.config.AGENT_BRANCH_CLEANUP_MAX_PER_RUN;
    const branchPrefix = query.branchPrefix ?? 'feature/bot';

    const candidates = await app.agentTaskExecutions.findBranchCleanupCandidates({
      ttlHours,
      maxItems,
      branchPrefix
    });

    const plan = computeBranchCleanupPlan({
      now: new Date(),
      ttlHours,
      maxItems,
      candidates
    });

    return {
      ...plan,
      branchPrefix,
      cleanupEnabled: app.config.AGENT_BRANCH_CLEANUP_ENABLED,
      note: 'Scaffold preview only. No remote branches are deleted by this endpoint yet.'
    };
  });

  app.post('/internal/agent-task-branches/cleanup-execute', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = branchCleanupExecuteSchema.parse(request.body ?? {});

    const dryRun = payload.dryRun ?? true;
    if (!dryRun && !app.config.AGENT_BRANCH_CLEANUP_ENABLED) {
      throw app.httpErrors.conflict('branch cleanup execution is disabled; set AGENT_BRANCH_CLEANUP_ENABLED=true to enable deletion');
    }

    const ttlHours = payload.ttlHours ?? app.config.AGENT_BRANCH_TTL_HOURS;
    const maxItems = payload.maxItems ?? app.config.AGENT_BRANCH_CLEANUP_MAX_PER_RUN;
    const branchPrefix = payload.branchPrefix ?? 'feature/bot';

    const candidates = await app.agentTaskExecutions.findBranchCleanupCandidates({
      ttlHours,
      maxItems,
      branchPrefix
    });

    const now = new Date();
    const plan = computeBranchCleanupPlan({
      now,
      ttlHours,
      maxItems,
      candidates
    });

    const results: Array<{ executionId: string; repository: string; branchName: string; deleted: boolean; error?: string }> = [];

    for (const candidate of plan.candidates) {
      if (dryRun) {
        results.push({
          executionId: candidate.executionId,
          repository: candidate.targetRepository,
          branchName: candidate.branchName,
          deleted: false
        });
        continue;
      }

      try {
        const github = await app.github.resolve({ repository: candidate.targetRepository });
        if (!github.enabled) {
          results.push({
            executionId: candidate.executionId,
            repository: candidate.targetRepository,
            branchName: candidate.branchName,
            deleted: false,
            error: 'GitHub integration disabled for repository'
          });
          continue;
        }

        await github.deleteBranch({
          repository: candidate.targetRepository,
          branch: candidate.branchName
        });

        results.push({
          executionId: candidate.executionId,
          repository: candidate.targetRepository,
          branchName: candidate.branchName,
          deleted: true
        });
      } catch (error) {
        results.push({
          executionId: candidate.executionId,
          repository: candidate.targetRepository,
          branchName: candidate.branchName,
          deleted: false,
          error: error instanceof Error ? error.message : 'unknown branch cleanup error'
        });
      }
    }

    await app.audit.write({
      eventType: 'agent_task.branch_cleanup_executed',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        dryRun,
        ttlHours,
        maxItems,
        branchPrefix,
        attempted: results.length,
        deleted: results.filter((item) => item.deleted).length,
        failed: results.filter((item) => !item.deleted && item.error).length
      }
    });

    return {
      dryRun,
      ttlHours,
      maxItems,
      branchPrefix,
      attempted: results.length,
      deleted: results.filter((item) => item.deleted).length,
      failed: results.filter((item) => !item.deleted && item.error).length,
      results
    };
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

    const github = await app.github.resolve({
      projectId: task.projectId,
      repository: task.targetRepository,
      strictProjectScoped: Boolean(task.projectId)
    });

    if (!github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    if (!isGitHubRepository(task.targetRepository)) {
      throw app.httpErrors.conflict('agent task target repository does not support GitHub promotion');
    }

    const review = await app.agentTaskExecutionReviews.findByExecutionId(executionId);
    if (!review || review.status !== 'approved') {
      throw app.httpErrors.conflict('agent task execution must be approved before promotion');
    }

    if (!review.notes?.trim()) {
      throw app.httpErrors.conflict('agent task execution approval must include review notes before promotion');
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

    const taskContextNotes = parseTaskContextNotes(task.contextNotes);
    const taskIsAutonomous = isAutonomousTaskContext(taskContextNotes);
    try {
      assertAutonomousPromotionBranchPolicy({
        isAutonomous: taskIsAutonomous,
        ...(execution.baseBranch ? { baseBranch: execution.baseBranch } : {}),
        integrationBaseBranch: app.config.AGENT_INTEGRATION_BASE_BRANCH
      });
    } catch (policyError) {
      throw app.httpErrors.conflict(policyError instanceof Error ? policyError.message : 'autonomous promotion policy violation');
    }

    try {
      const promoted = await promoteExecutionPullRequest({
        config: app.config,
        github,
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
        actorType: 'service',
        actorId: principal.id,
        requestId: request.id,
        payload: {
          executionId,
          agentTaskId: task.id,
          pullRequestUrl: promoted.pullRequestUrl,
          pullRequestNumber: promoted.pullRequestNumber
        }
      });

      // Phase 46C: notify RepoHQ that a PR was created
      void notifyRepoHQ(app.config, {
        eventType: 'agent_pr_created',
        taskId: task.id,
        ...(task.targetRepository ? { repoName: task.targetRepository.split('/')[1] } : {}),
        prUrl: promoted.pullRequestUrl,
        summary: `PR #${promoted.pullRequestNumber} created by Nexus agent`,
      });

      const ledgerSource = taskContextNotes.source;
      const ledgerSkill = taskContextNotes.skillName;

      void upsertNotionExecutionLedger(app.config, {
        executionId,
        taskId: task.id,
        repository: task.targetRepository,
        ...(execution.branchName ? { branchName: execution.branchName } : {}),
        ...(execution.baseBranch ? { baseBranch: execution.baseBranch } : {}),
        ...(typeof ledgerSource === 'string' ? { source: ledgerSource } : {}),
        ...(ledgerSkill ? { skillName: ledgerSkill } : {}),
        objective: task.objective,
        status: 'pr-opened',
        summary: `PR #${promoted.pullRequestNumber} created by Nexus agent`,
        pullRequestUrl: promoted.pullRequestUrl,
        terminalState: 'in-review'
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
        actorType: 'service',
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

    const github = await app.github.resolve({
      projectId: task.projectId,
      repository: task.targetRepository,
      strictProjectScoped: Boolean(task.projectId)
    });

    if (!github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    try {
      const merged = await github.mergePullRequest({
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
        actorType: 'service',
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

      // Phase 46C: notify RepoHQ that the PR was merged (triggers health resync + accuracy tracking)
      const mergeTaskContextNotes = typeof task.contextNotes === 'string' ? JSON.parse(task.contextNotes || '{}') : (task.contextNotes ?? {});
      void notifyRepoHQ(app.config, {
        eventType: 'agent_pr_merged',
        taskId: task.id,
        ...(task.targetRepository ? { repoName: task.targetRepository.split('/')[1] } : {}),
        ...(pullRequest.pullRequestUrl ? { prUrl: pullRequest.pullRequestUrl } : {}),
        summary: `PR #${pullRequest.pullRequestNumber} merged`,
      });

      const mergeContextNotes = parseTaskContextNotes(task.contextNotes);
      void upsertNotionExecutionLedger(app.config, {
        executionId,
        taskId: task.id,
        repository: task.targetRepository,
        ...(execution.branchName ? { branchName: execution.branchName } : {}),
        ...(execution.baseBranch ? { baseBranch: execution.baseBranch } : {}),
        ...(mergeContextNotes.source ? { source: mergeContextNotes.source } : {}),
        objective: task.objective,
        status: 'merged',
        summary: `PR #${pullRequest.pullRequestNumber} merged`,
        ...(pullRequest.pullRequestUrl ? { pullRequestUrl: pullRequest.pullRequestUrl } : {}),
        terminalState: 'merged'
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
        actorType: 'service',
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