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

interface CustomerPortalGrantResponse {
  accessToken: string;
  customerPortalUrl: string;
}

interface PublicDashboardSummaryResponse {
  accessModel: {
    mode: string;
  };
  items: Array<{
    reportId: string;
    owner: {
      label: string;
      kind: string;
    } | null;
  }>;
}

interface ReviewQueueResponse {
  items: Array<{
    reportId: string;
    owner?: {
      label: string;
      kind: string;
    } | null;
    availableRepositories?: string[];
    triagePolicy?: {
      configured?: boolean;
    } | null;
  }>;
}

interface ReviewResponse {
  draft?: {
    state?: string;
    repository?: string;
    issueUrl?: string;
  };
  review?: {
    status: string;
  };
}

interface AgentTaskResponse {
  agentTaskId: string;
}

interface StoredAgentTask {
  status: string;
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

interface ReportHistoryResponse {
  summary: {
    relatedPullRequestCount: number;
  };
  relatedPullRequests: Array<{
    executionId: string;
    status: string;
    pullRequestUrl?: string;
  }>;
}

interface GitHubPullRequestDetails {
  body: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000';
}

function getConfiguredInstallationId(): number | null {
  const installationId = Number(process.env.GITHUB_APP_INSTALLATION_ID ?? '');
  return Number.isFinite(installationId) && installationId > 0 ? installationId : null;
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

async function poll<T>(operation: () => Promise<T>, predicate: (value: T) => boolean, attempts = 120, delayMs = 1000): Promise<T> {
  let lastValue: T | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastValue = await operation();
      if (predicate(lastValue)) {
        return lastValue;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(delayMs);
  }

  if (lastValue) {
    throw new Error(`Polling timed out. Last value: ${JSON.stringify(lastValue)}`);
  }

  throw lastError instanceof Error ? lastError : new Error('Polling failed');
}

async function createWorkspace(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<WorkspaceResponse> {
  return requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Review Dashboard Promotion ${suffix}`,
      slug: `review-dashboard-promotion-${suffix}`
    })
  });
}

async function createProject(baseUrl: string, workspaceId: string, headers: Record<string, string>, suffix: string): Promise<ProjectResponse> {
  return requestJson<ProjectResponse>(`${baseUrl}/internal/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      workspaceId,
      name: `Review Dashboard Promotion ${suffix}`,
      projectKey: `review-dashboard-promotion-${suffix}`
    })
  });
}

async function resolveWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const installationId = getConfiguredInstallationId();
  if (!installationId) {
    const workspace = await createWorkspace(baseUrl, headers, suffix);
    const project = await createProject(baseUrl, workspace.id, headers, suffix);
    return { workspace, project };
  }

  try {
    const lookup = await requestJson<InstallationLookupResponse>(`${baseUrl}/internal/github-app/installations/${installationId}`, {
      headers
    });
    const project = await createProject(baseUrl, lookup.workspace.id, headers, suffix);
    return {
      workspace: lookup.workspace,
      project
    };
  } catch {
    const workspace = await createWorkspace(baseUrl, headers, suffix);
    const project = await createProject(baseUrl, workspace.id, headers, suffix);
    return { workspace, project };
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
        source: 'e2e:review-dashboard-promotion'
      }
    })
  });
}

