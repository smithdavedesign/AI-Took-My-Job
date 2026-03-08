import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import { normalizeDatadogWebhook, type DatadogWebhookPayload } from '../../services/observability/datadog.js';
import { normalizeNewRelicWebhook, type NewRelicWebhookPayload } from '../../services/observability/newrelic.js';
import { normalizeSentryWebhook, type NormalizedObservabilityEvent, type SentryWebhookPayload } from '../../services/observability/sentry.js';
import { ingestFeedbackReport } from '../../services/reports/report-ingestion.js';
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

const sentryWebhookSchema = z.object({
  action: z.string().min(1),
  actor: z.object({
    name: z.string().optional(),
    type: z.string().optional()
  }).optional(),
  data: z.object({
    issue: z.object({
      id: z.string().min(1),
      shortId: z.string().optional(),
      title: z.string().min(1),
      culprit: z.string().optional(),
      level: z.enum(['warning', 'error', 'fatal', 'info']).optional(),
      count: z.string().optional(),
      permalink: z.string().url().optional(),
      project: z.object({
        name: z.string().optional()
      }).optional(),
      metadata: z.record(z.string(), z.unknown()).optional()
    })
  })
});

const datadogWebhookSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  title: z.string().min(1),
  text: z.string().optional(),
  alert_type: z.enum(['info', 'warning', 'error', 'success']).optional(),
  event_type: z.string().optional(),
  date_happened: z.union([z.string(), z.number()]).optional(),
  priority: z.string().optional(),
  tags: z.array(z.string()).optional(),
  url: z.string().url().optional()
});

const newRelicWebhookSchema = z.object({
  incident_id: z.union([z.string().min(1), z.number()]),
  event: z.string().optional(),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  title: z.string().optional(),
  condition_name: z.string().optional(),
  policy_name: z.string().optional(),
  incident_url: z.string().url().optional(),
  owner: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.union([z.number(), z.string()]).optional()
});

function persistObservabilityEvent(app: FastifyInstance, requestId: string, event: NormalizedObservabilityEvent) {
  return (async () => {
    const impactScore = computeInitialImpactScore({
      source: event.provider,
      severity: event.severity,
      frequency: event.frequency
    });
    const payload = {
      ...event,
      impactScore
    };

    const ingested = await ingestFeedbackReport(app, {
      source: event.provider,
      title: event.title,
      severity: event.severity,
      reporterIdentifier: event.provider,
      payload,
      triagePriority: impactScore,
      ...(event.fingerprint ? { externalId: event.fingerprint } : {})
    });

    await app.audit.write({
      eventType: 'observability.event_received',
      actorType: 'integration',
      actorId: event.provider,
      requestId,
      payload: {
        reportId: ingested.report.id,
        jobId: ingested.triageJobId,
        provider: event.provider,
        eventType: event.eventType,
        severity: event.severity,
        fingerprint: event.fingerprint,
        impactScore,
        redactionCount: ingested.redactionCount
      }
    });

    return {
      accepted: true,
      reportId: ingested.report.id,
      jobId: ingested.triageJobId,
      impactScore
    };
  })();
}

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
    const result = await persistObservabilityEvent(app, request.id, {
      provider: payload.provider,
      eventType: payload.eventType,
      title: payload.title,
      severity: payload.severity,
      occurredAt: payload.occurredAt,
      metadata: payload.metadata,
      frequency: 10,
      ...(payload.fingerprint ? { fingerprint: payload.fingerprint } : {})
    });

    return reply.code(202).send(result);
  });

  app.post('/webhooks/sentry', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'sentry.signature_rejected',
        actorType: 'integration',
        actorId: 'sentry',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = sentryWebhookSchema.parse(request.body) as SentryWebhookPayload;
    const result = await persistObservabilityEvent(app, request.id, normalizeSentryWebhook(payload));
    return reply.code(202).send(result);
  });

  app.post('/webhooks/datadog', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'datadog.signature_rejected',
        actorType: 'integration',
        actorId: 'datadog',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = datadogWebhookSchema.parse(request.body) as DatadogWebhookPayload;
    const result = await persistObservabilityEvent(app, request.id, normalizeDatadogWebhook(payload));
    return reply.code(202).send(result);
  });

  app.post('/webhooks/newrelic', async (request, reply) => {
    const sharedSecret = request.headers['x-nexus-shared-secret'];

    if (typeof sharedSecret !== 'string' || !safeEqual(sharedSecret, app.config.WEBHOOK_SHARED_SECRET)) {
      await app.audit.write({
        eventType: 'newrelic.signature_rejected',
        actorType: 'integration',
        actorId: 'newrelic',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid shared secret');
    }

    const payload = newRelicWebhookSchema.parse(request.body) as NewRelicWebhookPayload;
    const result = await persistObservabilityEvent(app, request.id, normalizeNewRelicWebhook(payload));
    return reply.code(202).send(result);
  });
}