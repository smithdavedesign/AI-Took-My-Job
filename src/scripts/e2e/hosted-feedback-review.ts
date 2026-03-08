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

interface PublicFeedbackResponse {
  accepted: boolean;
  reportId: string;
  project: {
    id: string;
    projectKey: string;
  };
}

interface ReviewQueueResponse {
  filters?: {
    assignedTo?: string | null;
    page?: number;
    sort?: string;
  };
  summary?: {
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    projectSummaries: Array<{
      project: {
        id: string;
        projectKey: string;
        name: string;
      } | null;
      queuedCount: number;
    }>;
  };
  items: Array<{
    reportId: string;
    reviewPath: string;
    contextPath: string;
    issueState: string;
    assignedReviewerId?: string | null;
  }>;
}

interface ReviewResponse {
  draft?: {
    state: string;
    repository: string;
    issueUrl?: string;
  };
  review?: {
    status: string;
  };
  syncError?: string;
}

interface AgentTaskCreatedResponse {
  agentTaskId: string;
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
  const match = tokens.find((token) => token.scopes.includes('internal:read') && token.scopes.includes('github:draft'));
  assert(match, 'No INTERNAL_SERVICE_TOKENS entry provides internal:read and github:draft');
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

async function requestExpectingStatus(url: string, status: number, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (response.status !== status) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed expected ${status} got ${response.status}: ${text}`);
  }

  return text;
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

async function assertJavaScriptPage(baseUrl: string, path: string): Promise<void> {
  const response = await requestText(`${baseUrl}${path}`);
  assert(response.status === 200, `${path} did not return 200`);
  assert(/javascript/i.test(response.headers.get('content-type') ?? ''), `${path} did not return JavaScript`);
  assert(/nexus-hosted-widget/i.test(response.text), `${path} did not include the embed bootstrap`);
}

async function createWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<ProjectResponse> {
  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Hosted Feedback Review ${suffix}`,
      slug: `hosted-feedback-review-${suffix}`
    })
  });

  return requestJson<ProjectResponse>(`${baseUrl}/internal/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      workspaceId: workspace.id,
      name: `Checkout ${suffix}`,
      projectKey: `checkout-review-${suffix}`
    })
  });
}

async function submitHostedFeedback(baseUrl: string, projectKey: string, title: string): Promise<PublicFeedbackResponse> {
  return requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      title,
      pageUrl: 'https://staging.example.test/checkout',
      environment: 'staging',
      severity: 'high',
      reporter: {
        email: `qa+${Date.now()}@example.test`,
        role: 'qa'
      },
      signals: {
        consoleErrorCount: 2,
        networkErrorCount: 1,
        stakeholderCount: 2
      },
      notes: 'Hosted feedback review queue smoke'
    })
  });
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const suffix = String(Date.now());

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  await assertHtmlPage(baseUrl, '/learn');
  await assertHtmlPage(baseUrl, '/learn/review-queue');

  const project = await createWorkspaceAndProject(baseUrl, authHeaders, suffix);
  await assertHtmlPage(baseUrl, `/public/projects/${project.projectKey}/widget`);
  await assertJavaScriptPage(baseUrl, `/public/projects/${project.projectKey}/embed.js`);
  const rejectedReport = await submitHostedFeedback(baseUrl, project.projectKey, `Reject hosted feedback ${suffix}`);

  const queuedRejected = await pollJson<ReviewQueueResponse>(
    `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=5&page=1&sort=impact`,
    { headers: authHeaders },
    (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === rejectedReport.reportId)
  );
  const rejectedItem = queuedRejected.items.find((item) => item.reportId === rejectedReport.reportId);
  assert(rejectedItem, 'Rejected hosted feedback did not appear in review queue');
  assert(rejectedItem.issueState === 'awaiting-review', 'Rejected test report was not awaiting review');
  assert(queuedRejected.filters?.page === 1, 'Review queue did not echo the requested page');
  assert(queuedRejected.filters?.sort === 'impact', 'Review queue did not echo the requested sort');
  assert((queuedRejected.summary?.totalItems ?? 0) >= 1, 'Review queue summary did not include queued items');
  assert((queuedRejected.summary?.projectSummaries ?? []).some((entry) => entry.project?.id === project.id), 'Review queue project summaries did not include the created project');

  const assignedQueue = await requestJson<ReviewQueueResponse>(
    `${baseUrl}/internal/reports/review-queue/actions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        action: 'assign',
        reportIds: [rejectedReport.reportId],
        reviewerId: 'queue-smoke-owner',
        notes: 'Assigned during smoke validation.'
      })
    }
  ) as unknown as ReviewQueueResponse;
  assert(Boolean(assignedQueue), 'Bulk assignment did not return a response');

  const filteredAssignedQueue = await requestJson<ReviewQueueResponse>(
    `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&assignedTo=${encodeURIComponent('queue-smoke-owner')}&limit=5&page=1&sort=impact`,
    { headers: authHeaders }
  );
  const assignedItem = filteredAssignedQueue.items.find((item) => item.reportId === rejectedReport.reportId);
  assert(assignedItem?.assignedReviewerId === 'queue-smoke-owner', 'Assigned report did not round-trip through the review queue filter');
  assert(filteredAssignedQueue.filters?.assignedTo === 'queue-smoke-owner', 'Assigned-to filter did not echo in the review queue response');

  const initialRejectedReview = await requestJson<ReviewResponse>(`${baseUrl}${rejectedItem.reviewPath}`, {
    headers: authHeaders
  });
  assert(initialRejectedReview.review?.status === 'pending', 'Rejected test report did not start pending');

  const rejectedResult = await requestJson<ReviewResponse>(`${baseUrl}/internal/reports/${rejectedReport.reportId}/review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'rejected',
      notes: 'Noise report rejected by smoke test.'
    })
  });
  assert(rejectedResult.review?.status === 'rejected', 'Rejected review did not persist rejected state');
  assert(rejectedResult.draft?.state === 'rejected', 'Rejected review did not update draft state');

  await requestExpectingStatus(`${baseUrl}/internal/agent-tasks`, 409, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: rejectedReport.reportId,
      targetRepository,
      title: 'Rejected report should stay gated',
      objective: 'This should fail before task creation.',
      executionMode: 'investigate',
      acceptanceCriteria: ['Rejection blocks agent work.']
    })
  });

  const approvedReport = await submitHostedFeedback(baseUrl, project.projectKey, `Approve hosted feedback ${suffix}`);
  const queuedApproved = await pollJson<ReviewQueueResponse>(
    `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=5&page=1&sort=newest`,
    { headers: authHeaders },
    (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === approvedReport.reportId)
  );
  const approvedItem = queuedApproved.items.find((item) => item.reportId === approvedReport.reportId);
  assert(approvedItem, 'Approved hosted feedback did not appear in review queue');

  const approvedResult = await requestJson<ReviewResponse>(`${baseUrl}/internal/reports/${approvedReport.reportId}/review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved',
      repository: targetRepository,
      notes: 'Approved for operator follow-up.'
    })
  });
  assert(approvedResult.review?.status === 'approved', 'Approved review did not persist approved state');
  assert(approvedResult.draft?.state === 'local-draft' || approvedResult.draft?.state === 'synced' || approvedResult.draft?.state === 'sync-failed', 'Approved review did not transition draft out of awaiting-review');

  const createdTask = await requestJson<AgentTaskCreatedResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: approvedReport.reportId,
      targetRepository,
      title: 'Approved hosted feedback can create agent task',
      objective: 'Validate review gating before agent work begins.',
      executionMode: 'investigate',
      acceptanceCriteria: ['Approved hosted feedback allows agent task creation.']
    })
  });
  assert(createdTask.agentTaskId, 'Approved report did not create an agent task');

  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    projectKey: project.projectKey,
    rejectedReportId: rejectedReport.reportId,
    approvedReportId: approvedReport.reportId,
    approvedDraftState: approvedResult.draft?.state ?? null,
    reviewConsole: '/learn/review-queue',
    createdAgentTaskId: createdTask.agentTaskId
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});