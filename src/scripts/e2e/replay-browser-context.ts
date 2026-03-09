import 'dotenv/config';

import { chromium } from 'playwright-core';

import { loadConfig } from '../../support/config.js';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

interface HealthResponse {
  status: string;
}

interface ExtensionWebhookResponse {
  reportId: string;
}

interface ReplayResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  replayPlan?: {
    execution?: {
      status: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
      executionMode?: 'browser-context' | 'request-context';
      matchedFailingStepOrders: number[];
      restoredLocalStorageKeys: string[];
      restoredSessionStorageKeys: string[];
    };
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000';
}

function parseServiceTokens(rawValue: string | undefined): ServiceToken[] {
  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as ServiceToken[];
}

function chooseServiceToken(tokens: ServiceToken[]): ServiceToken {
  const match = tokens.find((token) => token.scopes.includes('internal:read'));
  assert(match, 'No INTERNAL_SERVICE_TOKENS entry provides internal:read');
  return match;
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

async function pollJson<T>(url: string, init: RequestInit | undefined, predicate: (value: T) => boolean, attempts = 40, delayMs = 1000): Promise<T> {
  let lastValue: T | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastValue = await requestJson<T>(url, init);
      if (predicate(lastValue)) {
        return lastValue;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(delayMs);
  }

  if (!lastValue && lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Polling ${url} timed out. Last value: ${JSON.stringify(lastValue)}`);
}

async function hasBrowserRuntime(): Promise<boolean> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

function buildHarBase64(baseUrl: string): string {
  const harDocument = {
    log: {
      version: '1.2',
      creator: { name: 'nexus-replay-browser-context', version: '1.0' },
      pages: [{ id: 'page_1', title: 'Checkout', startedDateTime: new Date().toISOString() }],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/health`,
            headers: [{ name: 'cookie', value: 'sessionId=browser-123; cartId=cart-xyz' }]
          },
          response: {
            status: 200,
            headers: [
              { name: 'content-type', value: 'application/json' },
              { name: 'set-cookie', value: 'sessionId=browser-123; Path=/; HttpOnly; Secure; SameSite=Lax' }
            ],
            content: { mimeType: 'application/json', size: 2, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'POST',
            url: `${baseUrl}/not-found`,
            headers: [{ name: 'content-type', value: 'application/json' }],
            postData: { text: JSON.stringify({ cartId: '{{localStorage.cartId}}', orderId: '{{sessionStorage.currentOrderId}}' }) }
          },
          response: {
            status: 404,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 2, text: '{}' }
          }
        }
      ]
    }
  };

  return Buffer.from(JSON.stringify(harDocument)).toString('base64');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const browserRuntimeAvailable = await hasBrowserRuntime();

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const report = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/extension/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      sessionId: `replay_browser_context_${Date.now()}`,
      title: 'Replay browser context smoke',
      pageUrl: 'https://staging.example.test/checkout',
      environment: 'staging',
      reporter: { id: 'qa-browser-context', role: 'qa' },
      severity: 'high',
      signals: { consoleErrorCount: 1, networkErrorCount: 1, stakeholderCount: 1 },
      artifacts: {
        hasHar: true,
        hasLocalStorageSnapshot: true,
        hasSessionStorageSnapshot: true,
        uploads: {
          har: {
            fileName: 'checkout.har',
            mimeType: 'application/json',
            contentBase64: buildHarBase64(baseUrl)
          },
          localStorage: {
            fileName: 'local-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ cartId: 'cart-xyz' })).toString('base64')
          },
          sessionStorage: {
            fileName: 'session-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ currentOrderId: 'order-abc' })).toString('base64')
          }
        }
      }
    })
  });

  const replay = await pollJson<ReplayResponse>(
    `${baseUrl}/internal/reports/${report.reportId}/replay`,
    { headers: authHeaders },
    (value) => value.status === 'completed'
  );

  assert(replay.replayPlan?.execution?.status === 'reproduced', 'Replay execution did not reproduce the failing step');
  assert(JSON.stringify(replay.replayPlan.execution.matchedFailingStepOrders) === JSON.stringify([2]), 'Replay matched failing step orders did not equal [2]');
  assert(replay.replayPlan.execution.restoredLocalStorageKeys.includes('cartId'), 'Replay did not restore localStorage cartId');
  assert(replay.replayPlan.execution.restoredSessionStorageKeys.includes('currentOrderId'), 'Replay did not restore sessionStorage currentOrderId');

  if (browserRuntimeAvailable) {
    assert(replay.replayPlan.execution.executionMode === 'browser-context', `Expected browser-context execution mode, received ${replay.replayPlan.execution.executionMode ?? 'missing'}`);
  }

  console.log(JSON.stringify({
    ok: true,
    reportId: report.reportId,
    browserRuntimeAvailable,
    executionMode: replay.replayPlan.execution.executionMode ?? null,
    replayStatus: replay.replayPlan.execution.status
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});