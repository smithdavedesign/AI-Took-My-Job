import 'dotenv/config';

import { createGitHubIntegration } from '../../integrations/github/client.js';
import { loadConfig } from '../../support/config.js';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

interface ExtensionWebhookResponse {
  accepted: boolean;
  reportId: string;
  jobId: string;
  replayJobId?: string;
  impactScore: number;
}

interface StoredDraft {
  feedbackReportId: string;
  repository: string;
  state: 'local-draft' | 'synced' | 'sync-failed';
  issueNumber?: number;
  issueUrl?: string;
}

interface ReplayResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  replayPlan?: {
    thirdPartyHostnames: string[];
    authSignals: string[];
    storageState: {
      localStorageKeys: string[];
      sessionStorageKeys: string[];
      cookieNames?: string[];
    };
    execution?: {
      status: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
      matchedFailingStepOrders: number[];
      isolatedThirdPartyRequests: number;
      resolvedStateReferenceCount: number;
      restoredCookieNames: string[];
      restoredLocalStorageKeys: string[];
      restoredSessionStorageKeys: string[];
    };
  };
}

interface StoredArtifact {
  id: string;
  artifactType: 'screen-recording' | 'har' | 'console-logs' | 'local-storage' | 'session-storage';
}

interface DirectDraftResponse {
  created: true;
  authMode: 'pat' | 'app';
  issueNumber: number;
  issueUrl: string;
}

interface SignedDownloadResponse {
  artifactId: string;
  expiresAt: number;
  downloadPath: string;
  storageProvider: 'local' | 's3';
}

interface HealthResponse {
  status: string;
  service: string;
  githubDraftSyncEnabled: boolean;
  artifactStorageProvider: 'local' | 's3';
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseServiceTokens(rawValue: string | undefined): ServiceToken[] {
  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as ServiceToken[];
}

function chooseServiceToken(tokens: ServiceToken[]): ServiceToken {
  const requiredScopes = ['internal:read', 'artifacts:download-url', 'github:draft'];
  const match = tokens.find((token) => requiredScopes.every((scope) => token.scopes.includes(scope)));

  assert(match, `No INTERNAL_SERVICE_TOKENS entry contains required scopes: ${requiredScopes.join(', ')}`);
  return match;
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000';
}

function getExpectedGitHubRepository(config: ReturnType<typeof loadConfig>): string {
  return createGitHubIntegration(config).repository;
}

function ensureSafeGitHubTarget(config: ReturnType<typeof loadConfig>): void {
  if (!config.GITHUB_DRAFT_SYNC_ENABLED) {
    return;
  }

  if (config.GITHUB_USE_TEST_REPO) {
    return;
  }

  const allowPrimary = process.env.E2E_ALLOW_PRIMARY_GITHUB_REPO === 'true';
  assert(
    allowPrimary,
    'Refusing to run E2E against the primary GitHub repo. Set GITHUB_USE_TEST_REPO=true with GITHUB_TEST_OWNER/GITHUB_TEST_REPO, or set E2E_ALLOW_PRIMARY_GITHUB_REPO=true to override intentionally.'
  );
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

async function pollJson<T>(url: string, init: RequestInit | undefined, attempts = 20, delayMs = 1000, predicate?: (value: T) => boolean): Promise<T> {
  let lastError: unknown;
  let lastValue: T | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastValue = await requestJson<T>(url, init);
      if (!predicate || predicate(lastValue)) {
        return lastValue;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(delayMs);
  }

  if (lastValue) {
    throw new Error(`Polling ${url} timed out. Last value: ${JSON.stringify(lastValue)}`);
  }

  throw lastError instanceof Error ? lastError : new Error(`Polling ${url} failed`);
}

async function requestExpectingStatus(url: string, status: number, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (response.status !== status) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed expected ${status} got ${response.status}: ${text}`);
  }

  return text;
}

function expectIncludesAll(actual: string[], expected: string[], label: string): void {
  for (const value of expected) {
    assert(actual.includes(value), `${label} is missing expected value: ${value}`);
  }
}

function buildHarBase64(baseUrl: string): string {
  const harDocument = {
    log: {
      version: '1.2',
      creator: { name: 'nexus-e2e', version: '1.0' },
      pages: [{ id: 'page_1', title: 'Checkout', startedDateTime: new Date().toISOString() }],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/health?token=super-secret-token`,
            headers: [
              { name: 'authorization', value: 'Bearer demo-token-value-1234567890' },
              { name: 'cookie', value: 'sessionId=abc123; cartId=cart-456' }
            ]
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 64, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'POST',
            url: `${baseUrl}/not-found`,
            headers: [
              { name: 'content-type', value: 'application/json' },
              { name: 'x-csrf-token', value: 'csrf-secret-value' }
            ],
            postData: { text: JSON.stringify({ cartId: '{{localStorage.cartId}}', orderId: '{{sessionStorage.currentOrderId}}' }) }
          },
          response: {
            status: 404,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 32, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: 'https://example.com/analytics.js',
            headers: []
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/javascript' }],
            content: { mimeType: 'application/javascript', size: 12, text: 'void 0' }
          }
        }
      ]
    }
  };

  return Buffer.from(JSON.stringify(harDocument)).toString('base64');
}

