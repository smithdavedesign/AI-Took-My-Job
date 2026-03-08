import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import { safeEqual } from '../../support/http.js';

const observabilityPayloadSchema = z.object({
  provider: z.enum(['sentry', 'datadog', 'newrelic']),
  eventType: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  fingerprint: z.string().optional(),
  occurredAt: z.iso.datetime(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export function registerObservabilityWebhookRoute(app: FastifyInstance): void {
  app.post('/webhooks/observability', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'observability.signature_rejected',
        actorType: 'integration',
        actorId: 'observability',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = observabilityPayloadSchema.parse(request.body);
    const reportId = randomUUID();
    const impactScore = computeInitialImpactScore({
      source: payload.provider,
      severity: payload.severity,
      frequency: 10
    });

    await app.reports.create({
      id: reportId,
      source: payload.provider,
      title: payload.title,
      status: 'received',
      severity: payload.severity,
      reporterIdentifier: payload.provider,
      payload: {
        ...payload,
        impactScore
      },
      ...(payload.fingerprint ? { externalId: payload.fingerprint } : {})
    });

    const queueResult = await app.jobs.enqueue({
      type: 'triage',
      reportId,
      source: payload.provider,
      priority: impactScore,
      payload: {
        ...payload,
        impactScore
      }
    });

    await app.audit.write({
      eventType: 'observability.event_received',
      actorType: 'integration',
      actorId: payload.provider,
      requestId: request.id,
      payload: {
        reportId,
        jobId: queueResult.jobId,
        provider: payload.provider,
        eventType: payload.eventType,
        severity: payload.severity,
        fingerprint: payload.fingerprint,
        impactScore
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