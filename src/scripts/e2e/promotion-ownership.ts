import 'dotenv/config';

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

interface InstallationLookupResponse {
  installation: {
    id: string;
    installationId: number;
    workspaceId: string;
    accountLogin?: string;
  };
  workspace: WorkspaceResponse;
}

interface WidgetSessionResponse {
  accessToken: string;
}

interface PublicFeedbackResponse {
  accepted: boolean;
  reportId: string;
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

interface ReviewQueueResponse {
  items: Array<{
    reportId: string;
  }>;
}

interface ReportHistoryIssueLink {
  reportId: string;
  state?: string;
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

interface GitHubSetupStatusResponse {
  repository?: {
    strictProjectScopedEnabled?: boolean;
    selected?: string | null;
  };
  installation?: {
    selected?: {
      installationId?: number;
    } | null;
  };
  wizard?: {
    nextAction?: string;
  };
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

function getTargetRepository(): string {
  return process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
}

function getConfiguredInstallationId(): number | null {
  const installationId = Number(process.env.GITHUB_APP_INSTALLATION_ID ?? '');
  return Number.isFinite(installationId) && installationId > 0 ? installationId : null;
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

async function createWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: number): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Promotion Ownership ${suffix}`,
      slug: `promotion-ownership-${suffix}`
    })
  });

  const project = await requestJson<ProjectResponse>(`${baseUrl}/internal/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      workspaceId: workspace.id,
      name: `Checkout ${suffix}`,
      projectKey: `promotion-ownership-${suffix}`
    })
  });

  return { workspace, project };
}

async function createProjectInWorkspace(baseUrl: string, workspaceId: string, headers: Record<string, string>, suffix: number): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`${baseUrl}/internal/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      workspaceId,
      name: `Checkout ${suffix}`,
      projectKey: `promotion-ownership-${suffix}`
    })
  });
}

async function resolveWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: number): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const installationId = getConfiguredInstallationId();
  if (!installationId) {
    return createWorkspaceAndProject(baseUrl, headers, suffix);
  }

  try {
    const lookup = await requestJson<InstallationLookupResponse>(`${baseUrl}/internal/github-app/installations/${installationId}`, {
      headers
    });
    const project = await createProjectInWorkspace(baseUrl, lookup.workspace.id, headers, suffix);
    return {
      workspace: lookup.workspace,
      project
    };
  } catch {
    return createWorkspaceAndProject(baseUrl, headers, suffix);
  }
}

async function createRepoConnection(baseUrl: string, projectId: string, repository: string, headers: Record<string, string>): Promise<void> {
  await requestJson(`${baseUrl}/internal/repo-connections`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      projectId,
      repository,
      isDefault: true,
      config: {
        source: 'e2e:promotion-ownership'
      }
    })
  });
}

async function reconcileGitHubInstallation(
  baseUrl: string,
  workspaceId: string,
  projectId: string,
  repository: string,
  headers: Record<string, string>
): Promise<void> {
  const installationId = getConfiguredInstallationId();
  if (!installationId) {
    return;
  }

  await requestJson(`${baseUrl}/internal/workspaces/${workspaceId}/github-app/reconcile`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      installationId,
      projectId,
      repository,
      isDefault: true
    })
  });
}

async function assertGitHubPromotionScopeReady(
  baseUrl: string,
  workspaceId: string,
  projectId: string,
  repository: string,
  headers: Record<string, string>
): Promise<void> {
  const query = new URLSearchParams({
    workspaceId,
    projectId,
    repository
  });
  const status = await requestJson<GitHubSetupStatusResponse>(
    `${baseUrl}/internal/github-app/setup-status?${query.toString()}`,
    { headers }
  );

  assert(
    status.repository?.strictProjectScopedEnabled === true,
    `GitHub promotion is not enabled for ${repository}. Next wizard action: ${status.wizard?.nextAction ?? 'unknown'}. Installation: ${status.installation?.selected?.installationId ?? 'none'}`
  );
}

async function putTriagePolicy(baseUrl: string, workspaceId: string, headers: Record<string, string>): Promise<void> {
  await requestJson(`${baseUrl}/internal/workspaces/${workspaceId}/triage-policy`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      ownershipRules: [{
        id: '06b75e3d-9f06-4d34-a0b4-2a6ebf0ec001',
        field: 'page-host',
        operator: 'equals',
        value: 'staging.example.test',
        owner: 'checkout-platform',
        scoreBoost: 2,
        reason: 'Promotion ownership smoke routes matching checkout pages to checkout-platform.'
      }],
      priorityRules: []
    })
  });
}

async function createWidgetSession(baseUrl: string, projectId: string, headers: Record<string, string>): Promise<WidgetSessionResponse> {
  return requestJson<WidgetSessionResponse>(`${baseUrl}/internal/projects/${projectId}/widget-session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      origin: 'https://customer.example.test',
      mode: 'embed'
    })
  });
}

