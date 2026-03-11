import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import {
  capturedArtifactEnvelopeSchema,
  normalizeCapturedUploads,
  persistCapturedArtifacts,
  summarizeUploads,
  validateUploadBudgets
} from '../../services/reports/captured-feedback.js';
import { ingestFeedbackReport } from '../../services/reports/report-ingestion.js';
import {
  buildCustomerPortalSummary,
  buildHostedFeedbackDashboardPage,
  buildHostedFeedbackEmbedScript,
  buildHostedFeedbackWidgetPage,
  buildPublicDashboardSummary
} from './project-feedback-ui.js';
import {
  createPublicCustomerPortalAccessToken,
  normalizeCustomerPortalEmail,
  requirePublicCustomerPortalToken
} from '../../support/public-customer-portal-access.js';
import { requirePublicWidgetSession } from '../../support/public-widget-access.js';
import { enforceRequestRateLimit } from '../../support/request-rate-limit.js';

const projectKeyParamsSchema = z.object({
  projectKey: z.string().min(3).max(80)
});

const widgetQuerySchema = z.object({
  embed: z.coerce.boolean().optional(),
  accessToken: z.string().min(32).optional()
});

const publicFeedbackSchema = z.object({
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000).optional(),
  pageUrl: z.url(),
  environment: z.enum(['local', 'development', 'staging', 'production']).default('production'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  reporter: z.object({
    id: z.string().min(1).max(120).optional(),
    name: z.string().min(1).max(120).optional(),
    email: z.email().optional(),
    role: z.enum(['end-user', 'support', 'qa', 'po', 'developer']).default('end-user')
  }).default({ role: 'end-user' }),
  signals: z.object({
    consoleErrorCount: z.number().int().min(0).default(0),
    networkErrorCount: z.number().int().min(0).default(0),
    stakeholderCount: z.number().int().min(1).default(1)
  }).default({ consoleErrorCount: 0, networkErrorCount: 0, stakeholderCount: 1 }),
  labels: z.array(z.string().min(1).max(64)).max(20).optional(),
  notes: z.string().max(5000).optional(),
  artifacts: capturedArtifactEnvelopeSchema.default({
    hasScreenRecording: false,
    hasHar: false,
    hasConsoleLogs: false,
    hasLocalStorageSnapshot: false,
    hasSessionStorageSnapshot: false
  })
});

function resolveReporterIdentifier(reporter: z.infer<typeof publicFeedbackSchema>['reporter']): string {
  return reporter.email ?? reporter.id ?? reporter.name ?? 'anonymous';
}

function applyHostedFeedbackHtmlHeaders(
  reply: { type: (value: string) => unknown; header: (name: string, value: string) => unknown },
  options: { allowEmbedding: boolean }
): void {
  reply.type('text/html; charset=utf-8');
  reply.header('cache-control', 'private, no-store');
  reply.header('x-robots-tag', 'noindex, nofollow');
  reply.header('referrer-policy', 'no-referrer');
  reply.header(
    'content-security-policy',
    `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' http: https:; font-src 'self' data: https:; frame-ancestors ${options.allowEmbedding ? '*' : "'self'"}; base-uri 'self'; form-action 'self'`
  );
}

function applyPublicResponseHeaders(reply: { header: (name: string, value: string) => unknown }): void {
  reply.header('cache-control', 'private, no-store');
  reply.header('x-robots-tag', 'noindex, nofollow');
  reply.header('referrer-policy', 'no-referrer');
}

