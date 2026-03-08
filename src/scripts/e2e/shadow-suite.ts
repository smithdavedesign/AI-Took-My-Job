import 'dotenv/config';

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
    };
  };
}

interface ShadowSuiteCreateResponse {
  shadowSuiteId: string;
}

interface ShadowSuiteRunResponse {
  shadowSuiteRunId: string;
}

interface StoredShadowSuiteRun {
  id: string;
  status: 'queued' | 'processing' | 'passed' | 'failed';
  actualOutcome?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000';
}

function getToken(): string {
  return 'nexus-local-dev-token';
}

function getSharedSecret(): string {
  return process.env.WEBHOOK_SHARED_SECRET ?? 'replace-me';
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

async function pollJson<T>(url: string, init: RequestInit | undefined, predicate: (value: T) => boolean, attempts = 60, delayMs = 1000): Promise<T> {
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
  if (lastValue) {
    throw new Error(`Polling ${url} timed out. Last value: ${JSON.stringify(lastValue)}`);
  }
  throw lastError instanceof Error ? lastError : new Error(`Polling ${url} timed out`);
}

function buildHarBase64(baseUrl: string): string {
  const harDocument = {
    log: {
      version: '1.2',
      creator: { name: 'nexus-shadow-suite', version: '1.0' },
      pages: [{ id: 'page_1', title: 'Health', startedDateTime: new Date().toISOString() }],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/health`,
            headers: []
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 2, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/not-found`,
            headers: []
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
  const baseUrl = getBaseUrl();
  const token = getToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const extensionResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/extension/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getSharedSecret()
    },
    body: JSON.stringify({
      sessionId: `shadow_suite_${Date.now()}`,
      title: 'Shadow suite retained replay smoke',
      pageUrl: `${baseUrl}/health`,
      environment: 'staging',
      reporter: { id: 'qa-shadow-suite', role: 'qa' },
      severity: 'high',
      signals: { consoleErrorCount: 0, networkErrorCount: 1, stakeholderCount: 1 },
      artifacts: {
        hasHar: true,
        hasConsoleLogs: false,
        hasLocalStorageSnapshot: false,
        hasSessionStorageSnapshot: false,
        uploads: {
          har: {
            fileName: 'shadow-suite.har',
            mimeType: 'application/json',
            contentBase64: buildHarBase64(baseUrl)
          }
        }
      },
      notes: 'shadow suite smoke retention test'
    })
  });

  const replay = await pollJson<ReplayResponse>(
    `${baseUrl}/internal/reports/${extensionResponse.reportId}/replay`,
    { headers: authHeaders },
    (value) => value.status === 'completed'
  );
  assert(replay.replayPlan?.execution?.status === 'reproduced', 'Baseline replay did not reproduce as expected');

  const suite = await requestJson<ShadowSuiteCreateResponse>(`${baseUrl}/internal/shadow-suites`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      reportId: extensionResponse.reportId,
      name: 'Shadow suite smoke',
      environment: 'staging',
      targetOrigin: baseUrl,
      cadenceSeconds: 300,
      expectedOutcome: 'reproduced',
      retentionReason: 'E2E smoke retained replay'
    })
  });

  const queued = await requestJson<ShadowSuiteRunResponse>(`${baseUrl}/internal/shadow-suites/${suite.shadowSuiteId}/run`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ triggeredBy: 'e2e-shadow-suite' })
  });

  const runs = await pollJson<StoredShadowSuiteRun[]>(
    `${baseUrl}/internal/shadow-suites/${suite.shadowSuiteId}/runs`,
    { headers: authHeaders },
    (value) => Array.isArray(value) && value.some((run) => run.id === queued.shadowSuiteRunId && (run.status === 'passed' || run.status === 'failed'))
  );

  const completedRun = runs.find((run) => run.id === queued.shadowSuiteRunId);
  assert(completedRun?.status === 'passed', `Shadow suite run did not pass: ${JSON.stringify(completedRun)}`);

  console.log(JSON.stringify({
    reportId: extensionResponse.reportId,
    shadowSuiteId: suite.shadowSuiteId,
    shadowSuiteRunId: queued.shadowSuiteRunId,
    runStatus: completedRun.status,
    actualOutcome: completedRun.actualOutcome ?? null
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});