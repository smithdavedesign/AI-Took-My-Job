import assert from 'node:assert/strict';

import { ZodError } from 'zod';

import { buildCloneTarget } from '../../services/agent-tasks/repository-workspace.js';
import { loadConfig } from '../../support/config.js';

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '4000',
  APP_BASE_URL: 'http://127.0.0.1:4000',
  LOG_LEVEL: 'warn',
  ARTIFACT_STORAGE_PROVIDER: 'local',
  ARTIFACT_STORAGE_PATH: './var/artifacts',
  ARTIFACT_DOWNLOAD_URL_TTL_SECONDS: '600',
  INTERNAL_SERVICE_TOKENS: '[]',
  SLACK_SIGNING_SECRET: 'ci-slack-secret',
  WEBHOOK_SHARED_SECRET: 'ci-webhook-secret',
  DATABASE_URL: 'postgres://nexus:nexus@127.0.0.1:5432/nexus',
  REDIS_URL: 'redis://127.0.0.1:6379',
  GITHUB_DRAFT_SYNC_ENABLED: 'false',
  GITHUB_AUTH_MODE: 'pat',
  GITHUB_USE_TEST_REPO: 'false'
};

async function withEnv<T>(env: Record<string, string>, operation: () => Promise<T> | T): Promise<T> {
  const previousEnv = { ...process.env };
  process.env = {
    ...previousEnv,
    ...env
  };

  try {
    return await operation();
  } finally {
    process.env = previousEnv;
  }
}

async function assertProductionSecretsAreRequired(): Promise<void> {
  await withEnv({
    ...BASE_ENV,
    NODE_ENV: 'production',
    PUBLIC_WIDGET_SIGNING_SECRET: 'local-public-widget-signing-secret',
    GITHUB_APP_STATE_SECRET: 'local-github-app-state-secret'
  }, () => {
    let error: unknown;

    try {
      loadConfig();
    } catch (caught) {
      error = caught;
    }

    assert(error instanceof ZodError, 'loadConfig should reject default production secrets');
    const messages = error.issues.map((issue) => issue.message);
    assert(messages.includes('PUBLIC_WIDGET_SIGNING_SECRET must be set explicitly in production'));
    assert(messages.includes('GITHUB_APP_STATE_SECRET must be set explicitly in production'));
  });
}

async function assertProductionSecretsCanBeExplicit(): Promise<void> {
  await withEnv({
    ...BASE_ENV,
    NODE_ENV: 'production',
    PUBLIC_WIDGET_SIGNING_SECRET: 'explicit-public-widget-signing-secret',
    GITHUB_APP_STATE_SECRET: 'explicit-github-app-state-secret'
  }, () => {
    const config = loadConfig();
    assert.equal(config.NODE_ENV, 'production');
    assert.equal(config.PUBLIC_WIDGET_SIGNING_SECRET, 'explicit-public-widget-signing-secret');
    assert.equal(config.GITHUB_APP_STATE_SECRET, 'explicit-github-app-state-secret');
  });
}

async function assertPublicRepoCloneFallsBackToPlainHttps(): Promise<void> {
  await withEnv(BASE_ENV, async () => {
    const config = loadConfig();
    const cloneTarget = await buildCloneTarget(config, 'octo/example');

    assert.equal(cloneTarget.cloneSource, 'https://github.com/octo/example.git');
    assert.equal(cloneTarget.repositoryLabel, 'octo__example');
    assert.equal(cloneTarget.env, undefined);
    assert.equal(cloneTarget.cleanup, undefined);
  });
}

async function assertTokenCloneUsesAskPass(): Promise<void> {
  await withEnv({
    ...BASE_ENV,
    GITHUB_TOKEN: 'ghp_example_token_for_guardrail_test'
  }, async () => {
    const config = loadConfig();
    const cloneTarget = await buildCloneTarget(config, 'octo/example');

    assert.equal(cloneTarget.cloneSource, 'https://github.com/octo/example.git');
    assert.equal(cloneTarget.repositoryLabel, 'octo__example');
    assert.equal(cloneTarget.env?.GIT_TERMINAL_PROMPT, '0');
    assert.ok(cloneTarget.env?.GIT_ASKPASS, 'expected GIT_ASKPASS to be configured when a token is available');
    assert.ok(cloneTarget.cleanup, 'expected cleanup handler when a token-backed askpass script is created');

    await cloneTarget.cleanup?.();
  });
}

async function main(): Promise<void> {
  await assertProductionSecretsAreRequired();
  await assertProductionSecretsCanBeExplicit();
  await assertPublicRepoCloneFallsBackToPlainHttps();
  await assertTokenCloneUsesAskPass();
  console.log('Config and repository clone guardrails passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});