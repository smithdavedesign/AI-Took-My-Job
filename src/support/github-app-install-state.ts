import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { AppConfig } from './config.js';

export interface GitHubAppInstallState {
  version: 1;
  stateId: string;
  workspaceId: string;
  projectId?: string;
  repository?: string;
  isDefault?: boolean;
  expiresAt: string;
}

interface CreateGitHubAppInstallStateInput {
  workspaceId: string;
  projectId?: string;
  repository?: string;
  isDefault?: boolean;
  ttlSeconds?: number;
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createGitHubAppInstallState(
  config: AppConfig,
  input: CreateGitHubAppInstallStateInput
): { token: string; state: GitHubAppInstallState } {
  const expiresAt = new Date(Date.now() + 1000 * (input.ttlSeconds ?? 1800)).toISOString();
  const state: GitHubAppInstallState = {
    version: 1,
    stateId: randomUUID(),
    workspaceId: input.workspaceId,
    expiresAt,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.repository ? { repository: input.repository } : {}),
    ...(typeof input.isDefault === 'boolean' ? { isDefault: input.isDefault } : {})
  };

  const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  const signature = sign(config.GITHUB_APP_STATE_SECRET, payload);
  return {
    token: `${payload}.${signature}`,
    state
  };
}

export function verifyGitHubAppInstallState(config: AppConfig, token: string): GitHubAppInstallState {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new Error('invalid GitHub App install state');
  }

  const expected = sign(config.GITHUB_APP_STATE_SECRET, payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('GitHub App install state signature mismatch');
  }

  const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GitHubAppInstallState;
  if (state.version !== 1) {
    throw new Error('unsupported GitHub App install state version');
  }

  if (Number.isNaN(Date.parse(state.expiresAt)) || Date.parse(state.expiresAt) <= Date.now()) {
    throw new Error('GitHub App install state expired');
  }

  return state;
}