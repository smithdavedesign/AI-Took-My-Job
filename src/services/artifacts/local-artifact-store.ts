import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { computeArtifactDigest, decodeBase64, normalizeStorageKey, type ArtifactStore } from './artifact-store.js';

export function createLocalArtifactStore(basePath: string): ArtifactStore {
  return {
    async saveArtifact({ storageKey, upload }) {
      const normalizedStorageKey = normalizeStorageKey(storageKey);
      const absolutePath = path.resolve(basePath, normalizedStorageKey);
      const buffer = decodeBase64(upload.contentBase64);
      const sha256 = computeArtifactDigest(buffer);

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, buffer);

      return {
        storageKey: normalizedStorageKey,
        sizeBytes: buffer.byteLength,
        sha256
      };
    },
    async readArtifact(storageKey) {
      const normalizedStorageKey = normalizeStorageKey(storageKey);
      const absolutePath = path.resolve(basePath, normalizedStorageKey);
      return createReadStream(absolutePath);
    }
  };
}