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

interface InstallationLookupResponse {
  installation: {
    installationId: number;
    workspaceId: string;
  };
  workspace: WorkspaceResponse;
}

interface WidgetSessionResponse {
  widgetUrl: string;
  embedScriptUrl: string;
  accessToken: string;
}

interface ReviewQueueResponse {
  items: Array<{
    reportId: string;
  }>;
}

interface WidgetDiagnostics {
  consoleMessages: string[];
  pageErrors: string[];
  requestFailures: string[];
  feedbackResponses: Array<{
    status: number;
    url: string;
    body: string;
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

function getWidgetOrigin(): string | null {
  const value = process.env.E2E_WIDGET_ORIGIN?.trim();
  return value ? value : null;
}

function getTargetRepository(): string {
  return process.env.E2E_TARGET_REPOSITORY
    ?? ([process.env.GITHUB_OWNER, process.env.GITHUB_REPO].filter(Boolean).join('/') || 'smithdavedesign/testRepo');
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
  const match = tokens.find((token) => token.scopes.includes('internal:read'));
  assert(match, 'No INTERNAL_SERVICE_TOKENS entry provides internal:read');
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

async function pollJson<T>(url: string, init: RequestInit | undefined, predicate: (value: T) => boolean, attempts = 60, delayMs = 1000): Promise<T> {
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

async function createWorkspace(baseUrl: string, headers: Record<string, string>, suffix: string): Promise<WorkspaceResponse> {
  return requestJson<WorkspaceResponse>(`${baseUrl}/internal/workspaces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      name: `Widget Browser ${suffix}`,
      slug: `widget-browser-${suffix}`
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
      name: `Widget Browser ${suffix}`,
      projectKey: `widget-browser-${suffix}`
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
        source: 'e2e:widget-browser-submit'
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

async function createWidgetSession(baseUrl: string, projectId: string, headers: Record<string, string>): Promise<WidgetSessionResponse> {
  const origin = getWidgetOrigin();
  return requestJson<WidgetSessionResponse>(`${baseUrl}/internal/projects/${projectId}/widget-session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify({
      ...(origin ? { origin } : {}),
      mode: 'widget'
    })
  });
}

async function waitForSubmissionResult(page: import('playwright-core').Page): Promise<{ statusText: string; responseText: string | null }> {
  await page.waitForFunction(() => {
    const status = document.getElementById('status');
    if (!status || !status.textContent) {
      return false;
    }

    return status.textContent.includes('Feedback accepted. Report') || status.classList.contains('error');
  }, undefined, { timeout: 30000 });

  const statusText = (await page.locator('#status').textContent())?.trim() ?? '';
  const responseText = (await page.locator('#responsePreview').textContent())?.trim() ?? null;
  return { statusText, responseText };
}

async function waitForFeedbackResponse(diagnostics: WidgetDiagnostics, attempts = 30, delayMs = 1000): Promise<WidgetDiagnostics['feedbackResponses'][number] | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const latest = diagnostics.feedbackResponses.at(-1) ?? null;
    if (latest) {
      return latest;
    }

    await sleep(delayMs);
  }

  return null;
}

async function readSubmissionState(page: import('playwright-core').Page): Promise<{ statusText: string; responseText: string | null; currentUrl: string | null }> {
  return page.evaluate(() => ({
    statusText: document.getElementById('status')?.textContent?.trim() ?? '',
    responseText: document.getElementById('responsePreview')?.textContent?.trim() ?? null,
    currentUrl: window.location.href
  }));
}

async function collectFormValidationState(page: import('playwright-core').Page): Promise<{ valid: boolean; invalidFields: string[] }> {
  return page.locator('#feedbackForm').evaluate((form) => {
    const htmlForm = form as HTMLFormElement;
    const elements = Array.from(htmlForm.elements) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    const invalidFields = elements
      .filter((element) => typeof element.checkValidity === 'function' && !element.checkValidity())
      .map((element) => `${element.id || element.name || element.tagName}: ${element.validationMessage}`);

    return {
      valid: htmlForm.checkValidity(),
      invalidFields
    };
  });
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const serviceToken = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${serviceToken.token}` };
  const targetRepository = getTargetRepository();
  const suffix = String(Date.now());

  console.log('widget-browser-submit: health-check');
  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  console.log('widget-browser-submit: create-project');
  const { workspace, project } = await resolveWorkspaceAndProject(baseUrl, authHeaders, suffix);
  await createRepoConnection(baseUrl, project.id, targetRepository, authHeaders);
  await reconcileGitHubInstallation(baseUrl, workspace.id, project.id, targetRepository, authHeaders);

  console.log('widget-browser-submit: create-widget-session');
  const widgetSession = await createWidgetSession(baseUrl, project.id, authHeaders);
  assert(Boolean(widgetSession.widgetUrl), 'Widget session did not include a widget URL');

  console.log('widget-browser-submit: launch-browser');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const diagnostics: WidgetDiagnostics = {
      consoleMessages: [],
      pageErrors: [],
      requestFailures: [],
      feedbackResponses: []
    };
    page.on('console', (message) => {
      diagnostics.consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      diagnostics.pageErrors.push(error.message);
    });
    page.on('requestfailed', (request) => {
      diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown error'}`);
    });
    page.on('response', async (response) => {
      if (!response.url().includes('/public/projects/') || !response.url().includes('/feedback')) {
        return;
      }

      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        bodyText = '<unavailable>';
      }
      diagnostics.feedbackResponses.push({
        status: response.status(),
        url: response.url(),
        body: bodyText
      });
    });
    console.log('widget-browser-submit: open-widget');
    await page.goto(widgetSession.widgetUrl, { waitUntil: 'domcontentloaded' });

    const title = `Widget browser submission ${suffix}`;
    const reporterEmail = `widget-browser-${suffix}@example.test`;

    await page.locator('#title').fill(title);
    await page.locator('#pageUrl').fill('https://customer.example.test/checkout');
    await page.locator('#description').fill('Submitted through the hosted browser widget smoke to validate the public form path.');
    await page.locator('#severity').selectOption('high');
    await page.locator('#environment').selectOption('staging');
    await page.locator('#reporterName').fill('Widget Browser Smoke');
    await page.locator('#reporterEmail').fill(reporterEmail);
    await page.locator('#reporterRole').selectOption('qa');
    await page.locator('#consoleErrorCount').fill('1');
    await page.locator('#networkErrorCount').fill('1');
    await page.locator('#stakeholderCount').fill('2');
    await page.locator('#labels').fill('widget, browser-smoke');
    await page.locator('#notes').fill(`Repo target ${targetRepository}`);
    const validationState = await collectFormValidationState(page);
    assert(
      validationState.valid,
      `Widget form is invalid before submit: ${validationState.invalidFields.join('; ')}`
    );
    console.log('widget-browser-submit: submit-form');
    await page.locator('#submitButton').click();

    const feedbackResponse = await waitForFeedbackResponse(diagnostics, 15, 1000);

    let statusText = '';
    let responseText: string | null = null;
    try {
      console.log('widget-browser-submit: wait-for-ui-result');
      const result = await waitForSubmissionResult(page);
      statusText = result.statusText;
      responseText = result.responseText;
    } catch (error) {
      const submissionState = await readSubmissionState(page);
      statusText = submissionState.statusText;
      responseText = submissionState.responseText;
      if ((!statusText || !responseText) && feedbackResponse?.status === 200) {
        statusText = statusText || 'Feedback accepted. Report captured via network response.';
        responseText = responseText || feedbackResponse.body;
      }
      const diagnosticMessage = JSON.stringify({
        statusText,
        responseText,
        feedbackResponse,
        currentUrl: submissionState.currentUrl,
        diagnostics
      });
      throw new Error(`Widget submission did not settle: ${diagnosticMessage}`, { cause: error });
    }
    assert(
      statusText.includes('Feedback accepted. Report'),
      `Widget submission failed: ${statusText}${responseText ? ` | ${responseText}` : ''} :: ${JSON.stringify(diagnostics)}`
    );
    assert(responseText, 'Widget response preview was empty after submission');
    const response = JSON.parse(responseText) as { reportId?: string; dashboardUrl?: string };
    assert(typeof response.reportId === 'string', 'Widget submission response did not include a reportId');

    console.log('widget-browser-submit: poll-review-queue');
    const queue = await pollJson<ReviewQueueResponse>(
      `${baseUrl}/internal/reports/review-queue?projectId=${encodeURIComponent(project.id)}&limit=10&page=1&sort=newest`,
      { headers: authHeaders },
      (value) => Array.isArray(value.items) && value.items.some((item) => item.reportId === response.reportId)
    );

    assert(queue.items.some((item) => item.reportId === response.reportId), 'Review queue did not include the browser-submitted report');

    console.log(JSON.stringify({
      ok: true,
      workspaceId: workspace.id,
      projectId: project.id,
      targetRepository,
      widgetUrl: widgetSession.widgetUrl,
      reportId: response.reportId,
      dashboardUrl: response.dashboardUrl ?? null,
      status: statusText ?? null
    }, null, 2));
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});