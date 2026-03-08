import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { safeEqual } from '../../support/http.js';

const githubIssueDraftSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  labels: z.array(z.string().min(1)).max(20).optional()
});

export function registerGitHubInternalRoutes(app: FastifyInstance): void {
  app.post('/internal/github/issues/draft', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'github.signature_rejected',
        actorType: 'integration',
        actorId: 'github',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = githubIssueDraftSchema.parse(request.body);

    if (!app.github.enabled) {
      throw app.httpErrors.conflict('GitHub draft sync is disabled');
    }

    const created = await app.github.createIssueDraft({
      title: payload.title,
      body: payload.body,
      ...(payload.labels ? { labels: payload.labels } : {})
    });

    await app.audit.write({
      eventType: 'github.issue_draft_created',
      actorType: 'system',
      actorId: app.github.mode,
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
      authMode: app.github.mode,
      issueNumber: created.number,
      issueUrl: created.url
    });
  });

  app.get('/internal/reports/:reportId/draft', async (request) => {
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
}