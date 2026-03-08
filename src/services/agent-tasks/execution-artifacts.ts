import { randomUUID } from 'node:crypto';

import type { ArtifactBundleRepository } from '../../repositories/artifact-bundle-repository.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import type { StoredArtifactBundle } from '../../types/artifacts.js';

function encodeContent(content: string): string {
  return Buffer.from(content, 'utf8').toString('base64');
}

export async function persistExecutionTextArtifact(input: {
  artifacts: ArtifactBundleRepository;
  artifactStore: ArtifactStore;
  reportId: string;
  executionId: string;
  taskId: string;
  artifactType: StoredArtifactBundle['artifactType'];
  fileName: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ artifactId: string; storageKey: string }> {
  const artifactId = randomUUID();
  const storageKey = `reports/${input.reportId}/agent-executions/${input.executionId}/${input.fileName}`;

  const saved = await input.artifactStore.saveArtifact({
    storageKey,
    artifactType: input.artifactType,
    upload: {
      fileName: input.fileName,
      mimeType: input.fileName.endsWith('.json') ? 'application/json' : 'text/plain',
      contentBase64: encodeContent(input.content)
    }
  });

  await input.artifacts.create({
    id: artifactId,
    feedbackReportId: input.reportId,
    artifactType: input.artifactType,
    storageKey: saved.storageKey,
    metadata: {
      executionId: input.executionId,
      agentTaskId: input.taskId,
      fileName: input.fileName,
      sizeBytes: saved.sizeBytes,
      sha256: saved.sha256,
      captureStatus: 'stored',
      source: 'agent-execution',
      ...(input.metadata ?? {})
    }
  });

  return {
    artifactId,
    storageKey: saved.storageKey
  };
}