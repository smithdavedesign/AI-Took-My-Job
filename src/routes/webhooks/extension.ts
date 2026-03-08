import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import { safeEqual } from '../../support/http.js';

const extensionReportSchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  pageUrl: z.url(),
  environment: z.enum(['local', 'development', 'staging', 'production']).default('staging'),
  reporter: z.object({
    id: z.string().min(1),
    role: z.enum(['po', 'qa', 'designer', 'developer'])
  }),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  signals: z.object({
    consoleErrorCount: z.number().int().min(0).default(0),
    networkErrorCount: z.number().int().min(0).default(0),
    stakeholderCount: z.number().int().min(1).default(1)
  }),
  artifacts: z.object({
    hasScreenRecording: z.boolean().default(false),
    hasHar: z.boolean().default(false),
    hasLocalStorageSnapshot: z.boolean().default(false),
    hasSessionStorageSnapshot: z.boolean().default(false)
  }),
  notes: z.string().max(5000).optional()
});

export function registerExtensionWebhookRoute(app: FastifyInstance): void {
  app.post('/webhooks/extension/report', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'extension.signature_rejected',
        actorType: 'integration',
        actorId: 'extension',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = extensionReportSchema.parse(request.body);
    const reportId = randomUUID();
    const derivedFrequency = payload.signals.consoleErrorCount + payload.signals.networkErrorCount;
    const impactScore = computeInitialImpactScore({
      source: 'extension',
      severity: payload.severity,
      breadth: payload.signals.stakeholderCount,
      frequency: derivedFrequency
    });

    await app.reports.create({
      id: reportId,
      source: 'extension',
      externalId: payload.sessionId,
      title: payload.title,
      status: 'received',
      severity: payload.severity,
      reporterIdentifier: payload.reporter.id,
      payload: {
        ...payload,
        impactScore
      }
    });

    const queueResult = await app.jobs.enqueue({
      type: 'triage',
      reportId,
      source: 'extension',
      priority: impactScore,
      payload: {
        ...payload,
        impactScore
      }
    });

    await app.audit.write({
      eventType: 'extension.report_received',
      actorType: 'integration',
      actorId: payload.reporter.id,
      requestId: request.id,
      payload: {
        reportId,
        jobId: queueResult.jobId,
        sessionId: payload.sessionId,
        environment: payload.environment,
        impactScore,
        artifacts: payload.artifacts
      }
    });

    return reply.code(202).send({
      accepted: true,
      reportId,
      jobId: queueResult.jobId,
      impactScore
    });
  });
}