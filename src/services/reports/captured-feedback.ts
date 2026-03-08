import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ArtifactUpload } from '../artifacts/artifact-store.js';

export const artifactUploadSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  mimeType: z.string().min(1).max(255).optional(),
  contentBase64: z.string().min(1)
});

export const capturedArtifactEnvelopeSchema = z.object({
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
});

export interface CapturedFeedbackUploads {
  screenRecording: ArtifactUpload | undefined;
  har: ArtifactUpload | undefined;
  consoleLogs: ArtifactUpload | undefined;
  localStorage: ArtifactUpload | undefined;
  sessionStorage: ArtifactUpload | undefined;
}

export function normalizeUpload(upload: z.infer<typeof artifactUploadSchema> | undefined): ArtifactUpload | undefined {
  if (!upload) {
    return undefined;
  }

  return {
    contentBase64: upload.contentBase64,
    ...(upload.fileName ? { fileName: upload.fileName } : {}),
    ...(upload.mimeType ? { mimeType: upload.mimeType } : {})
  };
}

export function normalizeCapturedUploads(uploads: z.infer<typeof capturedArtifactEnvelopeSchema>['uploads'] | undefined): CapturedFeedbackUploads {
  return {
    screenRecording: normalizeUpload(uploads?.screenRecording),
    har: normalizeUpload(uploads?.har),
    consoleLogs: normalizeUpload(uploads?.consoleLogs),
    localStorage: normalizeUpload(uploads?.localStorage),
    sessionStorage: normalizeUpload(uploads?.sessionStorage)
  };
}

export function estimateDecodedBytes(contentBase64: string): number {
  const normalized = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

export function validateUploadBudgets(app: FastifyInstance, uploads: Array<{ key: string; upload: ArtifactUpload | undefined }>): void {
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

export function summarizeUploads(uploads: CapturedFeedbackUploads): Record<string, unknown> {
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

export async function persistCapturedArtifacts(app: FastifyInstance, input: {
  reportId: string;
  sessionId: string;
  environment: string;
  reporterId: string;
  uploads: CapturedFeedbackUploads;
  artifacts: z.infer<typeof capturedArtifactEnvelopeSchema>;
}): Promise<void> {
  const artifactDefinitions: Array<{
    enabled: boolean;
    artifactType: 'screen-recording' | 'har' | 'console-logs' | 'local-storage' | 'session-storage';
    fileName: string;
    upload: ArtifactUpload | undefined;
  }> = [
    {
      enabled: input.artifacts.hasScreenRecording || Boolean(input.uploads.screenRecording),
      artifactType: 'screen-recording',
      fileName: input.uploads.screenRecording?.fileName ?? 'screen-recording.webm',
      upload: input.uploads.screenRecording
    },
    {
      enabled: input.artifacts.hasHar || Boolean(input.uploads.har),
      artifactType: 'har',
      fileName: input.uploads.har?.fileName ?? 'network.har',
      upload: input.uploads.har
    },
    {
      enabled: input.artifacts.hasConsoleLogs || Boolean(input.uploads.consoleLogs),
      artifactType: 'console-logs',
      fileName: input.uploads.consoleLogs?.fileName ?? 'console-logs.json',
      upload: input.uploads.consoleLogs
    },
    {
      enabled: input.artifacts.hasLocalStorageSnapshot || Boolean(input.uploads.localStorage),
      artifactType: 'local-storage',
      fileName: input.uploads.localStorage?.fileName ?? 'local-storage.json',
      upload: input.uploads.localStorage
    },
    {
      enabled: input.artifacts.hasSessionStorageSnapshot || Boolean(input.uploads.sessionStorage),
      artifactType: 'session-storage',
      fileName: input.uploads.sessionStorage?.fileName ?? 'session-storage.json',
      upload: input.uploads.sessionStorage
    }
  ];

  for (const definition of artifactDefinitions) {
    if (!definition.enabled) {
      continue;
    }

    const storageKey = `reports/${input.reportId}/${definition.fileName}`;
    const savedArtifact = definition.upload
      ? await app.artifactStore.saveArtifact({
        storageKey,
        upload: definition.upload,
        artifactType: definition.artifactType
      })
      : null;

    await app.artifacts.create({
      id: randomUUID(),
      feedbackReportId: input.reportId,
      artifactType: definition.artifactType,
      storageKey,
      metadata: {
        sessionId: input.sessionId,
        environment: input.environment,
        reporterId: input.reporterId,
        captureStatus: savedArtifact ? 'stored' : 'pending-upload',
        fileName: definition.fileName,
        mimeType: definition.upload?.mimeType ?? null,
        inlineUploadBytes: definition.upload ? estimateDecodedBytes(definition.upload.contentBase64) : null,
        sizeBytes: savedArtifact?.sizeBytes ?? null,
        sha256: savedArtifact?.sha256 ?? null
      }
    });
  }
}