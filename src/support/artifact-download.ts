import { createHmac } from 'node:crypto';

import { safeEqual } from './http.js';

function buildPayload(artifactId: string, expiresAt: number): string {
  return `${artifactId}:${expiresAt}`;
}

export function createArtifactDownloadSignature(secret: string, artifactId: string, expiresAt: number): string {
  return createHmac('sha256', secret)
    .update(buildPayload(artifactId, expiresAt))
    .digest('hex');
}

export function verifyArtifactDownloadSignature(input: {
  secret: string;
  artifactId: string;
  expiresAt: number;
  signature: string;
}): boolean {
  if (Date.now() > input.expiresAt * 1000) {
    return false;
  }

  const expected = createArtifactDownloadSignature(input.secret, input.artifactId, input.expiresAt);
  return safeEqual(expected, input.signature);
}