async function main(): Promise<void> {
  const config = loadConfig();
  ensureSafeGitHubTarget(config);

  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const expectedRepository = getExpectedGitHubRepository(config);

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const extensionResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/extension/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      sessionId: `e2e_full_stack_${Date.now()}`,
      title: 'Committed E2E replay validation report',
      description: 'Committed full-stack validation for extension ingestion and replay pipeline.',
      environment: 'staging',
      pageUrl: 'https://staging.example.test/checkout',
      reporter: { id: 'qa-e2e', role: 'qa' },
      severity: 'high',
      signals: { consoleErrorCount: 2, networkErrorCount: 1, stakeholderCount: 3 },
      artifacts: {
        hasScreenRecording: true,
        hasHar: true,
        hasConsoleLogs: true,
        hasLocalStorageSnapshot: true,
        hasSessionStorageSnapshot: true,
        uploads: {
          screenRecording: {
            fileName: 'screen-recording.webm',
            mimeType: 'video/webm',
            contentBase64: Buffer.from('fake-screen-recording-data').toString('base64')
          },
          har: {
            fileName: 'checkout.har',
            mimeType: 'application/json',
            contentBase64: buildHarBase64(baseUrl)
          },
          consoleLogs: {
            fileName: 'console-logs.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify([{ level: 'error', message: 'checkout failed' }])).toString('base64')
          },
          localStorage: {
            fileName: 'local-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ cartId: 'cart-456', userId: 'user-123' })).toString('base64')
          },
          sessionStorage: {
            fileName: 'session-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ currentOrderId: 'order-789', refreshToken: 'refresh-secret' })).toString('base64')
          }
        }
      },
      notes: 'Committed E2E smoke test run'
    })
  });

  const extensionDraft = await pollJson<StoredDraft>(`${baseUrl}/internal/reports/${extensionResponse.reportId}/draft`, {
    headers: authHeaders
  });
  const replay = await pollJson<ReplayResponse>(`${baseUrl}/internal/reports/${extensionResponse.reportId}/replay`, {
    headers: authHeaders
  }, 40, 1000, (value) => value.status === 'completed');
  const artifacts = await requestJson<StoredArtifact[]>(`${baseUrl}/internal/reports/${extensionResponse.reportId}/artifacts`, {
    headers: authHeaders
  });

  assert(replay.status === 'completed', `Replay did not complete: ${replay.status}`);
  assert(replay.replayPlan?.execution?.status === 'reproduced', 'Replay execution did not reproduce the failing step');
  assert(JSON.stringify(replay.replayPlan.execution.matchedFailingStepOrders) === JSON.stringify([2]), 'Replay matched failing step orders did not equal [2]');
  assert(replay.replayPlan.execution.isolatedThirdPartyRequests === 1, 'Replay did not isolate exactly one third-party request');
  assert(replay.replayPlan.execution.resolvedStateReferenceCount >= 2, 'Replay did not resolve storage placeholders into execution requests');
  expectIncludesAll(replay.replayPlan.execution.restoredCookieNames, ['sessionId', 'cartId'], 'Replay restored cookie names');
  expectIncludesAll(replay.replayPlan.execution.restoredLocalStorageKeys, ['cartId', 'userId'], 'Replay restored localStorage keys');
  expectIncludesAll(replay.replayPlan.execution.restoredSessionStorageKeys, ['currentOrderId', 'refreshToken'], 'Replay restored sessionStorage keys');
  expectIncludesAll(replay.replayPlan.thirdPartyHostnames, ['example.com'], 'Replay third-party hostnames');
  expectIncludesAll(replay.replayPlan.authSignals, ['authorization', 'cookie', 'x-csrf-token'], 'Replay auth signals');
  expectIncludesAll(replay.replayPlan.storageState.localStorageKeys, ['cartId', 'userId'], 'Replay localStorage keys');
  expectIncludesAll(replay.replayPlan.storageState.sessionStorageKeys, ['currentOrderId', 'refreshToken'], 'Replay sessionStorage keys');
  expectIncludesAll(replay.replayPlan.storageState.cookieNames ?? [], ['sessionId', 'cartId'], 'Replay cookie names');

  const artifactTypes = artifacts.map((artifact) => artifact.artifactType).sort();
  assert(JSON.stringify(artifactTypes) === JSON.stringify(['console-logs', 'har', 'local-storage', 'screen-recording', 'session-storage']), `Unexpected artifact types: ${artifactTypes.join(', ')}`);

  const harArtifact = artifacts.find((artifact) => artifact.artifactType === 'har');
  assert(harArtifact, 'HAR artifact was not persisted');

  const downloadMeta = await requestJson<SignedDownloadResponse>(`${baseUrl}/internal/artifacts/${harArtifact.id}/download-url`, {
    headers: authHeaders
  });
  const downloadResponse = await fetch(`${baseUrl}${downloadMeta.downloadPath}`);
  const downloadBody = await downloadResponse.arrayBuffer();
  assert(downloadResponse.ok, `Signed download failed with status ${downloadResponse.status}`);
  assert(downloadBody.byteLength > 0, 'Signed artifact download returned an empty body');

  if (config.GITHUB_DRAFT_SYNC_ENABLED) {
    assert(extensionDraft.state === 'synced', `Extension draft state was ${extensionDraft.state}`);
    assert(extensionDraft.issueNumber, 'Extension draft did not sync an issue number');
    assert(extensionDraft.repository === expectedRepository, `Extension draft used repository ${extensionDraft.repository}, expected ${expectedRepository}`);
  } else {
    assert(extensionDraft.state === 'local-draft', `Expected local-draft state when GitHub sync disabled, received ${extensionDraft.state}`);
  }

  await requestExpectingStatus(`${baseUrl}/webhooks/extension/report`, 413, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      sessionId: `e2e_extension_budget_${Date.now()}`,
      title: 'Oversize artifact budget check',
      environment: 'staging',
      pageUrl: 'https://staging.example.test/checkout',
      reporter: { id: 'qa-e2e', role: 'qa' },
      severity: 'medium',
      signals: { consoleErrorCount: 0, networkErrorCount: 0, stakeholderCount: 1 },
      artifacts: {
        hasScreenRecording: true,
        uploads: {
          screenRecording: {
            fileName: 'oversize.webm',
            mimeType: 'video/webm',
            contentBase64: Buffer.alloc(1_200_000, 65).toString('base64')
          }
        }
      }
    })
  });

  let directDraftSummary: Record<string, unknown> | undefined;
  if (config.GITHUB_DRAFT_SYNC_ENABLED) {
    const directDraft = await requestJson<DirectDraftResponse>(`${baseUrl}/internal/github/issues/draft`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        title: `Committed E2E direct draft ${Date.now()}`,
        body: 'Smoke test for committed internal draft creation.',
        labels: ['nexus', 'e2e']
      })
    });

    assert(directDraft.created === true, 'Direct draft route did not confirm creation');
    assert(directDraft.issueNumber > 0, 'Direct draft route did not return a valid issue number');

    directDraftSummary = {
      issueNumber: directDraft.issueNumber,
      issueUrl: directDraft.issueUrl
    };
  }

  const sentryResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/sentry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      action: 'resolved',
      actor: { name: 'ci', type: 'bot' },
      data: {
        issue: {
          id: `sentry-${Date.now()}`,
          shortId: 'OPEN-500',
          title: 'Checkout request failed',
          culprit: 'checkout-service',
          level: 'error',
          count: '27',
          permalink: 'https://sentry.example/issues/123456',
          project: { name: 'checkout-web' }
        }
      }
    })
  });
  const sentryDraft = await pollJson<StoredDraft>(`${baseUrl}/internal/reports/${sentryResponse.reportId}/draft`, {
    headers: authHeaders
  });

  const datadogResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/datadog`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      id: Date.now(),
      title: 'Checkout latency regression',
      text: 'p95 latency crossed threshold',
      alert_type: 'error',
      event_type: 'monitor_alert',
      date_happened: Math.floor(Date.now() / 1000),
      tags: ['service:web', 'env:staging'],
      url: 'https://app.datadoghq.com/event/event?id=987654'
    })
  });
  const datadogDraft = await pollJson<StoredDraft>(`${baseUrl}/internal/reports/${datadogResponse.reportId}/draft`, {
    headers: authHeaders
  });

  const newRelicResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/newrelic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      incident_id: Date.now(),
      event: 'INCIDENT_OPEN',
      severity: 'critical',
      condition_name: 'Checkout error rate',
      policy_name: 'Staging API',
      incident_url: 'https://one.newrelic.com/redirect/entity/example',
      timestamp: Date.now()
    })
  });
  const newRelicDraft = await pollJson<StoredDraft>(`${baseUrl}/internal/reports/${newRelicResponse.reportId}/draft`, {
    headers: authHeaders
  });

  if (config.GITHUB_DRAFT_SYNC_ENABLED) {
    for (const draft of [sentryDraft, datadogDraft, newRelicDraft]) {
      assert(draft.state === 'synced', `Observability draft state was ${draft.state}`);
      assert(draft.issueNumber, 'Observability draft did not sync an issue number');
      assert(draft.repository === expectedRepository, `Observability draft used repository ${draft.repository}, expected ${expectedRepository}`);
    }
  } else {
    for (const draft of [sentryDraft, datadogDraft, newRelicDraft]) {
      assert(draft.state === 'local-draft', `Expected local-draft state when GitHub sync disabled, received ${draft.state}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    github: {
      enabled: config.GITHUB_DRAFT_SYNC_ENABLED,
      usingTestRepository: config.GITHUB_USE_TEST_REPO,
      repository: expectedRepository
    },
    extensionFlow: {
      reportId: extensionResponse.reportId,
      triageJobId: extensionResponse.jobId,
      replayJobId: extensionResponse.replayJobId,
      draftState: extensionDraft.state,
      issueNumber: extensionDraft.issueNumber,
      replayStatus: replay.status,
      replayExecutionStatus: replay.replayPlan?.execution?.status,
      matchedFailingStepOrders: replay.replayPlan?.execution?.matchedFailingStepOrders,
      artifactTypes,
      signedDownloadBytes: downloadBody.byteLength
    },
    directDraft: directDraftSummary,
    observabilityFlows: {
      sentry: {
        reportId: sentryResponse.reportId,
        issueNumber: sentryDraft.issueNumber
      },
      datadog: {
        reportId: datadogResponse.reportId,
        issueNumber: datadogDraft.issueNumber
      },
      newRelic: {
        reportId: newRelicResponse.reportId,
        issueNumber: newRelicDraft.issueNumber
      }
    },
    health: {
      status: health.status,
      artifactStorageProvider: health.artifactStorageProvider,
      githubDraftSyncEnabled: health.githubDraftSyncEnabled
    }
  }, null, 2));
}

void main();