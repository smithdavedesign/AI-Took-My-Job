import 'dotenv/config';

interface HealthResponse {
  status: string;
}

interface ReportResponse {
  reportId: string;
}

interface OwnershipCandidate {
  label: string;
  kind: string;
}

interface OwnershipResponse {
  candidates: OwnershipCandidate[];
}

interface SimilarCandidate {
  reportId: string;
}

interface SimilarResponse {
  candidates: SimilarCandidate[];
}

interface AgentTaskResponse {
  agentTaskId: string;
}

interface StoredAgentTask {
  status: string;
  preparedContext?: Record<string, unknown>;
}

interface ExecutionResponse {
  executionId: string;
}

interface StoredExecution {
  status: string;
}

interface PullRequestResponse {
  status: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  mergeCommitSha?: string;
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

async function requestExpectingStatus(url: string, status: number, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (response.status !== status) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed expected ${status} got ${response.status}: ${text}`);
  }

  return text;
}

async function pollJson<T>(url: string, init: RequestInit | undefined, predicate: (value: T) => boolean, attempts = 120, delayMs = 1000): Promise<T> {
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

  throw lastError instanceof Error ? lastError : new Error(`Polling ${url} failed`);
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const authHeaders = { Authorization: `Bearer ${getToken()}` };

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'health endpoint did not return ok');

  const seedReport = await requestJson<ReportResponse>(`${baseUrl}/webhooks/newrelic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getSharedSecret()
    },
    body: JSON.stringify({
      incident_id: `seed_${Date.now()}`,
      event: 'incident',
      severity: 'warning',
      title: 'Checkout service latency regression',
      condition_name: 'Checkout API latency',
      policy_name: 'Checkout SLO',
      owner: 'checkout-platform'
    })
  });

  const targetReport = await requestJson<ReportResponse>(`${baseUrl}/webhooks/newrelic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getSharedSecret()
    },
    body: JSON.stringify({
      incident_id: `target_${Date.now()}`,
      event: 'incident',
      severity: 'warning',
      title: 'Checkout service latency regression',
      condition_name: 'Checkout API latency',
      policy_name: 'Checkout SLO'
    })
  });

  const ownership = await pollJson<OwnershipResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/ownership`,
    { headers: authHeaders },
    (value) => Array.isArray(value.candidates) && value.candidates.length > 0
  );
  assert(ownership.candidates.some((candidate) => candidate.label === 'checkout-platform'), 'ownership candidates did not include checkout-platform');

  const similar = await pollJson<SimilarResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/similar`,
    { headers: authHeaders },
    (value) => Array.isArray(value.candidates) && value.candidates.length > 0
  );
  assert(similar.candidates.some((candidate) => candidate.reportId === seedReport.reportId), 'similar reports did not include the seeded related report');

  const task = await requestJson<AgentTaskResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: targetReport.reportId,
      targetRepository: 'smithdavedesign/testRepo',
      title: `Promote and merge flow ${Date.now()}`,
      objective: 'Create a minimal code change and validate the PR audit plus merge flow.',
      executionMode: 'fix',
      acceptanceCriteria: ['Execution can be promoted after approval.', 'Execution can be merged once approved.']
    })
  });

  const storedTask = await pollJson<StoredAgentTask>(
    `${baseUrl}/internal/agent-tasks/${task.agentTaskId}`,
    { headers: authHeaders },
    (value) => value.status === 'ready'
  );
  assert(storedTask.status === 'ready', 'task did not become ready');
  const preparedOwnership = storedTask.preparedContext?.ownership as { candidates?: OwnershipCandidate[] } | undefined;
  assert(preparedOwnership?.candidates?.some((candidate) => candidate.label === 'checkout-platform'), 'prepared agent context did not include ownership candidates');
  const preparedSimilar = storedTask.preparedContext?.similarReports as { candidates?: SimilarCandidate[] } | undefined;
  assert(preparedSimilar?.candidates?.some((candidate) => candidate.reportId === seedReport.reportId), 'prepared agent context did not include similar reports');

  const createdExecution = await requestJson<ExecutionResponse>(
    `${baseUrl}/internal/agent-tasks/${task.agentTaskId}/execute`,
    { method: 'POST', headers: authHeaders }
  );

  const execution = await pollJson<StoredExecution>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}`,
    { headers: authHeaders },
    (value) => !['queued', 'running'].includes(value.status)
  );
  assert(['changes-generated', 'validated'].includes(execution.status), `unexpected execution status ${execution.status}`);

  await requestJson(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/review`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        status: 'approved',
        notes: 'Approved for PR promotion and merge validation.'
      })
    }
  );

  const promoted = await requestJson<{ pullRequestNumber: number; pullRequestUrl: string }>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/promote`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ draft: false })
    }
  );

  const pullRequest = await pollJson<PullRequestResponse>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/pull-request`,
    { headers: authHeaders },
    (value) => value.status === 'opened' && typeof value.pullRequestNumber === 'number'
  );

  await requestExpectingStatus(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/merge`,
    403,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({ mergeMethod: 'merge' })
    }
  );

  const mergedRecord = await pollJson<PullRequestResponse>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/pull-request`,
    { headers: authHeaders },
    (value) => value.status === 'merge-failed'
  );

  console.log(JSON.stringify({
    ok: true,
    seedReportId: seedReport.reportId,
    reportId: targetReport.reportId,
    topOwner: ownership.candidates[0]?.label ?? null,
    similarReportId: similar.candidates[0]?.reportId ?? null,
    executionId: createdExecution.executionId,
    pullRequestNumber: promoted.pullRequestNumber,
    pullRequestUrl: promoted.pullRequestUrl,
    pullRequestStatus: pullRequest.status,
    mergeStatus: 'merge-failed',
    mergeCommitSha: mergedRecord.mergeCommitSha ?? null,
    mergedRecordStatus: mergedRecord.status
  }, null, 2));
}

void main();