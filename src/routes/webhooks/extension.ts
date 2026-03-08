import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { computeInitialImpactScore } from '../../domain/impact-score.js';
import type { ArtifactUpload } from '../../services/artifacts/artifact-store.js';
import { redactPayload } from '../../services/redaction/payload-redactor.js';
import { buildFeedbackReportEmbedding } from '../../services/reports/feedback-report-embedding.js';
import { safeEqual } from '../../support/http.js';

const artifactUploadSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().min(1).max(255).optional(),
  contentBase64: z.string().min(1)
});

function normalizeUpload(upload: z.infer<typeof artifactUploadSchema> | undefined): ArtifactUpload | undefined {
  if (!upload) {
    return undefined;
  }

  return {
    contentBase64: upload.contentBase64,
    ...(upload.fileName ? { fileName: upload.fileName } : {}),
    ...(upload.mimeType ? { mimeType: upload.mimeType } : {})
  };
}

function estimateDecodedBytes(contentBase64: string): number {
  const normalized = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function validateUploadBudgets(app: FastifyInstance, uploads: Array<{ key: string; upload: ArtifactUpload | undefined }>): void {
  let totalBytes = 0;

  for (const { key, upload } of uploads) {
    if (!upload) {
      continue;
    }

    const sizeBytes = estimateDecodedBytes(upload.contentBase64);
    if (sizeBytes > app.config.EXTENSION_MAX_INLINE_ARTIFACT_BYTES) {
      throw app.httpErrors.payloadTooLarge(`${key} exceeds EXTENSION_MAX_INLINE_ARTIFACT_BYTES`);
    }

    totalBytes += sizeBytes;
  }

  if (totalBytes > app.config.EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES) {
    throw app.httpErrors.payloadTooLarge('inline artifacts exceed EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES');
  }
}

function summarizeUploads(uploads: {
  screenRecording: ArtifactUpload | undefined;
  har: ArtifactUpload | undefined;
  consoleLogs: ArtifactUpload | undefined;
  localStorage: ArtifactUpload | undefined;
  sessionStorage: ArtifactUpload | undefined;
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(uploads)
      .filter(([, upload]) => Boolean(upload))
      .map(([key, upload]) => [
        key,
        {
          inline: true,
          ...(upload?.fileName ? { fileName: upload.fileName } : {}),
          ...(upload?.mimeType ? { mimeType: upload.mimeType } : {})
        }
      ])
  );
}

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
    hasConsoleLogs: z.boolean().default(false),
    hasLocalStorageSnapshot: z.boolean().default(false),
    hasSessionStorageSnapshot: z.boolean().default(false),
    uploads: z.object({
      screenRecording: artifactUploadSchema.optional(),
      har: artifactUploadSchema.optional(),
      consoleLogs: artifactUploadSchema.optional(),
      localStorage: artifactUploadSchema.optional(),
      sessionStorage: artifactUploadSchema.optional()
    }).optional()
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
    const uploads = {
      screenRecording: normalizeUpload(payload.artifacts.uploads?.screenRecording),
      har: normalizeUpload(payload.artifacts.uploads?.har),
      consoleLogs: normalizeUpload(payload.artifacts.uploads?.consoleLogs),
      localStorage: normalizeUpload(payload.artifacts.uploads?.localStorage),
      sessionStorage: normalizeUpload(payload.artifacts.uploads?.sessionStorage)
    };
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
    const sanitized = redactPayload({
      ...payloadForStorage
    });

    const storedReport = {
      id: reportId,
      source: 'extension',
      externalId: payload.sessionId,
      title: payload.title,
      status: 'received',
      severity: payload.severity,
      reporterIdentifier: payload.reporter.id,
      payload: {
        ...sanitized.value,
        redactionCount: sanitized.redactionCount
      }
    } as const;

    await app.reports.create(storedReport);
    await app.reportEmbeddings.upsert({
      id: storedReport.id,
      feedbackReportId: storedReport.id,
      ...buildFeedbackReportEmbedding(storedReport)
    });

    const artifactDefinitions: Array<{
      enabled: boolean;
      artifactType: 'screen-recording' | 'har' | 'console-logs' | 'local-storage' | 'session-storage';
      fileName: string;
      upload: ArtifactUpload | undefined;
    }> = [
      {
        enabled: payload.artifacts.hasScreenRecording || Boolean(uploads.screenRecording),
        artifactType: 'screen-recording',
        fileName: uploads.screenRecording?.fileName ?? 'screen-recording.webm',
        upload: uploads.screenRecording
      },
      {
        enabled: payload.artifacts.hasHar || Boolean(uploads.har),
        artifactType: 'har',
        fileName: uploads.har?.fileName ?? 'network.har',
        upload: uploads.har
      },
      {
        enabled: payload.artifacts.hasConsoleLogs || Boolean(uploads.consoleLogs),
        artifactType: 'console-logs',
        fileName: uploads.consoleLogs?.fileName ?? 'console-logs.json',
        upload: uploads.consoleLogs
      },
      {
        enabled: payload.artifacts.hasLocalStorageSnapshot || Boolean(uploads.localStorage),
        artifactType: 'local-storage',
        fileName: uploads.localStorage?.fileName ?? 'local-storage.json',
        upload: uploads.localStorage
      },
      {
        enabled: payload.artifacts.hasSessionStorageSnapshot || Boolean(uploads.sessionStorage),
        artifactType: 'session-storage',
        fileName: uploads.sessionStorage?.fileName ?? 'session-storage.json',
        upload: uploads.sessionStorage
      }
    ];

    for (const definition of artifactDefinitions) {
      if (!definition.enabled) {
        continue;
      }

      const storageKey = `reports/${reportId}/${definition.fileName}`;
      const savedArtifact = definition.upload
        ? await app.artifactStore.saveArtifact({
          storageKey,
          upload: definition.upload,
          artifactType: definition.artifactType
        })
        : null;

      await app.artifacts.create({
        id: randomUUID(),
        feedbackReportId: reportId,
        artifactType: definition.artifactType,
        storageKey,
        metadata: {
          sessionId: payload.sessionId,
          environment: payload.environment,
          reporterId: payload.reporter.id,
          captureStatus: savedArtifact ? 'stored' : 'pending-upload',
          fileName: definition.fileName,
          mimeType: definition.upload?.mimeType ?? null,
          inlineUploadBytes: definition.upload ? estimateDecodedBytes(definition.upload.contentBase64) : null,
          sizeBytes: savedArtifact?.sizeBytes ?? null,
          sha256: savedArtifact?.sha256 ?? null
        }
      });
    }

    const queueResult = await app.jobs.enqueue({
      type: 'triage',
      reportId,
      source: 'extension',
      priority: impactScore,
      payload: {
        ...sanitized.value,
        redactionCount: sanitized.redactionCount
      }
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
        jobId: queueResult.jobId,
        sessionId: payload.sessionId,
        environment: payload.environment,
        impactScore,
        ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
        redactionCount: sanitized.redactionCount,
        artifacts: payload.artifacts
      }
    });

    return reply.code(202).send({
      accepted: true,
      reportId,
      jobId: queueResult.jobId,
      ...(replayJobResult ? { replayJobId: replayJobResult.jobId } : {}),
      impactScore
    });
  });
}