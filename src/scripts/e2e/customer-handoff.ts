import 'dotenv/config';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

interface HealthResponse {
  status: string;
}

interface WorkspaceResponse {
  id: string;
  slug: string;
  name: string;
}

interface ProjectResponse {
  id: string;
  projectKey: string;
  name: string;
}

interface ProjectLookupResponse {
  project: ProjectResponse & { workspaceId: string };
  workspace: WorkspaceResponse;
}

interface RepoConnectionResponse {
  id: string;
  repository: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
}

interface WidgetSessionResponse {
  widgetUrl: string;
  embedScriptUrl: string;
  accessToken: string;
}

interface PublicFeedbackResponse {
  reportId: string;
}

interface ReviewQueueResponse {
  items: Array<{
    reportId: string;
  }>;
}

interface DraftResponse {
  state?: string;
  draft?: {
    state?: string;
  };
}

interface ProjectOperationsResponse {
  support?: {
    readiness?: string;
    issues?: string[];
    recentHostedFeedback?: Array<{
      id: string;
    }>;
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

function getBudgetMs(): number {
  const raw = Number(process.env.E2E_CUSTOMER_HANDOFF_BUDGET_MS ?? process.env.E2E_CUSTOMER_HANDOFF_TOTAL_BUDGET_MS ?? '30000');
  return Number.isFinite(raw) && raw > 0 ? raw : 30000;
}

function getStageBudgetMs(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
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

async function poll<T>(operation: () => Promise<T>, predicate: (value: T) => boolean, attempts = 40, delayMs = 1000): Promise<T> {
  let lastValue: T | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastValue = await operation();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await sleep(delayMs);
  }

  throw new Error(`Polling timed out. Last value: ${JSON.stringify(lastValue)}`);
}

async function assertHtmlPage(url: string): Promise<void> {
  const response = await requestText(url);
  assert(response.status === 200, `${url} did not return 200`);
  assert(/text\/html/i.test(response.headers.get('content-type') ?? ''), `${url} did not return HTML`);
}

function assertBudget(label: string, actualMs: number, budgetMs: number): void {
  assert(actualMs <= budgetMs, `${label} exceeded budget: ${actualMs}ms > ${budgetMs}ms`);
}

async function assertJavaScriptPage(url: string): Promise<void> {
  const response = await requestText(url);
  assert(response.status === 200, `${url} did not return 200`);
  assert(/javascript/i.test(response.headers.get('content-type') ?? ''), `${url} did not return JavaScript`);
}

function normalizeLocalUrl(rawUrl: string, baseUrl: string): string {
  const parsed = new URL(rawUrl);
  return new URL(`${parsed.pathname}${parsed.search}`, baseUrl).toString();
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const budgetMs = getBudgetMs();
  const bootstrapBudgetMs = getStageBudgetMs('E2E_CUSTOMER_HANDOFF_BOOTSTRAP_BUDGET_MS', 5000);
  const widgetReadyBudgetMs = getStageBudgetMs('E2E_CUSTOMER_HANDOFF_WIDGET_READY_BUDGET_MS', 10000);
  const feedbackSubmitBudgetMs = getStageBudgetMs('E2E_CUSTOMER_HANDOFF_FEEDBACK_SUBMIT_BUDGET_MS', 12000);
  const queueReadyBudgetMs = getStageBudgetMs('E2E_CUSTOMER_HANDOFF_QUEUE_READY_BUDGET_MS', budgetMs);
  const draftReadyBudgetMs = getStageBudgetMs('E2E_CUSTOMER_HANDOFF_DRAFT_READY_BUDGET_MS', budgetMs);
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const suffix = String(Date.now());
  const startedAt = Date.now();

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');
  await assertHtmlPage(`${baseUrl}/learn/support-ops`);

  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      name: `Customer Handoff ${suffix}`,
      slug: `customer-handoff-${suffix}`
    })
  });

  const project = await requestJson<ProjectResponse>(`${baseUrl}/internal/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      workspaceId: workspace.id,
      name: `Customer Handoff ${suffix}`,
      projectKey: `customer-handoff-${suffix}`
    })
  });

  const projectLookup = await requestJson<ProjectLookupResponse>(`${baseUrl}/internal/projects/key/${encodeURIComponent(project.projectKey)}`, {
    headers: authHeaders
  });
  assert(projectLookup.project.id === project.id, 'Project key lookup did not resolve the created project');
  assert(projectLookup.workspace.id === workspace.id, 'Project key lookup did not include the correct workspace');

  const repoConnection = await requestJson<RepoConnectionResponse>(`${baseUrl}/internal/repo-connections`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      projectId: project.id,
      repository: targetRepository,
      isDefault: true,
      config: {
        source: 'e2e:customer-handoff'
      }
    })
  });
  assert(repoConnection.repository === targetRepository, 'Repo connection did not target the requested repository');

  const bootstrappedAt = Date.now();
  assertBudget('Customer handoff bootstrap', bootstrappedAt - startedAt, bootstrapBudgetMs);

  const operationsBeforeFeedback = await requestJson<ProjectOperationsResponse>(`${baseUrl}/internal/projects/${project.id}/operations`, {
    headers: authHeaders
  });
  assert(operationsBeforeFeedback.support?.readiness === 'ready', `Expected ready support status, received ${operationsBeforeFeedback.support?.readiness ?? 'missing'}`);

  const widgetSession = await requestJson<WidgetSessionResponse>(`${baseUrl}/internal/projects/${project.id}/widget-session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      origin: 'https://customer.example.test',
      mode: 'embed'
    })
  });

  await assertHtmlPage(normalizeLocalUrl(widgetSession.widgetUrl, baseUrl));
  await assertJavaScriptPage(normalizeLocalUrl(widgetSession.embedScriptUrl, baseUrl));
  const widgetReadyAt = Date.now();
  assertBudget('Customer handoff widget readiness', widgetReadyAt - startedAt, widgetReadyBudgetMs);

  const feedback = await requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${project.projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-widget-token': widgetSession.accessToken,
      origin: 'https://customer.example.test'
    },
    body: JSON.stringify({
      title: `Customer handoff smoke ${suffix}`,
      pageUrl: 'https://customer.example.test/checkout',
      environment: 'staging',
      severity: 'high',
      reporter: {
        email: `customer-handoff-${suffix}@example.test`,
        role: 'end-user'
      },
      signals: {
        consoleErrorCount: 1,
        networkErrorCount: 1,
        stakeholderCount: 1
      },
      notes: 'Validate under-60-second customer handoff path.'
    })
  });
  const feedbackSubmittedAt = Date.now();
  assertBudget('Customer handoff feedback submission', feedbackSubmittedAt - startedAt, feedbackSubmitBudgetMs);

  const queueResult = await poll(
    () => requestJson<ReviewQueueResponse>(`${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=20`, {
      headers: authHeaders
    }),
    (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === feedback.reportId),
    60,
    1000
  );
  assert(queueResult.items.some((item) => item.reportId === feedback.reportId), 'Review queue did not include the submitted report');
  const queueReadyAt = Date.now();
  assertBudget('Customer handoff review queue visibility', queueReadyAt - startedAt, queueReadyBudgetMs);

  const draft = await poll(
    async () => {
      const response = await requestText(`${baseUrl}/internal/reports/${feedback.reportId}/draft`, { headers: authHeaders });
      if (response.status !== 200) {
        return null;
      }
      return JSON.parse(response.text) as DraftResponse;
    },
    (value) => Boolean(value && ((value.draft && value.draft.state) || value.state)),
    60,
    1000
  );
  const draftReadyAt = Date.now();
  assertBudget('Customer handoff draft readiness', draftReadyAt - startedAt, draftReadyBudgetMs);

  const operationsAfterFeedback = await requestJson<ProjectOperationsResponse>(`${baseUrl}/internal/projects/${project.id}/operations`, {
    headers: authHeaders
  });
  assert(
    Array.isArray(operationsAfterFeedback.support?.recentHostedFeedback)
      && operationsAfterFeedback.support.recentHostedFeedback.some((entry) => entry.id === feedback.reportId),
    'Support snapshot did not include the submitted hosted feedback report'
  );

  const totalMs = draftReadyAt - startedAt;
  assert(totalMs <= budgetMs, `Customer handoff exceeded budget: ${totalMs}ms > ${budgetMs}ms`);

  console.log(JSON.stringify({
    ok: true,
    workspaceId: workspace.id,
    projectId: project.id,
    reportId: feedback.reportId,
    supportReadiness: operationsAfterFeedback.support?.readiness ?? null,
    draftState: draft?.draft?.state ?? draft?.state ?? null,
    totalMs,
    budgetMs,
    budgets: {
      bootstrapBudgetMs,
      widgetReadyBudgetMs,
      feedbackSubmitBudgetMs,
      queueReadyBudgetMs,
      draftReadyBudgetMs
    },
    timings: {
      bootstrapMs: bootstrappedAt - startedAt,
      widgetReadyMs: widgetReadyAt - startedAt,
      feedbackSubmitMs: feedbackSubmittedAt - startedAt,
      queueReadyMs: queueReadyAt - startedAt,
      draftReadyMs: draftReadyAt - startedAt
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});