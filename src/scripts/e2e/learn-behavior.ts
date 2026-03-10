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

interface WidgetSessionResponse {
  accessToken: string;
}

interface PublicFeedbackResponse {
  reportId: string;
}

interface ReviewQueueResponse {
  items: Array<{
    reportId: string;
    title?: string | null;
  }>;
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

async function waitForEnabled(locator: { isDisabled(): Promise<boolean> }, attempts = 20): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!(await locator.isDisabled())) {
      return;
    }

    await sleep(250);
  }

  throw new Error('Expected control to become enabled');
}

async function createWorkspaceAndProject(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<{ workspace: WorkspaceResponse; project: ProjectResponse }> {
  const workspace = await requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Learn Behavior ${suffix}`,
      slug: `learn-behavior-${suffix}`
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
      name: `Learn Project ${suffix}`,
      projectKey: `learn-project-${suffix}`
    })
  });

  return { workspace, project };
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
      isDefault: true
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
        email: `learn-behavior-${Date.now()}@example.test`,
        role: 'qa'
      },
      signals: {
        consoleErrorCount: 2,
        networkErrorCount: 1,
        stakeholderCount: 2
      },
      notes: 'Learn behavior e2e report'
    })
  });
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${token.token}` };
  const targetRepository = process.env.E2E_TARGET_REPOSITORY ?? 'smithdavedesign/testRepo';
  const suffix = String(Date.now());

  const browser = await chromium.launch({ headless: true });

  try {
    const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
    assert(health.status === 'ok', 'Health endpoint did not return ok');

    const { project } = await createWorkspaceAndProject(baseUrl, authHeaders, suffix);
    await createRepoConnection(baseUrl, project.id, targetRepository, authHeaders);

    const page = await browser.newPage();
    await page.goto(`${baseUrl}/learn?projectKey=${encodeURIComponent(project.projectKey)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#baseUrl').fill(baseUrl);
    await page.locator('#token').fill(token.token);
    await page.locator('#loadChecklist').click();
    await page.waitForFunction(() => document.getElementById('checklistStatus')?.textContent?.includes('Shared checklist loaded'));

    await page.locator('[data-step-target="pilot"][data-step-status="in-progress"]').click();
    await page.locator('[data-step-note="pilot"]').fill('Pilot boundary confirmed for learn behavior e2e.');
    await page.waitForFunction(() => document.getElementById('checklistStatus')?.textContent?.includes('saved for'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#loadChecklist').click();
    await page.waitForFunction(() => document.getElementById('checklistStatus')?.textContent?.includes('Shared checklist loaded'));
    assert((await page.locator('[data-step-status-label="pilot"]').textContent()) === 'In progress', 'Pilot step did not persist after reload');
    assert((await page.locator('[data-step-note="pilot"]').inputValue()) === 'Pilot boundary confirmed for learn behavior e2e.', 'Pilot note did not persist after reload');

    await page.locator('#resetChecklist').click();
    await page.waitForFunction(() => document.getElementById('checklistStatus')?.textContent?.includes('Checklist reset saved'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#loadChecklist').click();
    await page.waitForFunction(() => document.getElementById('checklistStatus')?.textContent?.includes('Shared checklist loaded'));
    assert((await page.locator('[data-step-status-label="pilot"]').textContent()) === 'Not started', 'Checklist reset did not persist');
    assert((await page.locator('[data-step-note="pilot"]').inputValue()) === '', 'Checklist reset did not clear the pilot note');

    const widgetSession = await createWidgetSession(baseUrl, project.id, authHeaders);
    const feedback = await submitHostedFeedback(baseUrl, project.projectKey, `Learn queue behavior ${suffix}`, widgetSession.accessToken);
    await pollJson<ReviewQueueResponse>(
      `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=20&sort=newest`,
      { headers: authHeaders },
      (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === feedback.reportId)
    );

    await page.route('**/internal/reports/*/context', async (route) => {
      await sleep(500);
      await route.continue();
    });
    await page.goto(`${baseUrl}/learn/review-queue`, { waitUntil: 'domcontentloaded' });
    await page.locator('#baseUrl').fill(baseUrl);
    await page.locator('#token').fill(token.token);
    await page.locator('#projectId').fill(project.id);
    await page.locator('#refresh').click();
    await page.waitForFunction((reportId) => document.getElementById('queue')?.textContent?.includes(reportId), feedback.reportId);

    const approveButton = page.locator('#approve');
    assert(await approveButton.isDisabled(), 'Approve should stay disabled before a report is selected');

    await page.locator('.item', { hasText: feedback.reportId }).click();
    assert(await approveButton.isDisabled(), 'Approve should stay disabled while context is loading');
    await page.waitForFunction(() => document.getElementById('guardrailContext')?.textContent?.includes('Evidence is visible'));
    assert(await approveButton.isDisabled(), 'Approve should stay disabled before notes and repository are resolved');

    await page.locator('#repository').fill('');
    await page.locator('#notes').fill('Approved after visible evidence and rationale review.');
    assert(await approveButton.isDisabled(), 'Approve should stay disabled when repository target is blank');
    await page.locator('#repository').fill(targetRepository);
    await waitForEnabled(approveButton);
    await approveButton.click();
    await page.waitForFunction(() => document.getElementById('queueStatus')?.textContent?.includes('approved'));

    console.log(JSON.stringify({
      ok: true,
      projectId: project.id,
      projectKey: project.projectKey,
      reportId: feedback.reportId,
      targetRepository
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});