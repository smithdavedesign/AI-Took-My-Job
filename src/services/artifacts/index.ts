import type { AppConfig } from '../../support/config.js';
import { createLocalArtifactStore } from './local-artifact-store.js';
import { createS3ArtifactStore } from './s3-artifact-store.js';
import type { ArtifactStore, ArtifactStoreMetadata } from './artifact-store.js';

export function createArtifactStore(config: AppConfig): { store: ArtifactStore; metadata: ArtifactStoreMetadata } {
  if (config.ARTIFACT_STORAGE_PROVIDER === 's3') {
    return {
      store: createS3ArtifactStore(config),
      metadata: {
        provider: 's3',
        location: config.S3_BUCKET ?? 'unconfigured-bucket'
      }
    };
  }

  return {
    store: createLocalArtifactStore(config.ARTIFACT_STORAGE_PATH),
    metadata: {
      provider: 'local',
      location: config.ARTIFACT_STORAGE_PATH
    }
  };
}