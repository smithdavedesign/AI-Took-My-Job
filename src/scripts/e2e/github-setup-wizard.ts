import 'dotenv/config';

import { chromium } from 'playwright-core';

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

interface SetupStatusResponse {
  status: string;
  nextAction: string;
  wizard: {
    status: string;
    nextAction: string;
    canCreateInstallLink: boolean;
    canReconcile: boolean;
    suggestedPayload: {
      workspaceId: string | null;
      projectId: string | null;
      repository: string | null;
      installationId: number | null;
      githubInstallationRecordId: string | null;
      isDefault: boolean;
    };
    steps: Array<{
      id: string;
      label: string;
      status: string;
      detail: string;
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

function describeNextAction(nextAction: string): string {
  switch (nextAction) {
    case 'enable-draft-sync': return 'Enable GITHUB_DRAFT_SYNC_ENABLED so GitHub promotion is allowed.';
    case 'switch-to-app-auth': return 'Switch to GitHub App auth so project-scoped repo bindings use installation-backed credentials.';
    case 'set-app-id': return 'Set GITHUB_APP_ID in the app environment.';
    case 'set-private-key': return 'Set GITHUB_APP_PRIVATE_KEY in the app environment.';
    case 'set-app-slug': return 'Set GITHUB_APP_SLUG so Nexus can generate the GitHub install link.';
    case 'select-workspace': return 'Choose the workspace you want to wire to GitHub.';
    case 'select-project': return 'Choose the project whose repository promotion should be enabled.';
    case 'select-repository': return 'Choose the owner/repo to link into the selected project.';
    case 'create-install-link': return 'Generate the GitHub install link and complete installation in GitHub.';
    case 'select-installation': return 'Select which existing workspace installation should back this project.';
    case 'transfer-installation': return 'Transfer the selected installation into this workspace before linking the repository.';
    case 'grant-repository-access': return 'Update the GitHub App installation so it can see the selected repository.';
    case 'reconcile-installation': return 'Persist the installation and create or refresh the default repo connection for this project.';
    case 'verify-app-permissions': return 'GitHub App credentials are present, but Nexus could not inspect the installation repositories.';
    case 'verify-project-scope': return 'The installation and connection exist, but project-scoped GitHub promotion is still not enabled.';
    case 'ready': return 'GitHub setup is complete for this project and repository.';
    default: return 'Check GitHub setup to see the next step.';
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

async function createWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `GitHub Setup Wizard ${suffix}`,
      slug: `github-setup-wizard-${suffix}`
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
      name: `Wizard Project ${suffix}`,
      projectKey: `wizard-project-${suffix}`
    })
  });

  return { workspace, project };
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const suffix = String(Date.now());

  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const { workspace, project } = await createWorkspaceAndProject(baseUrl, authHeaders, suffix);
  const query = new URLSearchParams({
    workspaceId: workspace.id,
    projectId: project.id,
    repository: targetRepository
  });
  const status = await requestJson<SetupStatusResponse>(`${baseUrl}/internal/github-app/setup-status?${query.toString()}`, {
    headers: authHeaders
  });

  assert(typeof status.status === 'string', 'Setup status did not return status');
  assert(typeof status.nextAction === 'string', 'Setup status did not return nextAction');
  assert(Array.isArray(status.wizard.steps) && status.wizard.steps.length === 5, 'Setup status did not return the expected wizard steps');
  assert(status.wizard.suggestedPayload.workspaceId === workspace.id, 'Setup status did not preserve workspace suggestion');
  assert(status.wizard.suggestedPayload.projectId === project.id, 'Setup status did not preserve project suggestion');
  assert(status.wizard.suggestedPayload.repository === targetRepository, 'Setup status did not preserve repository suggestion');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/learn/onboarding`, { waitUntil: 'domcontentloaded' });
    await page.locator('#baseUrl').fill(baseUrl);
    await page.locator('#token').fill(token.token);
    await page.locator('#workspaceId').fill(workspace.id);
    await page.locator('#projectId').fill(project.id);
    await page.locator('#repository').fill(targetRepository);

    await page.locator('#loadGitHubSetup').click();
    await page.waitForFunction((expectedAction) => {
      const pre = document.getElementById('wizardResult');
      return Boolean(pre && pre.textContent && pre.textContent.includes(`"nextAction": "${expectedAction}"`));
    }, status.nextAction);

    const wizardSummary = await page.locator('#wizardSummary').textContent();
    assert((wizardSummary ?? '').includes(describeNextAction(status.nextAction)), 'Wizard summary did not describe the expected next action');

    await page.locator('#runGitHubWizard').click();

    if (status.nextAction === 'create-install-link') {
      await page.waitForFunction(() => {
        const summary = document.getElementById('installLinkSummary');
        return Boolean(summary && summary.textContent && summary.textContent.length > 0);
      });
    } else if (status.nextAction === 'ready') {
      await page.waitForFunction(() => {
        const statusEl = document.getElementById('status');
        return Boolean(statusEl && statusEl.textContent && statusEl.textContent.includes('already ready'));
      });
    } else {
      const expectedMessage = describeNextAction(status.nextAction);
      await page.waitForFunction((message) => {
        const statusEl = document.getElementById('status');
        return Boolean(statusEl && statusEl.textContent && statusEl.textContent.includes(message));
      }, expectedMessage);
    }

    console.log(JSON.stringify({
      ok: true,
      workspaceId: workspace.id,
      projectId: project.id,
      nextAction: status.nextAction,
      wizardStatus: status.wizard.status
    }, null, 2));
  } finally {
    await browser.close();
  }
}

void main();