import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { StoredArtifactBundle } from '../../types/artifacts.js';
import type { AppConfig } from '../../support/config.js';

export interface ArtifactUpload {
  fileName?: string;
  mimeType?: string;
  contentBase64: string;
}

export interface SavedArtifact {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArtifactStore {
  saveArtifact(input: {
    storageKey: string;
    upload: ArtifactUpload;
    artifactType: StoredArtifactBundle['artifactType'];
  }): Promise<SavedArtifact>;
  readArtifact(storageKey: string): Promise<NodeJS.ReadableStream>;
}

export interface ArtifactStoreMetadata {
  provider: AppConfig['ARTIFACT_STORAGE_PROVIDER'];
  location: string;
}

export function normalizeStorageKey(storageKey: string): string {
  return storageKey
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/');
}

export function decodeBase64(contentBase64: string): Buffer {
  const normalized = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;

  return Buffer.from(normalized, 'base64');
}

export function computeArtifactDigest(buffer: Buffer): SavedArtifact['sha256'] {
  return createHash('sha256').update(buffer).digest('hex');
}

export function toNodeReadableStream(body: unknown): NodeJS.ReadableStream {
  if (body instanceof Readable) {
    return body;
  }

  if (body instanceof Uint8Array || typeof body === 'string') {
    return Readable.from([body]);
  }

  if (body && typeof body === 'object' && 'transformToWebStream' in body) {
    const withTransform = body as { transformToWebStream: () => ReadableStream<Uint8Array> };
    return Readable.fromWeb(withTransform.transformToWebStream() as unknown as import('node:stream/web').ReadableStream);
  }

  throw new Error('artifact body is not streamable');
}