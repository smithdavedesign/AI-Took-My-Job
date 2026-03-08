import { createHmac, randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import { buildFeedbackReportEmbedding } from '../../services/reports/feedback-report-embedding.js';

const slackEnvelopeSchema = z.object({
  type: z.string(),
  api_app_id: z.string().optional(),
  challenge: z.string().optional(),
  event_id: z.string().optional(),
  event_time: z.number().optional(),
  event: z.object({
    type: z.string(),
    reaction: z.string().optional(),
    user: z.string().optional(),
    item: z.object({
      type: z.string(),
      channel: z.string().optional(),
      ts: z.string().optional()
    }).optional(),
    item_user: z.string().optional()
  }).optional()
});

function verifySlackSignature(request: FastifyRequest, signingSecret: string): boolean {
  const timestamp = request.headers['x-slack-request-timestamp'];
  const signature = request.headers['x-slack-signature'];

  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    return false;
  }

  const rawBody = typeof request.body === 'string'
    ? request.body
    : JSON.stringify(request.body ?? {});
  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;

  return digest === signature;
}

export function registerSlackWebhookRoute(app: FastifyInstance): void {
  app.post('/webhooks/slack/events', async (request, reply) => {
    if (!verifySlackSignature(request, app.config.SLACK_SIGNING_SECRET)) {
      await app.audit.write({
        eventType: 'slack.signature_rejected',
        actorType: 'integration',
        actorId: 'slack',
        requestId: request.id,
        payload: {
          headers: request.headers
        }
      });

      throw app.httpErrors.unauthorized('invalid Slack signature');
    }

    const payload = slackEnvelopeSchema.parse(request.body);

    if (payload.type === 'url_verification' && payload.challenge) {
      return reply.send({ challenge: payload.challenge });
    }

    const reportId = randomUUID();
    const impactScore = computeInitialImpactScore({
      source: 'slack',
      severity: payload.event?.reaction === 'bug' ? 'high' : 'medium',
      breadth: 1,
      frequency: 1
    });

    const storedReport = {
      id: reportId,
      source: 'slack',
      status: 'received',
      severity: payload.event?.reaction === 'bug' ? 'high' : 'medium',
      payload: {
        ...payload,
        impactScore
      },
      ...(payload.event_id ? { externalId: payload.event_id } : {}),
      ...(payload.event?.type ? { title: payload.event.type } : {}),
      ...(payload.event?.user ? { reporterIdentifier: payload.event.user } : {})
    } as const;

    await app.reports.create(storedReport);
    await app.reportEmbeddings.upsert({
      id: storedReport.id,
      feedbackReportId: storedReport.id,
      ...buildFeedbackReportEmbedding(storedReport)
    });

    const queueResult = await app.jobs.enqueue({
      type: 'triage',
      reportId,
      source: 'slack',
      priority: impactScore,
      payload: {
        ...payload,
        impactScore
      }
    });

    await app.audit.write({
      eventType: 'slack.event_received',
      actorType: 'integration',
      actorId: 'slack',
      requestId: request.id,
      payload: {
        reportId,
        jobId: queueResult.jobId,
        eventId: payload.event_id,
        eventType: payload.event?.type,
        reaction: payload.event?.reaction,
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