import 'dotenv/config';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
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
  linkedProjects: Array<{
    project: ProjectResponse;
    repoConnection: {
      id: string;
      repository: string;
      isDefault: boolean;
      status: 'active' | 'inactive';
    };
  }>;
}

interface TransferResponse {
  sourceWorkspace: WorkspaceResponse;
  targetWorkspace: WorkspaceResponse;
  installation: {
    installationId: number;
  };
  repositoryLink: {
    linked: string | null;
    repoConnectionId: string | null;
    result: string;
  };
  deactivatedConnectionIds: string[];
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

async function requestText(url: string, init?: RequestInit): Promise<{ status: number; text: string; headers: Headers }> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    text: await response.text(),
    headers: response.headers
  };
}

async function assertHtmlPage(baseUrl: string, path: string, init?: RequestInit): Promise<void> {
  const response = await requestText(`${baseUrl}${path}`, init);
  assert(response.status === 200, `${path} did not return 200`);
  assert(/text\/html/i.test(response.headers.get('content-type') ?? ''), `${path} did not return HTML`);
}

async function createWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Transfer Smoke ${suffix}`,
      slug: `transfer-smoke-${suffix}`
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
      name: `Transfer Target ${suffix}`,
      projectKey: `transfer-target-${suffix}`
    })
  });

  return {
    workspace,
    project
  };
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const installationId = Number(process.env.E2E_TRANSFER_INSTALLATION_ID ?? process.env.GITHUB_APP_INSTALLATION_ID ?? '');
  assert(Number.isFinite(installationId) && installationId > 0, 'E2E transfer smoke requires GITHUB_APP_INSTALLATION_ID or E2E_TRANSFER_INSTALLATION_ID');

  await assertHtmlPage(baseUrl, '/learn/onboarding');

  const initialLookup = await requestJson<InstallationLookupResponse>(`${baseUrl}/internal/github-app/installations/${installationId}`, {
    headers: authHeaders
  });

  const activeBindings = initialLookup.linkedProjects.filter((entry) => entry.repoConnection.status === 'active');
  if (activeBindings.length !== 1) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: `installation has ${activeBindings.length} active project bindings; smoke only runs destructive transfer when exactly one binding is active`,
      installationId,
      workspaceId: initialLookup.workspace.id
    }, null, 2));
    return;
  }

  const originalBinding = activeBindings[0]!;
  const suffix = String(Date.now());
  const target = await createWorkspaceAndProject(baseUrl, authHeaders, suffix);

  const transferToTarget = await requestJson<TransferResponse>(`${baseUrl}/internal/workspaces/${target.workspace.id}/github-app/transfer-installation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      installationId,
      projectId: target.project.id,
      repository: originalBinding.repoConnection.repository,
      isDefault: true
    })
  });

  assert(transferToTarget.installation.installationId === installationId, 'Transfer did not return the requested installation');
  assert(transferToTarget.sourceWorkspace.id === initialLookup.workspace.id, 'Transfer source workspace was incorrect');
  assert(transferToTarget.targetWorkspace.id === target.workspace.id, 'Transfer target workspace was incorrect');
  assert(transferToTarget.repositoryLink.linked === originalBinding.repoConnection.repository, 'Transfer did not link the expected repository');
  assert(transferToTarget.deactivatedConnectionIds.includes(originalBinding.repoConnection.id), 'Transfer did not deactivate the original repo connection');

  const transferredLookup = await requestJson<InstallationLookupResponse>(`${baseUrl}/internal/github-app/installations/${installationId}`, {
    headers: authHeaders
  });
  assert(transferredLookup.workspace.id === target.workspace.id, 'Installation lookup did not move to the target workspace after transfer');
  assert(transferredLookup.linkedProjects.some((entry) => entry.project.id === target.project.id && entry.repoConnection.status === 'active'), 'Target workspace did not show an active binding after transfer');

  const transferBack = await requestJson<TransferResponse>(`${baseUrl}/internal/workspaces/${initialLookup.workspace.id}/github-app/transfer-installation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      installationId,
      projectId: originalBinding.project.id,
      repository: originalBinding.repoConnection.repository,
      isDefault: originalBinding.repoConnection.isDefault
    })
  });

  assert(transferBack.targetWorkspace.id === initialLookup.workspace.id, 'Transfer back did not target the original workspace');
  const restoredLookup = await requestJson<InstallationLookupResponse>(`${baseUrl}/internal/github-app/installations/${installationId}`, {
    headers: authHeaders
  });
  assert(restoredLookup.workspace.id === initialLookup.workspace.id, 'Installation lookup did not restore the original workspace');
  assert(restoredLookup.linkedProjects.some((entry) => entry.project.id === originalBinding.project.id && entry.repoConnection.repository === originalBinding.repoConnection.repository && entry.repoConnection.status === 'active'), 'Original project binding was not restored to active state');

  console.log(JSON.stringify({
    ok: true,
    installationId,
    originalWorkspaceId: initialLookup.workspace.id,
    targetWorkspaceId: target.workspace.id,
    repository: originalBinding.repoConnection.repository,
    deactivatedOnFirstTransfer: transferToTarget.deactivatedConnectionIds,
    deactivatedOnRestore: transferBack.deactivatedConnectionIds
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});