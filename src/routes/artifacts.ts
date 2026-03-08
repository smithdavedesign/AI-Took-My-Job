import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createArtifactDownloadSignature, verifyArtifactDownloadSignature } from '../support/artifact-download.js';
import { requireInternalServiceAuth } from '../support/internal-auth.js';

const uuidParamsSchema = z.object({
  artifactId: z.string().uuid()
});

const downloadUrlQuerySchema = z.object({
  ttlSeconds: z.coerce.number().int().min(60).max(3600).optional()
});

const downloadQuerySchema = z.object({
  expires: z.coerce.number().int().positive(),
  signature: z.string().length(64)
});

export function registerArtifactRoutes(app: FastifyInstance): void {
  app.get('/internal/artifacts/:artifactId/download-url', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['artifacts:download-url']);

    const { artifactId } = uuidParamsSchema.parse(request.params);
    const { ttlSeconds } = downloadUrlQuerySchema.parse(request.query);
    const artifact = await app.artifacts.findById(artifactId);

    if (!artifact) {
      throw app.httpErrors.notFound('artifact not found');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + (ttlSeconds ?? app.config.ARTIFACT_DOWNLOAD_URL_TTL_SECONDS);
    const signature = createArtifactDownloadSignature(app.config.WEBHOOK_SHARED_SECRET, artifactId, expiresAt);
    const downloadPath = `/artifacts/download/${artifactId}?expires=${expiresAt}&signature=${signature}`;

    await app.audit.write({
      eventType: 'artifact.download_url_created',
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        artifactId,
        feedbackReportId: artifact.feedbackReportId,
        expiresAt,
        storageKey: artifact.storageKey
      }
    });

    return {
      artifactId,
      expiresAt,
      downloadPath,
      storageProvider: app.artifactStoreMetadata.provider
    };
  });

  app.get('/artifacts/download/:artifactId', async (request, reply) => {
    const { artifactId } = uuidParamsSchema.parse(request.params);
    const { expires, signature } = downloadQuerySchema.parse(request.query);

    if (!verifyArtifactDownloadSignature({
      secret: app.config.WEBHOOK_SHARED_SECRET,
      artifactId,
      expiresAt: expires,
      signature
    })) {
      throw app.httpErrors.unauthorized('invalid or expired download signature');
    }

    const artifact = await app.artifacts.findById(artifactId);

    if (!artifact) {
      throw app.httpErrors.notFound('artifact not found');
    }

    const metadata = artifact.metadata;
    const fileName = typeof metadata.fileName === 'string' ? metadata.fileName : `${artifact.id}.bin`;
    const mimeType = typeof metadata.mimeType === 'string' ? metadata.mimeType : 'application/octet-stream';
    const sizeBytes = typeof metadata.sizeBytes === 'number' ? metadata.sizeBytes : undefined;
    const stream = await app.artifactStore.readArtifact(artifact.storageKey);

    await app.audit.write({
      eventType: 'artifact.downloaded',
      actorType: 'system',
      actorId: 'signed-url',
      requestId: request.id,
      payload: {
        artifactId,
        feedbackReportId: artifact.feedbackReportId,
        storageKey: artifact.storageKey,
        storageProvider: app.artifactStoreMetadata.provider
      }
    });

    reply.header('content-type', mimeType);
    reply.header('content-disposition', `attachment; filename="${fileName}"`);
    if (typeof sizeBytes === 'number') {
      reply.header('content-length', String(sizeBytes));
    }

    return reply.send(stream);
  });
}