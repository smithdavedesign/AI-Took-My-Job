import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';
import type { StoredShadowSuite } from '../../types/shadow-suite.js';

const replayOutcomeSchema = z.enum(['reproduced', 'not-reproduced', 'partial', 'execution-failed']);

const createShadowSuiteSchema = z.object({
  reportId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  environment: z.string().min(1).max(100).optional(),
  targetOrigin: z.string().url().optional(),
  cadenceSeconds: z.coerce.number().int().min(60).max(7 * 24 * 60 * 60).optional(),
  expectedOutcome: replayOutcomeSchema.optional(),
  retentionReason: z.string().min(1).max(4000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const updateShadowSuiteStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'retired'])
});

const runShadowSuiteSchema = z.object({
  targetOrigin: z.string().url().optional(),
  triggeredBy: z.string().min(1).max(255).optional()
});

const suiteIdParamsSchema = z.object({
  suiteId: z.string().uuid()
});

const listShadowSuitesQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'retired']).optional(),
  environment: z.string().min(1).max(100).optional()
});

const runDueShadowSuitesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  environment: z.string().min(1).max(100).optional(),
  triggeredBy: z.string().min(1).max(255).optional()
});

function queueShadowSuiteRun(app: FastifyInstance, input: {
  suite: StoredShadowSuite;
  runId: string;
  targetOrigin?: string;
  triggeredBy?: string;
}): Promise<{ jobId: string }> {
  return app.jobs.enqueue({
    type: 'shadow-suite-run',
    reportId: input.suite.feedbackReportId,
    source: `shadow-suite:${input.suite.environment}`,
    priority: 40,
    payload: {
      shadowSuiteId: input.suite.id,
      shadowSuiteRunId: input.runId,
      targetOrigin: input.targetOrigin ?? input.suite.targetOrigin ?? null,
      expectedOutcome: input.suite.expectedOutcome,
      triggeredBy: input.triggeredBy ?? null
    }
  });
}

export function registerShadowSuiteInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/shadow-suites', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const query = listShadowSuitesQuerySchema.parse(request.query);
    return app.shadowSuites.list({
      ...(query.status ? { status: query.status } : {}),
      ...(query.environment ? { environment: query.environment } : {})
    });
  });

  app.post('/internal/shadow-suites', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createShadowSuiteSchema.parse(request.body ?? {});

    const report = await app.reports.findById(payload.reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const replay = await app.replayRuns.findLatestByReportId(payload.reportId);
    if (!replay) {
      throw app.httpErrors.conflict('report must have a replay run before it can be retained in the shadow suite');
    }

    const now = new Date();
    const cadenceSeconds = payload.cadenceSeconds ?? 3600;
    const suite: StoredShadowSuite = {
      id: randomUUID(),
      feedbackReportId: payload.reportId,
      replayRunId: replay.id,
      name: payload.name ?? report.title ?? `Shadow suite ${payload.reportId}`,
      environment: payload.environment ?? 'staging',
      cadenceSeconds,
      expectedOutcome: payload.expectedOutcome ?? 'reproduced',
      status: 'active',
      metadata: {
        ...(payload.metadata ?? {}),
        createdBy: principal.id,
        source: report.source,
        severity: report.severity
      },
      nextRunAt: new Date(now.getTime() + cadenceSeconds * 1000).toISOString(),
      ...(payload.targetOrigin ? { targetOrigin: payload.targetOrigin } : {}),
      ...(payload.retentionReason ? { retentionReason: payload.retentionReason } : {})
    };

    await app.shadowSuites.create(suite);
    return {
      created: true,
      shadowSuiteId: suite.id,
      suite
    };
  });

  app.get('/internal/shadow-suites/:suiteId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { suiteId } = suiteIdParamsSchema.parse(request.params);
    const suite = await app.shadowSuites.findById(suiteId);
    if (!suite) {
      throw app.httpErrors.notFound('shadow suite not found');
    }

    return suite;
  });

  app.post('/internal/shadow-suites/:suiteId/status', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { suiteId } = suiteIdParamsSchema.parse(request.params);
    const payload = updateShadowSuiteStatusSchema.parse(request.body ?? {});
    const suite = await app.shadowSuites.findById(suiteId);
    if (!suite) {
      throw app.httpErrors.notFound('shadow suite not found');
    }

    const updated: StoredShadowSuite = {
      ...suite,
      status: payload.status
    };
    await app.shadowSuites.update(updated);

    return {
      updated: true,
      suite: updated
    };
  });

  app.get('/internal/shadow-suites/:suiteId/runs', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { suiteId } = suiteIdParamsSchema.parse(request.params);
    return app.shadowSuiteRuns.findBySuiteId(suiteId);
  });

  app.post('/internal/shadow-suites/:suiteId/run', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { suiteId } = suiteIdParamsSchema.parse(request.params);
    const payload = runShadowSuiteSchema.parse(request.body ?? {});
    const suite = await app.shadowSuites.findById(suiteId);

    if (!suite) {
      throw app.httpErrors.notFound('shadow suite not found');
    }

    const runId = randomUUID();
    const targetOrigin = payload.targetOrigin ?? suite.targetOrigin;
    await app.shadowSuiteRuns.create({
      id: runId,
      shadowSuiteId: suite.id,
      status: 'queued',
      expectedOutcome: suite.expectedOutcome,
      summary: {
        queuedAt: new Date().toISOString()
      },
      ...(targetOrigin ? { targetOrigin } : {}),
      triggeredBy: payload.triggeredBy ?? principal.id
    });

    const queued = await queueShadowSuiteRun(app, {
      suite,
      runId,
      ...(targetOrigin ? { targetOrigin } : {}),
      triggeredBy: payload.triggeredBy ?? principal.id
    });

    return {
      queued: true,
      shadowSuiteId: suite.id,
      shadowSuiteRunId: runId,
      jobId: queued.jobId
    };
  });

  app.post('/internal/shadow-suites/run-due', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = runDueShadowSuitesSchema.parse(request.body ?? {});
    const dueSuites = await app.shadowSuites.listDue(payload.limit ?? 25, payload.environment);
    const queuedRuns: Array<Record<string, unknown>> = [];

    for (const suite of dueSuites) {
      const runId = randomUUID();
      await app.shadowSuiteRuns.create({
        id: runId,
        shadowSuiteId: suite.id,
        status: 'queued',
        expectedOutcome: suite.expectedOutcome,
        summary: {
          queuedAt: new Date().toISOString(),
          mode: 'due-scan'
        },
        ...(suite.targetOrigin ? { targetOrigin: suite.targetOrigin } : {}),
        triggeredBy: payload.triggeredBy ?? principal.id
      });
      const queued = await queueShadowSuiteRun(app, {
        suite,
        runId,
        triggeredBy: payload.triggeredBy ?? principal.id
      });
      queuedRuns.push({
        shadowSuiteId: suite.id,
        shadowSuiteRunId: runId,
        jobId: queued.jobId
      });
    }

    return {
      queuedCount: queuedRuns.length,
      runs: queuedRuns
    };
  });
}