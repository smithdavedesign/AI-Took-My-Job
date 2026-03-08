import 'dotenv/config';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

interface HealthResponse {
  status: string;
}

interface WebhookResponse {
  accepted: boolean;
  reportId: string;
}

interface ActiveIssuesResponse {
  items: Array<{
    reportId: string;
    contextPath: string;
    reportIndex?: {
      services?: string[];
      filePaths?: string[];
    };
    pathHints?: string[];
  }>;
}

interface IssueContextResponse {
  report: {
    id: string;
  };
  reportIndex?: {
    services?: string[];
    filePaths?: string[];
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

function getWebhookSharedSecret(): string {
  const value = process.env.WEBHOOK_SHARED_SECRET;
  assert(value && value.length > 0, 'WEBHOOK_SHARED_SECRET is required');
  return value;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestText(url: string, init?: RequestInit): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    text: await response.text(),
    headers: response.headers
  };
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

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastValue = await requestJson<T>(url, init);
    if (predicate(lastValue)) {
      return lastValue;
    }

    await sleep(delayMs);
  }

  throw new Error(`Polling ${url} timed out. Last value: ${JSON.stringify(lastValue)}`);
}

async function assertHtmlPage(baseUrl: string, path: string): Promise<void> {
  const response = await requestText(`${baseUrl}${path}`);
  assert(response.status === 200, `${path} did not return 200`);
  assert(/text\/html/i.test(response.headers.get('content-type') ?? ''), `${path} did not return HTML`);
  assert(/<title>/i.test(response.text), `${path} did not include a title element`);
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  await assertHtmlPage(baseUrl, '/learn');
  await assertHtmlPage(baseUrl, '/learn/prd');
  await assertHtmlPage(baseUrl, '/learn/developer-workbench');

  const filePath = `src/routes/internal/reports.ts`;
  const seeded = await requestJson<WebhookResponse>(`${baseUrl}/webhooks/newrelic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getWebhookSharedSecret()
    },
    body: JSON.stringify({
      incident_id: `developer-context-${Date.now()}`,
      event: 'developer-context-smoke',
      severity: 'critical',
      title: `Developer context smoke ${Date.now()}`,
      condition_name: filePath,
      owner: 'platform-api',
      details: {
        filePath,
        service: 'platform-api',
        summary: `Regression reported in ${filePath}`
      },
      timestamp: Date.now()
    })
  });
  assert(seeded.accepted, 'New Relic smoke payload was not accepted');

  const activeIssues = await pollJson<ActiveIssuesResponse>(
    `${baseUrl}/internal/reports/active-issues?file=${encodeURIComponent(filePath)}&limit=10`,
    { headers: authHeaders },
    (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === seeded.reportId)
  );

  const matchedIssue = activeIssues.items.find((item) => item.reportId === seeded.reportId);
  assert(matchedIssue, 'Seeded report did not appear in active issues');
  assert(Array.isArray(matchedIssue.reportIndex?.filePaths) && matchedIssue.reportIndex.filePaths.includes(filePath.toLowerCase()), 'Active issue response did not expose persisted file path index');
  assert(Array.isArray(matchedIssue.pathHints) && matchedIssue.pathHints.includes(filePath.toLowerCase()), 'Active issue response did not expose path hints');

  const issueContext = await requestJson<IssueContextResponse>(`${baseUrl}${matchedIssue.contextPath}`, {
    headers: authHeaders
  });
  assert(issueContext.report.id === seeded.reportId, 'Issue context returned the wrong report');
  assert(Array.isArray(issueContext.reportIndex?.services) && issueContext.reportIndex.services.includes('platform-api'), 'Issue context did not include persisted service index');

  console.log(JSON.stringify({
    reportId: seeded.reportId,
    learnRoutes: ['/learn', '/learn/prd', '/learn/developer-workbench'],
    matchedPath: filePath,
    contextPath: matchedIssue.contextPath
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});