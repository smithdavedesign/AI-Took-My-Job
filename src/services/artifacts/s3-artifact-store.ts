import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { AppConfig } from '../../support/config.js';
import { computeArtifactDigest, decodeBase64, normalizeStorageKey, toNodeReadableStream, type ArtifactStore } from './artifact-store.js';

function requireS3Config(config: AppConfig): {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
} {
  if (!config.S3_REGION || !config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    throw new Error('S3 artifact storage is not fully configured');
  }

  return {
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {})
  };
}

export function createS3ArtifactStore(config: AppConfig): ArtifactStore {
  const s3Config = requireS3Config(config);
  const client = new S3Client({
    region: s3Config.region,
    ...(s3Config.endpoint ? { endpoint: s3Config.endpoint } : {}),
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey
    }
  });

  return {
    async saveArtifact({ storageKey, upload }) {
      const normalizedStorageKey = normalizeStorageKey(storageKey);
      const body = decodeBase64(upload.contentBase64);
      const sha256 = computeArtifactDigest(body);

      await client.send(new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: normalizedStorageKey,
        Body: body,
        ...(upload.mimeType ? { ContentType: upload.mimeType } : {}),
        Metadata: {
          sha256
        }
      }));

      return {
        storageKey: normalizedStorageKey,
        sizeBytes: body.byteLength,
        sha256
      };
    },
    async readArtifact(storageKey) {
      const normalizedStorageKey = normalizeStorageKey(storageKey);
      const response = await client.send(new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: normalizedStorageKey
      }));

      if (!response.Body) {
        throw new Error('artifact not found in storage');
      }

      return toNodeReadableStream(response.Body);
    }
  };
}