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

interface ReportHistoryIssueLink {
  reportId: string;
  issueUrl?: string;
}

interface ReportHistoryPullRequestLink {
  executionId: string;
  status: string;
  pullRequestUrl?: string;
}

interface ReportHistoryResponse {
  summary: {
    relatedIssueCount: number;
    relatedPullRequestCount: number;
    mergedPullRequestCount: number;
    similarReportCount: number;
  };
  relatedIssues: ReportHistoryIssueLink[];
  relatedPullRequests: ReportHistoryPullRequestLink[];
}

interface ImpactResponse {
  score: number;
  band: string;
  factors: {
    recurrenceCount: number;
    relatedIssueCount: number;
    relatedPullRequestCount: number;
  };
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
  findings?: string[];
  resultSummary?: {
    outcome?: string;
    nextAction?: string;
  };
}

interface ExecutionCloseout {
  closeoutStatus: string;
  promotable: boolean;
  mergeable: boolean;
  blockers: string[];
  gates: {
    review?: {
      status: string;
    };
    promotion?: {
      status: string;
    };
    merge?: {
      status: string;
    };
  };
}

interface PullRequestResponse {
  status: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  mergeCommitSha?: string;
}

interface GitHubPullRequestDetails {
  body: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isHandoffOnlyExecution(execution: StoredExecution): boolean {
  if (execution.status !== 'completed') {
    return false;
  }

  if (execution.resultSummary?.outcome !== 'workspace-prepared') {
    return false;
  }

  return Array.isArray(execution.findings)
    && execution.findings.some((finding) => finding.includes('Agent command not configured'));
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

function getTargetRepository(): string {
  return process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
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

async function requestGitHubPullRequest(repository: string, pullRequestNumber: number): Promise<GitHubPullRequestDetails | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  const [owner, repo] = repository.split('/');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`GET GitHub pull request failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as GitHubPullRequestDetails;
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const authHeaders = { Authorization: `Bearer ${getToken()}` };
  const targetRepository = getTargetRepository();
  const runId = Date.now();
  const uniqueTitle = `Checkout service latency regression ${runId}`;
  const uniqueCondition = `Checkout API latency ${runId}`;
  const uniquePolicy = `Checkout SLO ${runId}`;

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'health endpoint did not return ok');

  const seedReport = await requestJson<ReportResponse>(`${baseUrl}/webhooks/newrelic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getSharedSecret()
    },
    body: JSON.stringify({
      incident_id: `seed_${runId}`,
      event: 'incident',
      severity: 'warning',
      title: uniqueTitle,
      condition_name: uniqueCondition,
      policy_name: uniquePolicy,
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
      incident_id: `target_${runId}`,
      event: 'incident',
      severity: 'warning',
      title: uniqueTitle,
      condition_name: uniqueCondition,
      policy_name: uniquePolicy
    })
  });

  const ownership = await pollJson<OwnershipResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/ownership`,
    { headers: authHeaders },
    (value) => Array.isArray(value.candidates) && value.candidates.some((candidate) => candidate.label === 'checkout-platform')
  );
  assert(ownership.candidates.some((candidate) => candidate.label === 'checkout-platform'), 'ownership candidates did not include checkout-platform');

  const similar = await pollJson<SimilarResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/similar`,
    { headers: authHeaders },
    (value) => Array.isArray(value.candidates) && value.candidates.some((candidate) => candidate.reportId === seedReport.reportId)
  );
  assert(similar.candidates.some((candidate) => candidate.reportId === seedReport.reportId), 'similar reports did not include the seeded related report');

  const history = await pollJson<ReportHistoryResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/history`,
    { headers: authHeaders },
    (value) => Array.isArray(value.relatedIssues) && value.relatedIssues.some((issue) => issue.reportId === seedReport.reportId && typeof issue.issueUrl === 'string')
  );
  assert(history.summary.relatedIssueCount > 0, 'report history did not include any related issues');

  const impact = await pollJson<ImpactResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/impact`,
    { headers: authHeaders },
    (value) => typeof value.score === 'number' && value.score > 0 && value.factors.recurrenceCount > 0
  );
  assert(impact.factors.relatedIssueCount > 0, 'refined impact did not include related issue history');

  const task = await requestJson<AgentTaskResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: targetReport.reportId,
      targetRepository,
      title: `Promote and merge flow ${runId}`,
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
  const preparedHistory = storedTask.preparedContext?.history as ReportHistoryResponse | undefined;
  assert(preparedHistory?.relatedIssues?.some((issue) => issue.reportId === seedReport.reportId), 'prepared agent context did not include historical issue links');
  const preparedImpact = storedTask.preparedContext?.impact as ImpactResponse | undefined;
  assert(typeof preparedImpact?.score === 'number' && preparedImpact.score >= impact.score, 'prepared agent context did not include refined impact');

  const createdExecution = await requestJson<ExecutionResponse>(
    `${baseUrl}/internal/agent-tasks/${task.agentTaskId}/execute`,
    { method: 'POST', headers: authHeaders }
  );

  const execution = await pollJson<StoredExecution>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}`,
    { headers: authHeaders },
    (value) => !['queued', 'running'].includes(value.status)
  );
  if (isHandoffOnlyExecution(execution)) {
    console.log(JSON.stringify({
      skipped: true,
      reason: 'worker is running without AGENT_EXECUTION_COMMAND, so no promotable code changes were generated',
      executionId: createdExecution.executionId,
      executionStatus: execution.status,
      nextAction: execution.resultSummary?.nextAction ?? null
    }, null, 2));
    return;
  }

  assert(['changes-generated', 'validated'].includes(execution.status), `unexpected execution status ${execution.status}`);

  const closeoutBeforeReview = await requestJson<ExecutionCloseout>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`,
    { headers: authHeaders }
  );
  assert(closeoutBeforeReview.promotable === false, 'Execution should not be promotable before review approval');
  assert(closeoutBeforeReview.blockers.some((blocker) => blocker.includes('approval')), 'Closeout blockers did not mention missing approval before review');

  await requestExpectingStatus(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/review`, 409, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved'
    })
  });

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

  const closeoutReady = await pollJson<ExecutionCloseout>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`,
    { headers: authHeaders },
    (value) => value.promotable === true
  );
  assert(closeoutReady.closeoutStatus === 'ready-for-promotion', `Unexpected closeout status after approval: ${closeoutReady.closeoutStatus}`);

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

  const githubPullRequest = await requestGitHubPullRequest(targetRepository, promoted.pullRequestNumber);
  if (githubPullRequest) {
    assert(githubPullRequest.body.includes('## Evidence References'), 'GitHub pull request body did not include evidence references');
    assert(githubPullRequest.body.includes(createdExecution.executionId), 'GitHub pull request body did not include the execution id');
    assert(githubPullRequest.body.includes(`/internal/reports/${targetReport.reportId}/history`), 'GitHub pull request body did not include the report history reference');
    assert(githubPullRequest.body.includes(`/internal/agent-task-executions/${createdExecution.executionId}/closeout`), 'GitHub pull request body did not include the execution closeout reference');
    assert(githubPullRequest.body.includes('Validation Status'), 'GitHub pull request body did not include validation status');
  }

  await requestExpectingStatus(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/merge`,
    200,
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
    (value) => value.status === 'merged' && typeof value.mergeCommitSha === 'string'
  );

  const mergedHistory = await pollJson<ReportHistoryResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/history`,
    { headers: authHeaders },
    (value) => Array.isArray(value.relatedPullRequests) && value.relatedPullRequests.some((pullRequest) => pullRequest.executionId === createdExecution.executionId && pullRequest.status === 'merged' && typeof pullRequest.pullRequestUrl === 'string')
  );

  const closeoutAfterMerge = await pollJson<ExecutionCloseout>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`,
    { headers: authHeaders },
    (value) => value.closeoutStatus === 'completed'
  );
  assert(closeoutAfterMerge.mergeable === false, 'Merged execution should no longer be mergeable');
  assert(closeoutAfterMerge.gates.merge?.status === 'merged', `Expected merged gate status, received ${closeoutAfterMerge.gates.merge?.status}`);

  console.log(JSON.stringify({
    ok: true,
    seedReportId: seedReport.reportId,
    reportId: targetReport.reportId,
    impactScore: impact.score,
    impactBand: impact.band,
    topOwner: ownership.candidates[0]?.label ?? null,
    similarReportId: similar.candidates[0]?.reportId ?? null,
    executionId: createdExecution.executionId,
    closeoutBeforeReview: closeoutBeforeReview.closeoutStatus,
    closeoutReady: closeoutReady.closeoutStatus,
    closeoutAfterMerge: closeoutAfterMerge.closeoutStatus,
    pullRequestNumber: promoted.pullRequestNumber,
    pullRequestUrl: promoted.pullRequestUrl,
    pullRequestStatus: pullRequest.status,
    mergeStatus: 'merged',
    mergeCommitSha: mergedRecord.mergeCommitSha ?? null,
    mergedRecordStatus: mergedRecord.status,
    mergedHistoryPullRequestCount: mergedHistory.summary.relatedPullRequestCount
  }, null, 2));
}

void main();