async function submitHostedFeedback(baseUrl: string, projectKey: string, title: string, accessToken: string): Promise<PublicFeedbackResponse> {
  return requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-widget-token': accessToken,
      origin: 'https://customer.example.test'
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
      notes: 'Promotion ownership smoke submission.'
    })
  });
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const authHeaders = { Authorization: `Bearer ${getToken()}` };
  const targetRepository = getTargetRepository();
  const runId = Date.now();
  const uniqueTitle = `Checkout service latency regression ${runId}`;

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'health endpoint did not return ok');

  const { workspace, project } = await resolveWorkspaceAndProject(baseUrl, authHeaders, runId);
  await createRepoConnection(baseUrl, project.id, targetRepository, authHeaders);
  await reconcileGitHubInstallation(baseUrl, workspace.id, project.id, targetRepository, authHeaders);
  await assertGitHubPromotionScopeReady(baseUrl, workspace.id, project.id, targetRepository, authHeaders);
  await putTriagePolicy(baseUrl, workspace.id, authHeaders);
  const widgetSession = await createWidgetSession(baseUrl, project.id, authHeaders);

  const seedReport = await submitHostedFeedback(baseUrl, project.projectKey, uniqueTitle, widgetSession.accessToken);
  assert(seedReport.accepted === true, 'Seed hosted feedback submission was not accepted');

  const targetReport = await submitHostedFeedback(baseUrl, project.projectKey, uniqueTitle, widgetSession.accessToken);
  assert(targetReport.accepted === true, 'Target hosted feedback submission was not accepted');

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
    (value) => Array.isArray(value.relatedIssues) && value.relatedIssues.some((issue) => typeof issue.issueUrl === 'string' || typeof issue.state === 'string')
  );
  assert(history.summary.relatedIssueCount > 0, 'report history did not include any related issues');

  const impact = await pollJson<ImpactResponse>(
    `${baseUrl}/internal/reports/${targetReport.reportId}/impact`,
    { headers: authHeaders },
    (value) => typeof value.score === 'number' && value.score > 0 && value.factors.recurrenceCount > 0
  );
  assert(impact.factors.relatedIssueCount > 0, 'refined impact did not include related issue history');

  const reviewQueue = await pollJson<ReviewQueueResponse>(
    `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=10&page=1&sort=newest`,
    { headers: authHeaders },
    (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === targetReport.reportId)
  );
  assert(reviewQueue.items.some((item) => item.reportId === targetReport.reportId), 'Target report did not appear in the review queue');

  await requestExpectingStatus(`${baseUrl}/internal/reports/${targetReport.reportId}/review`, 409, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved',
      notes: 'Repository selection is required for approval.'
    })
  });

  await requestJson(`${baseUrl}/internal/reports/${targetReport.reportId}/review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved',
      repository: targetRepository,
      notes: 'Approved for promotion and merge flow validation.'
    })
  });

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
  assert((preparedHistory?.relatedIssues?.length ?? 0) > 0, 'prepared agent context did not include historical issue links');
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
    (value) => value.promotable === true || value.gates.promotion?.status === 'not-applicable'
  );
  assert(
    closeoutReady.gates.promotion?.status !== 'not-applicable',
    `GitHub promotion stayed not-applicable for ${targetRepository}. Ensure the repository is linked through an installation-backed project connection.`
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