export function registerProjectPublicRoutes(app: FastifyInstance): void {
  app.get('/public/projects/:projectKey/embed.js', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-embed',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const query = widgetQuerySchema.parse(request.query);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    requirePublicWidgetSession(app, request, reply, project);
    const accessToken = query.accessToken ?? (typeof request.headers['x-nexus-widget-token'] === 'string'
      ? request.headers['x-nexus-widget-token']
      : null);
    if (!accessToken) {
      throw app.httpErrors.unauthorized('missing widget access token');
    }

    reply.type('application/javascript; charset=utf-8');
    applyPublicResponseHeaders(reply);
    return buildHostedFeedbackEmbedScript(project, accessToken);
  });

  app.get('/public/projects/:projectKey/widget', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-widget',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const query = widgetQuerySchema.parse(request.query);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    requirePublicWidgetSession(app, request, reply, project);
    const accessToken = query.accessToken ?? (typeof request.headers['x-nexus-widget-token'] === 'string'
      ? request.headers['x-nexus-widget-token']
      : null);
    if (!accessToken) {
      throw app.httpErrors.unauthorized('missing widget access token');
    }

    applyHostedFeedbackHtmlHeaders(reply, { allowEmbedding: true });
    return buildHostedFeedbackWidgetPage(project, {
      embedded: query.embed === true,
      accessToken
    });
  });

  app.get('/public/projects/:projectKey/dashboard/summary', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-dashboard-summary',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const widgetSession = requirePublicWidgetSession(app, request, reply, project);
    applyPublicResponseHeaders(reply);
    return buildPublicDashboardSummary({
      app,
      project,
      widgetSession
    });
  });

  app.get('/public/projects/:projectKey/dashboard', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-dashboard',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const query = widgetQuerySchema.parse(request.query);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const widgetSession = requirePublicWidgetSession(app, request, reply, project);
    const accessToken = query.accessToken ?? (typeof request.headers['x-nexus-widget-token'] === 'string'
      ? request.headers['x-nexus-widget-token']
      : null);
    if (!accessToken) {
      throw app.httpErrors.unauthorized('missing widget access token');
    }

    const initialSummary = await buildPublicDashboardSummary({
      app,
      project,
      widgetSession
    });

    applyHostedFeedbackHtmlHeaders(reply, { allowEmbedding: false });
    return buildHostedFeedbackDashboardPage(project, {
      accessToken,
      initialSummary,
      summaryPath: `/public/projects/${project.projectKey}/dashboard/summary?accessToken=${encodeURIComponent(accessToken)}`
    });
  });

  app.get('/public/projects/:projectKey/customer-portal/summary', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-customer-portal-summary',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const claims = requirePublicCustomerPortalToken(app, request, reply, project);
    const grant = await app.customerPortalGrants.findById(claims.grantId);
    if (!grant || grant.projectId !== project.id || grant.status !== 'active') {
      throw app.httpErrors.forbidden('customer portal grant is not active');
    }

    if (grant.customerEmail !== claims.customerEmail) {
      throw app.httpErrors.forbidden('customer portal token email mismatch');
    }

    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
      throw app.httpErrors.forbidden('customer portal grant expired');
    }

    applyPublicResponseHeaders(reply);
    return buildCustomerPortalSummary({
      app,
      project,
      grant
    });
  });

  app.get('/public/projects/:projectKey/customer-portal', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-customer-portal',
      max: app.config.PUBLIC_ROUTE_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const query = widgetQuerySchema.parse(request.query);
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const claims = requirePublicCustomerPortalToken(app, request, reply, project);
    const accessToken = query.accessToken ?? (typeof request.headers['x-nexus-customer-portal-token'] === 'string'
      ? request.headers['x-nexus-customer-portal-token']
      : null);
    if (!accessToken) {
      throw app.httpErrors.unauthorized('missing customer portal access token');
    }

    const grant = await app.customerPortalGrants.findById(claims.grantId);
    if (!grant || grant.projectId !== project.id || grant.status !== 'active') {
      throw app.httpErrors.forbidden('customer portal grant is not active');
    }

    const initialSummary = await buildCustomerPortalSummary({
      app,
      project,
      grant
    });

    applyHostedFeedbackHtmlHeaders(reply, { allowEmbedding: false });
    return buildHostedFeedbackDashboardPage(project, {
      accessToken,
      initialSummary,
      summaryPath: `/public/projects/${project.projectKey}/customer-portal/summary?accessToken=${encodeURIComponent(accessToken)}`
    });
  });

  app.post('/public/projects/:projectKey/feedback', async (request, reply) => {
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    await enforceRequestRateLimit(app, request, reply, {
      bucket: 'public-feedback',
      max: app.config.PUBLIC_FEEDBACK_RATE_LIMIT_MAX,
      windowSeconds: app.config.PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_SECONDS,
      keyParts: [request.ip, projectKey]
    });
    const project = await app.projects.findByKey(projectKey);
    if (!project || project.status !== 'active') {
      throw app.httpErrors.notFound('project not found');
    }

    const widgetSession = requirePublicWidgetSession(app, request, reply, project);
    applyPublicResponseHeaders(reply);

    const payload = publicFeedbackSchema.parse(request.body);
    const sessionId = payload.sessionId ?? widgetSession.sessionId ?? `public-feedback-${randomUUID()}`;
    const uploads = normalizeCapturedUploads(payload.artifacts.uploads);
    validateUploadBudgets(app, [
      { key: 'screenRecording', upload: uploads.screenRecording },
      { key: 'har', upload: uploads.har },
      { key: 'consoleLogs', upload: uploads.consoleLogs },
      { key: 'localStorage', upload: uploads.localStorage },
      { key: 'sessionStorage', upload: uploads.sessionStorage }
    ]);

    const impactScore = computeInitialImpactScore({
      source: 'hosted-feedback',
      severity: payload.severity,
      breadth: payload.signals.stakeholderCount,
      frequency: payload.signals.consoleErrorCount + payload.signals.networkErrorCount
    });

    const payloadForStorage = {
      sessionId,
      title: payload.title,
      description: payload.description ?? null,
      pageUrl: payload.pageUrl,
      environment: payload.environment,
      severity: payload.severity,
      reporter: {
        ...payload.reporter,
        identifier: resolveReporterIdentifier(payload.reporter)
      },
      signals: payload.signals,
      labels: payload.labels ?? [],
      notes: payload.notes ?? null,
      artifacts: {
        ...payload.artifacts,
        ...(Object.keys(summarizeUploads(uploads)).length > 0
          ? { uploads: summarizeUploads(uploads) }
          : {})
      },
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      sourceSurface: 'hosted-widget',
      widgetSession: {
        id: widgetSession.sessionId,
        origin: widgetSession.origin ?? null,
        mode: widgetSession.mode,
        expiresAt: widgetSession.expiresAt
      },
      impactScore
    };

    const ingested = await ingestFeedbackReport(app, {
      projectId: project.id,
      source: 'hosted-feedback',
      externalId: sessionId,
      title: payload.title,
      severity: payload.severity,
      reporterIdentifier: resolveReporterIdentifier(payload.reporter),
      payload: payloadForStorage,
      triagePriority: impactScore
    });

    await persistCapturedArtifacts(app, {
      reportId: ingested.report.id,
      sessionId,
      environment: payload.environment,
      reporterId: resolveReporterIdentifier(payload.reporter),
      uploads,
      artifacts: payload.artifacts
    });

    const replayJobResult = payload.artifacts.hasHar || Boolean(uploads.har)
      ? await app.jobs.enqueue({
        type: 'replay',
        reportId: ingested.report.id,
        source: 'hosted-feedback',
        priority: impactScore,
        payload: {
          artifactType: 'har',
          projectId: project.id
        }
      })
      : null;

    await app.audit.write({
      eventType: 'public_feedback.received',
      actorType: 'user',
      actorId: resolveReporterIdentifier(payload.reporter),
      requestId: request.id,
      payload: {
        reportId: ingested.report.id,
        projectId: project.id,
        projectKey: project.projectKey,
        widgetSessionId: widgetSession.sessionId,
        jobId: ingested.triageJobId,
        ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
        impactScore,
        environment: payload.environment
      }
    });

    const dashboardAccessToken = typeof request.headers['x-nexus-widget-token'] === 'string'
      ? request.headers['x-nexus-widget-token']
      : typeof (request.query as Record<string, unknown> | undefined)?.accessToken === 'string'
        ? (request.query as Record<string, unknown>).accessToken as string
        : null;
    const customerPortalGrant = payload.reporter.email
      ? await app.customerPortalGrants.findActiveByProjectIdAndEmail(project.id, normalizeCustomerPortalEmail(payload.reporter.email))
      : null;
    const customerPortalAccess = customerPortalGrant
      ? createPublicCustomerPortalAccessToken(app.config, {
        grantId: customerPortalGrant.id,
        projectId: project.id,
        projectKey: project.projectKey,
        customerEmail: customerPortalGrant.customerEmail,
        expiresAt: customerPortalGrant.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
      })
      : null;

    return reply.code(202).send({
      accepted: true,
      reportId: ingested.report.id,
      jobId: ingested.triageJobId,
      ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      impactScore,
      dashboardUrl: dashboardAccessToken
        ? `/public/projects/${project.projectKey}/dashboard?accessToken=${encodeURIComponent(dashboardAccessToken)}`
        : `/public/projects/${project.projectKey}/dashboard`,
      ...(customerPortalAccess ? {
        customerPortalUrl: `/public/projects/${project.projectKey}/customer-portal?accessToken=${encodeURIComponent(customerPortalAccess.token)}`
      } : {})
    });
  });
}
