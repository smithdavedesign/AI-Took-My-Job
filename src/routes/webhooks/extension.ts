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
  artifacts: capturedArtifactEnvelopeSchema,
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
    const uploads = normalizeCapturedUploads(payload.artifacts.uploads);
    validateUploadBudgets(app, [
      { key: 'screenRecording', upload: uploads.screenRecording },
      { key: 'har', upload: uploads.har },
      { key: 'consoleLogs', upload: uploads.consoleLogs },
      { key: 'localStorage', upload: uploads.localStorage },
      { key: 'sessionStorage', upload: uploads.sessionStorage }
    ]);
    const derivedFrequency = payload.signals.consoleErrorCount + payload.signals.networkErrorCount;
    const impactScore = computeInitialImpactScore({
      source: 'extension',
      severity: payload.severity,
      breadth: payload.signals.stakeholderCount,
      frequency: derivedFrequency
    });
    const payloadForStorage = {
      ...payload,
      artifacts: {
        ...payload.artifacts,
        ...(Object.keys(summarizeUploads(uploads)).length > 0
          ? { uploads: summarizeUploads(uploads) }
          : {})
      },
      impactScore
    };
    const ingested = await ingestFeedbackReport(app, {
      source: 'extension',
      externalId: payload.sessionId,
      title: payload.title,
      severity: payload.severity,
      reporterIdentifier: payload.reporter.id,
      payload: payloadForStorage,
      triagePriority: impactScore
    });
    const reportId = ingested.report.id;
    await persistCapturedArtifacts(app, {
      reportId,
      sessionId: payload.sessionId,
      environment: payload.environment,
      reporterId: payload.reporter.id,
      uploads,
      artifacts: payload.artifacts
    });

    const replayJobResult = payload.artifacts.hasHar || Boolean(uploads.har)
      ? await app.jobs.enqueue({
        type: 'replay',
        reportId,
        source: 'extension',
        priority: impactScore,
        payload: {
          artifactType: 'har'
        }
      })
      : null;

    await app.audit.write({
      eventType: 'extension.report_received',
      actorType: 'integration',
      actorId: payload.reporter.id,
      requestId: request.id,
      payload: {
        reportId,
        jobId: ingested.triageJobId,
        sessionId: payload.sessionId,
        environment: payload.environment,
        impactScore,
        ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
        redactionCount: ingested.redactionCount,
        artifacts: payload.artifacts
      }
    });

    return reply.code(202).send({
      accepted: true,
      reportId,
      jobId: ingested.triageJobId,
      ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
      impactScore
    });
  });
}