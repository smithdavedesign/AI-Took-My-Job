import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const githubIssueDraftSchema = z.object({
  projectId: z.string().uuid().optional(),
  repository: z.string().min(1).max(255).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  labels: z.array(z.string().min(1)).max(20).optional()
});

export function registerGitHubInternalRoutes(app: FastifyInstance): void {
  app.post('/internal/github/issues/draft', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['github:draft']);

    const payload = githubIssueDraftSchema.parse(request.body);

    const github = await app.github.resolve({
      projectId: payload.projectId,
      repository: payload.repository
    });

    if (!github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    const created = await github.createIssueDraft({
      title: payload.title,
      body: payload.body,
      ...(payload.labels ? { labels: payload.labels } : {})
    });

    await app.audit.write({
      eventType: 'github.issue_draft_created',
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        issueNumber: created.number,
        issueUrl: created.url,
        title: payload.title,
        labels: payload.labels ?? []
      }
    });

    return reply.code(201).send({
      created: true,
      authMode: github.mode,
      issueNumber: created.number,
      issueUrl: created.url
    });
  });

  app.get('/internal/reports/:reportId/draft', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const paramsSchema = z.object({
      reportId: z.string().uuid()
    });

    const { reportId } = paramsSchema.parse(request.params);
    const draft = await app.githubIssueLinks.findByReportId(reportId);

    if (!draft) {
      throw app.httpErrors.notFound('draft not found');
    }

    return draft;
  });

  app.get('/internal/reports/:reportId/artifacts', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const paramsSchema = z.object({
      reportId: z.string().uuid()
    });

    const { reportId } = paramsSchema.parse(request.params);
    return app.artifacts.findByReportId(reportId);
  });
}