async function reconcileGitHubInstallation(baseUrl: string, workspaceId: string, projectId: string, repository: string, headers: Record<string, string>): Promise<void> {
  const installationId = getConfiguredInstallationId();
  if (!installationId) {
    return;
  }

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already mapped to another workspace')) {
      throw error;
    }
  }
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
  const status = await requestJson<GitHubSetupStatusResponse>(`${baseUrl}/internal/github-app/setup-status?${query.toString()}`, {
    headers
  });

  assert(
    status.repository?.strictProjectScopedEnabled === true,
    `GitHub promotion is not enabled for ${repository}. Next wizard action: ${status.wizard?.nextAction ?? 'unknown'}. Installation: ${status.installation?.selected?.installationId ?? 'none'}`
  );
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const suffix = String(Date.now());
  const grantedCustomerEmail = `dashboard-promotion-${suffix}@example.test`;

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const { workspace, project } = await resolveWorkspaceAndProject(baseUrl, authHeaders, suffix);
  await createRepoConnection(baseUrl, project.id, targetRepository, authHeaders);
  await reconcileGitHubInstallation(baseUrl, workspace.id, project.id, targetRepository, authHeaders);
  await assertGitHubPromotionScopeReady(baseUrl, workspace.id, project.id, targetRepository, authHeaders);

  await requestJson(`${baseUrl}/internal/workspaces/${workspace.id}/triage-policy`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      ownershipRules: [{
        id: '8a6c0e57-d3c1-470a-9d94-e62c9fd10101',
        field: 'page-host',
        operator: 'equals',
        value: 'customer.example.test',
        owner: 'customer-success',
        scoreBoost: 1.8,
        reason: 'Review dashboard promotion smoke routes the feedback to customer-success.'
      }],
      priorityRules: [{
        id: '8a6c0e57-d3c1-470a-9d94-e62c9fd10102',
        field: 'owner',
        operator: 'equals',
        value: 'customer-success',
        scoreDelta: 8,
        reason: 'Review dashboard promotion smoke boosts customer-success owned reports.'
      }]
    })
  });

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

  const customerPortalGrant = await requestJson<CustomerPortalGrantResponse>(`${baseUrl}/internal/projects/${project.id}/customer-portal-grants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      customerEmail: grantedCustomerEmail,
      customerName: 'Dashboard Promotion Customer',
      notes: 'Durable access for the GitHub-backed dashboard promotion smoke.'
    })
  });
  assert(typeof customerPortalGrant.customerPortalUrl === 'string', 'Customer portal grant did not include a portal URL');

  const feedback = await requestJson<PublicFeedbackResponse>(`${baseUrl}/public/projects/${project.projectKey}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-widget-token': widgetSession.accessToken,
      origin: 'https://customer.example.test'
    },
    body: JSON.stringify({
      title: `Review dashboard promotion ${suffix}`,
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
      notes: 'Validate GitHub-backed promotion from the review dashboard flow.'
    })
  });
  assert(feedback.accepted === true, 'Hosted feedback submission was not accepted');

  const dashboardSummary = await poll(
    () => requestJson<PublicDashboardSummaryResponse>(`${baseUrl}/public/projects/${project.projectKey}/dashboard/summary?accessToken=${encodeURIComponent(widgetSession.accessToken)}`),
    (value) => value.items.some((item) => item.reportId === feedback.reportId)
  );
  assert(dashboardSummary.accessModel.mode === 'signed-widget-session', 'Dashboard summary did not preserve signed widget access');
  const dashboardItem = dashboardSummary.items.find((item) => item.reportId === feedback.reportId);
  assert(dashboardItem?.owner?.label === 'customer-success', 'Dashboard summary did not preserve the policy-backed owner');
  assert(dashboardItem?.owner?.kind === 'policy-owner', 'Dashboard summary did not preserve the policy-backed owner kind');

  const customerPortalSummary = await poll(
    () => requestJson<PublicDashboardSummaryResponse>(`${baseUrl}/public/projects/${project.projectKey}/customer-portal/summary?accessToken=${encodeURIComponent(customerPortalGrant.accessToken)}`),
    (value) => value.items.some((item) => item.reportId === feedback.reportId)
  );
  assert(customerPortalSummary.accessModel.mode === 'customer-portal-grant', 'Customer portal summary did not preserve durable customer access');

  const queued = await poll(
    () => requestJson<ReviewQueueResponse>(`${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&sort=impact&limit=20`, {
      headers: authHeaders
    }),
    (value) => value.items.some((item) => item.reportId === feedback.reportId)
  );
  const queuedItem = queued.items.find((item) => item.reportId === feedback.reportId);
  assert(queuedItem, 'Review queue did not include the submitted report before approval');
  assert(queuedItem.triagePolicy?.configured === true, 'Review queue did not expose configured triage policy state before approval');
  assert(queuedItem.availableRepositories?.includes(targetRepository) === true, 'Review queue did not expose the project repository scope before approval');

  const approvedReview = await requestJson<ReviewResponse>(`${baseUrl}/internal/reports/${feedback.reportId}/review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved',
      repository: targetRepository,
      notes: 'Approved for GitHub-backed dashboard promotion validation.'
    })
  });
  assert(approvedReview.review?.status === 'approved', 'Hosted feedback review was not approved');
  assert(['synced', 'local-draft', 'sync-failed'].includes(approvedReview.draft?.state ?? ''), 'Approved hosted feedback did not leave awaiting-review state');

  const task = await requestJson<AgentTaskResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: feedback.reportId,
      targetRepository,
      title: `Review dashboard promotion follow-up ${suffix}`,
      objective: 'Validate that approved dashboard feedback can be promoted into a GitHub PR and merged.',
      executionMode: 'fix',
      acceptanceCriteria: ['Execution can be reviewed, promoted, and merged for approved dashboard feedback.']
    })
  });

  const storedTask = await poll(
    () => requestJson<StoredAgentTask>(`${baseUrl}/internal/agent-tasks/${task.agentTaskId}`, { headers: authHeaders }),
    (value) => value.status === 'ready'
  );
  assert(storedTask.status === 'ready', 'Agent task did not become ready');

  const createdExecution = await requestJson<ExecutionResponse>(`${baseUrl}/internal/agent-tasks/${task.agentTaskId}/execute`, {
    method: 'POST',
    headers: authHeaders
  });

  const execution = await poll(
    () => requestJson<StoredExecution>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}`, { headers: authHeaders }),
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

  assert(['changes-generated', 'validated'].includes(execution.status), `Unexpected execution status ${execution.status}`);

  const closeoutBeforeReview = await requestJson<ExecutionCloseout>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`, {
    headers: authHeaders
  });
  assert(closeoutBeforeReview.promotable === false, 'Execution should not be promotable before execution review approval');

  await requestJson(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/review`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      status: 'approved',
      notes: 'Approved for review dashboard GitHub promotion validation.'
    })
  });

  const closeoutReady = await poll(
    () => requestJson<ExecutionCloseout>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`, { headers: authHeaders }),
    (value) => value.promotable === true || value.gates.promotion?.status === 'not-applicable'
  );
  assert(closeoutReady.gates.promotion?.status !== 'not-applicable', `GitHub promotion stayed not-applicable for ${targetRepository}. Ensure the repository is linked through an installation-backed project connection.`);
  assert(closeoutReady.closeoutStatus === 'ready-for-promotion', `Unexpected closeout status after approval: ${closeoutReady.closeoutStatus}`);

  const promoted = await requestJson<{ pullRequestNumber: number; pullRequestUrl: string }>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/promote`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({ draft: false })
  });

  const pullRequest = await poll(
    () => requestJson<PullRequestResponse>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/pull-request`, { headers: authHeaders }),
    (value) => value.status === 'opened' && typeof value.pullRequestNumber === 'number'
  );

  const githubPullRequest = await requestGitHubPullRequest(targetRepository, promoted.pullRequestNumber);
  if (githubPullRequest) {
    assert(githubPullRequest.body.includes('## Evidence References'), 'GitHub pull request body did not include evidence references');
    assert(githubPullRequest.body.includes(createdExecution.executionId), 'GitHub pull request body did not include the execution id');
    assert(githubPullRequest.body.includes(`/internal/reports/${feedback.reportId}/history`), 'GitHub pull request body did not include the report history reference');
  }

  await requestText(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/merge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({ mergeMethod: 'merge' })
  });

  const mergedRecord = await poll(
    () => requestJson<PullRequestResponse>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/pull-request`, { headers: authHeaders }),
    (value) => value.status === 'merged' && typeof value.mergeCommitSha === 'string'
  );

  const mergedHistory = await poll(
    () => requestJson<ReportHistoryResponse>(`${baseUrl}/internal/reports/${feedback.reportId}/history`, { headers: authHeaders }),
    (value) => value.relatedPullRequests.some((pullRequestEntry) => pullRequestEntry.executionId === createdExecution.executionId && pullRequestEntry.status === 'merged')
  );

  const closeoutAfterMerge = await poll(
    () => requestJson<ExecutionCloseout>(`${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`, { headers: authHeaders }),
    (value) => value.closeoutStatus === 'completed'
  );
  assert(closeoutAfterMerge.mergeable === false, 'Merged execution should no longer be mergeable');
  assert(closeoutAfterMerge.gates.merge?.status === 'merged', `Expected merged gate status, received ${closeoutAfterMerge.gates.merge?.status}`);

  console.log(JSON.stringify({
    ok: true,
    workspaceId: workspace.id,
    projectId: project.id,
    reportId: feedback.reportId,
    agentTaskId: task.agentTaskId,
    executionId: createdExecution.executionId,
    dashboardOwner: dashboardItem?.owner?.label ?? null,
    queueOwner: queuedItem?.owner?.label ?? null,
    reviewDraftState: approvedReview.draft?.state ?? null,
    closeoutReady: closeoutReady.closeoutStatus,
    closeoutAfterMerge: closeoutAfterMerge.closeoutStatus,
    pullRequestNumber: promoted.pullRequestNumber,
    pullRequestUrl: promoted.pullRequestUrl,
    pullRequestStatus: pullRequest.status,
    mergedRecordStatus: mergedRecord.status,
    mergeCommitSha: mergedRecord.mergeCommitSha ?? null,
    mergedHistoryPullRequestCount: mergedHistory.summary.relatedPullRequestCount
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});