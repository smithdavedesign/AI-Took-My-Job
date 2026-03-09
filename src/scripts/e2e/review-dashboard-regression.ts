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

interface WidgetSessionResponse {
  accessToken: string;
  widgetUrl: string;
  embedScriptUrl: string;
}

interface PublicFeedbackResponse {
  accepted: boolean;
  reportId: string;
  customerPortalUrl?: string;
}

interface CustomerPortalGrantResponse {
  accessToken: string;
  customerPortalUrl: string;
  grant: {
    id: string;
    customerEmail: string;
    status: string;
  };
}

interface PublicDashboardSummaryResponse {
  accessModel: {
    mode: string;
    customerAuth: string;
  };
  triagePolicy?: {
    configured: boolean;
  };
  summary: {
    submissionCount: number;
  };
  items: Array<{
    reportId: string;
    owner: {
      label: string;
      kind: string;
    } | null;
  }>;
}

interface ReviewQueueItem {
  reportId: string;
  assignedReviewerId?: string | null;
  availableRepositories?: string[];
  owner?: {
    label: string;
    kind: string;
  } | null;
  triagePolicy?: {
    configured: boolean;
  };
}

interface ReviewQueueResponse {
  filters?: {
    assignedTo?: string | null;
    search?: string | null;
    sort?: string;
  };
  items: ReviewQueueItem[];
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

function normalizeLocalUrl(rawUrl: string, baseUrl: string): string {
  const parsed = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? new URL(rawUrl)
    : new URL(rawUrl, baseUrl);
  return new URL(`${parsed.pathname}${parsed.search}`, baseUrl).toString();
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const suffix = String(Date.now());
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const grantedCustomerEmail = `dashboard-regression-${suffix}@example.test`;
  const otherReporterEmail = `dashboard-other-${suffix}@example.test`;

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      name: `Review Dashboard Regression ${suffix}`,
      slug: `review-dashboard-regression-${suffix}`
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
      name: `Review Dashboard Regression ${suffix}`,
      projectKey: `review-dashboard-${suffix}`
    })
  });

  await requestJson(`${baseUrl}/internal/repo-connections`, {
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
        source: 'e2e:review-dashboard-regression'
      }
    })
  });

  await requestJson(`${baseUrl}/internal/workspaces/${workspace.id}/triage-policy`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      ownershipRules: [{
        id: 'd6727e54-4445-4222-b4f5-22ea8073d101',
        field: 'page-host',
        operator: 'equals',
        value: 'customer.example.test',
        owner: 'customer-success',
        scoreBoost: 1.8,
        reason: 'Dashboard regression smoke routes customer.example.test reports to customer-success.'
      }],
      priorityRules: [{
        id: 'd6727e54-4445-4222-b4f5-22ea8073d102',
        field: 'owner',
        operator: 'equals',
        value: 'customer-success',
        scoreDelta: 8,
        reason: 'Dashboard regression smoke boosts customer-success owned reports.'
      }]
    })
  });

  const customerPortalGrant = await requestJson<CustomerPortalGrantResponse>(`${baseUrl}/internal/projects/${project.id}/customer-portal-grants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      customerEmail: grantedCustomerEmail,
      customerName: 'Dashboard Regression Customer',
      notes: 'Durable access for review/dashboard regression coverage.'
    })
  });

  const widgetSessionA = await requestJson<WidgetSessionResponse>(`${baseUrl}/internal/projects/${project.id}/widget-session`, {
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

  const widgetSessionB = await requestJson<WidgetSessionResponse>(`${baseUrl}/internal/projects/${project.id}/widget-session`, {
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

  await assertHtmlPage(normalizeLocalUrl(widgetSessionA.widgetUrl, baseUrl));
  await assertHtmlPage(normalizeLocalUrl(customerPortalGrant.customerPortalUrl, baseUrl));

  const primaryFeedback = await requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${project.projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-widget-token': widgetSessionA.accessToken,
      origin: 'https://customer.example.test'
    },
    body: JSON.stringify({
      title: `Review dashboard primary ${suffix}`,
      pageUrl: 'https://customer.example.test/checkout',
      environment: 'staging',
      severity: 'high',
      reporter: {
        email: grantedCustomerEmail,
        role: 'end-user'
      },
      signals: {
        consoleErrorCount: 1,
        networkErrorCount: 1,
        stakeholderCount: 1
      },
      notes: 'Primary report for dashboard scope regression.'
    })
  });

  const secondaryFeedback = await requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${project.projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-widget-token': widgetSessionB.accessToken,
      origin: 'https://customer.example.test'
    },
    body: JSON.stringify({
      title: `Review dashboard secondary ${suffix}`,
      pageUrl: 'https://customer.example.test/cart',
      environment: 'staging',
      severity: 'medium',
      reporter: {
        email: otherReporterEmail,
        role: 'qa'
      },
      signals: {
        consoleErrorCount: 0,
        networkErrorCount: 1,
        stakeholderCount: 1
      },
      notes: 'Secondary report used to verify session and customer scoping.'
    })
  });

  const dashboardSummary = await poll(
    () => requestJson<PublicDashboardSummaryResponse>(`${baseUrl}/public/projects/${project.projectKey}/dashboard/summary?accessToken=${encodeURIComponent(widgetSessionA.accessToken)}`),
    (value) => value.items.some((item) => item.reportId === primaryFeedback.reportId)
  );
  assert(dashboardSummary.accessModel.mode === 'signed-widget-session', 'Dashboard summary did not preserve signed session access');
  assert(dashboardSummary.triagePolicy?.configured === true, 'Dashboard summary did not expose configured triage policy');
  assert(dashboardSummary.items.some((item) => item.reportId === primaryFeedback.reportId), 'Dashboard summary did not include the primary report');
  assert(!dashboardSummary.items.some((item) => item.reportId === secondaryFeedback.reportId), 'Dashboard summary leaked a report from another widget session');
  const dashboardItem = dashboardSummary.items.find((item) => item.reportId === primaryFeedback.reportId);
  assert(dashboardItem?.owner?.label === 'customer-success', 'Dashboard summary did not preserve the policy-backed owner');
  assert(dashboardItem?.owner?.kind === 'policy-owner', 'Dashboard summary did not preserve the policy-backed owner kind');

  const customerPortalSummary = await poll(
    () => requestJson<PublicDashboardSummaryResponse>(`${baseUrl}/public/projects/${project.projectKey}/customer-portal/summary?accessToken=${encodeURIComponent(customerPortalGrant.accessToken)}`),
    (value) => value.items.some((item) => item.reportId === primaryFeedback.reportId)
  );
  assert(customerPortalSummary.accessModel.mode === 'customer-portal-grant', 'Customer portal summary did not preserve durable grant access');
  assert(customerPortalSummary.items.some((item) => item.reportId === primaryFeedback.reportId), 'Customer portal summary did not include the granted customer report');
  assert(!customerPortalSummary.items.some((item) => item.reportId === secondaryFeedback.reportId), 'Customer portal summary leaked a non-granted customer report');

  const queue = await poll(
    () => requestJson<ReviewQueueResponse>(`${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&sort=impact&limit=20`, {
      headers: authHeaders
    }),
    (value) => value.items.some((item) => item.reportId === primaryFeedback.reportId)
      && value.items.some((item) => item.reportId === secondaryFeedback.reportId)
  );
  const primaryQueueItem = queue.items.find((item) => item.reportId === primaryFeedback.reportId);
  assert(primaryQueueItem, 'Review queue did not include the primary report');
  assert(primaryQueueItem.owner?.label === 'customer-success', 'Review queue did not preserve the policy-backed owner');
  assert(primaryQueueItem.owner?.kind === 'policy-owner', 'Review queue did not preserve the policy-backed owner kind');
  assert(primaryQueueItem.triagePolicy?.configured === true, 'Review queue item did not expose triage policy state');
  assert(primaryQueueItem.availableRepositories?.includes(targetRepository) === true, 'Review queue item did not expose the project repository scope');

  await requestJson(`${baseUrl}/internal/reports/review-queue/actions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      action: 'assign',
      reportIds: [primaryFeedback.reportId],
      reviewerId: 'dashboard-owner',
      notes: 'Assigned by dashboard regression smoke.'
    })
  });

  const assignedQueue = await poll(
    () => requestJson<ReviewQueueResponse>(`${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&assignedTo=dashboard-owner&search=${encodeURIComponent('Review dashboard primary')}&sort=impact&limit=20`, {
      headers: authHeaders
    }),
    (value) => value.items.some((item) => item.reportId === primaryFeedback.reportId)
  );
  assert(assignedQueue.filters?.assignedTo === 'dashboard-owner', 'Assigned review queue filter did not echo the reviewer id');
  assert(assignedQueue.filters?.search === 'Review dashboard primary', 'Assigned review queue filter did not echo the search needle');
  assert(assignedQueue.filters?.sort === 'impact', 'Assigned review queue filter did not echo the requested sort');
  assert(assignedQueue.items.some((item) => item.reportId === primaryFeedback.reportId), 'Assigned review queue view did not include the assigned primary report');
  assert(!assignedQueue.items.some((item) => item.reportId === secondaryFeedback.reportId), 'Assigned review queue view leaked the unassigned secondary report');

  console.log(JSON.stringify({
    ok: true,
    workspaceId: workspace.id,
    projectId: project.id,
    primaryReportId: primaryFeedback.reportId,
    secondaryReportId: secondaryFeedback.reportId,
    dashboardSubmissionCount: dashboardSummary.summary.submissionCount,
    customerPortalSubmissionCount: customerPortalSummary.summary.submissionCount,
    assignedQueueCount: assignedQueue.items.length,
    dashboardOwner: dashboardItem?.owner?.label ?? null,
    queueOwner: primaryQueueItem.owner?.label ?? null
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});