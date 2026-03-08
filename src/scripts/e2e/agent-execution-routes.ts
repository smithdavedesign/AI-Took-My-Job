import 'dotenv/config';

import { createGitHubIntegration } from '../../integrations/github/client.js';
import { loadConfig } from '../../support/config.js';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

interface ExtensionWebhookResponse {
  accepted: boolean;
  reportId: string;
  jobId: string;
  replayJobId?: string;
}

interface ReplayResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  replayPlan?: {
    execution?: {
      status: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
      matchedFailingStepOrders: number[];
    };
  };
}

interface AgentTaskResponse {
  accepted: boolean;
  agentTaskId: string;
  processingJobId: string;
  status: 'queued';
}

interface StoredAgentTask {
  id: string;
  feedbackReportId: string;
  status: 'queued' | 'preparing' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
}

interface ExecutionCreateResponse {
  accepted: boolean;
  executionId: string;
  processingJobId: string;
  status: 'queued';
}

interface StoredAgentTaskExecution {
  id: string;
  status: 'queued' | 'running' | 'changes-generated' | 'validated' | 'pr-opened' | 'completed' | 'failed' | 'cancelled';
  resultSummary: {
    validationStatus?: 'not-run' | 'passed' | 'failed';
  };
}

interface StoredArtifact {
  id: string;
  artifactType: string;
}

interface StoredReplayValidation {
  agentTaskExecutionId: string;
  status: 'passed' | 'failed';
  expectation: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  baselineStatus?: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  actualStatus?: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  targetOrigin?: string;
}

interface HealthResponse {
  status: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseServiceTokens(rawValue: string | undefined): ServiceToken[] {
  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as ServiceToken[];
}

function chooseServiceToken(tokens: ServiceToken[]): ServiceToken {
  const requiredScopes = ['internal:read'];
  const match = tokens.find((token) => requiredScopes.every((scope) => token.scopes.includes(scope)));

  assert(match, `No INTERNAL_SERVICE_TOKENS entry contains required scopes: ${requiredScopes.join(', ')}`);
  return match;
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4000';
}

function buildHarBase64(baseUrl: string): string {
  const harDocument = {
    log: {
      version: '1.2',
      creator: { name: 'nexus-agent-routes-e2e', version: '1.0' },
      pages: [{ id: 'page_1', title: 'Checkout', startedDateTime: new Date().toISOString() }],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/health?token=super-secret-token`,
            headers: [
              { name: 'authorization', value: 'Bearer demo-token-value-1234567890' },
              { name: 'cookie', value: 'sessionId=abc123; cartId=cart-456' }
            ]
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 64, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'POST',
            url: `${baseUrl}/not-found`,
            headers: [
              { name: 'content-type', value: 'application/json' },
              { name: 'x-csrf-token', value: 'csrf-secret-value' }
            ],
            postData: { text: JSON.stringify({ cartId: 'cart-456', orderId: 'order-789' }) }
          },
          response: {
            status: 404,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 32, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: 'https://example.com/analytics.js',
            headers: []
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/javascript' }],
            content: { mimeType: 'application/javascript', size: 12, text: 'void 0' }
          }
        }
      ]
    }
  };

  return Buffer.from(JSON.stringify(harDocument)).toString('base64');
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

async function pollJson<T>(url: string, init: RequestInit | undefined, predicate: (value: T) => boolean, attempts = 90, delayMs = 1000): Promise<T> {
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
  const config = loadConfig();
  const baseUrl = getBaseUrl();
  const serviceToken = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const authHeaders = { Authorization: `Bearer ${serviceToken.token}` };
  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const targetRepository = process.env.E2E_AGENT_TARGET_REPOSITORY
    ?? createGitHubIntegration(config).repository;
  const extensionResponse = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/extension/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': config.WEBHOOK_SHARED_SECRET
    },
    body: JSON.stringify({
      sessionId: `e2e_agent_routes_${Date.now()}`,
      title: 'Committed E2E agent execution route report',
      description: 'Committed validation for agent execution artifact and replay-validation routes.',
      environment: 'staging',
      pageUrl: 'https://staging.example.test/checkout',
      reporter: { id: 'qa-agent-routes', role: 'qa' },
      severity: 'high',
      signals: { consoleErrorCount: 1, networkErrorCount: 1, stakeholderCount: 2 },
      artifacts: {
        hasScreenRecording: false,
        hasHar: true,
        hasLocalStorageSnapshot: true,
        hasSessionStorageSnapshot: true,
        uploads: {
          har: {
            fileName: 'checkout.har',
            mimeType: 'application/json',
            contentBase64: buildHarBase64(baseUrl)
          },
          localStorage: {
            fileName: 'local-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ cartId: 'cart-456', userId: 'user-123' })).toString('base64')
          },
          sessionStorage: {
            fileName: 'session-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ currentOrderId: 'order-789', refreshToken: 'refresh-secret' })).toString('base64')
          }
        }
      },
      notes: 'Committed E2E agent execution route verification'
    })
  });

  const replay = await pollJson<ReplayResponse>(
    `${baseUrl}/internal/reports/${extensionResponse.reportId}/replay`,
    { headers: authHeaders },
    (value) => value.status === 'completed'
  );
  assert(replay.replayPlan?.execution?.status === 'reproduced', 'Replay did not reproduce the expected failing step');

  const createdTask = await requestJson<AgentTaskResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: extensionResponse.reportId,
      targetRepository,
      title: 'Verify execution artifact and replay routes',
      objective: 'Create a minimal change and persist replay validation data for route verification.',
      executionMode: 'fix',
      acceptanceCriteria: [
        'Execution persists execution artifacts.',
        'Execution persists replay validation comparison record.'
      ],
      contextNotes: 'E2E validation task for execution-scoped inspection routes.'
    })
  });

  const task = await pollJson<StoredAgentTask>(
    `${baseUrl}/internal/agent-tasks/${createdTask.agentTaskId}`,
    { headers: authHeaders },
    (value) => value.status === 'ready'
  );
  assert(task.status === 'ready', `Agent task did not become ready: ${task.status}`);

  const createdExecution = await requestJson<ExecutionCreateResponse>(
    `${baseUrl}/internal/agent-tasks/${createdTask.agentTaskId}/execute`,
    {
      method: 'POST',
      headers: authHeaders
    }
  );

  const execution = await pollJson<StoredAgentTaskExecution>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}`,
    { headers: authHeaders },
    (value) => !['queued', 'running'].includes(value.status)
  );

  assert(execution.status === 'changes-generated', `Expected execution status changes-generated, received ${execution.status}`);
  assert(execution.resultSummary.validationStatus === 'failed', `Expected failed replay-backed validation, received ${execution.resultSummary.validationStatus}`);

  const artifacts = await requestJson<StoredArtifact[]>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/artifacts`,
    { headers: authHeaders }
  );
  const artifactTypes = artifacts.map((artifact) => artifact.artifactType).sort();

  for (const requiredArtifactType of ['agent-task-markdown', 'agent-context', 'agent-output', 'agent-diff', 'agent-replay-validation']) {
    assert(artifactTypes.includes(requiredArtifactType), `Execution artifacts did not include ${requiredArtifactType}`);
  }

  const replayValidation = await requestJson<StoredReplayValidation>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/replay-validation`,
    { headers: authHeaders }
  );

  assert(replayValidation.agentTaskExecutionId === createdExecution.executionId, 'Replay validation record returned the wrong execution id');
  assert(replayValidation.status === 'failed', `Expected replay validation status failed, received ${replayValidation.status}`);
  assert(replayValidation.expectation === 'not-reproduced', `Expected replay validation expectation not-reproduced, received ${replayValidation.expectation}`);
  assert(replayValidation.baselineStatus === 'reproduced', `Expected replay baselineStatus reproduced, received ${replayValidation.baselineStatus}`);
  assert(replayValidation.actualStatus === 'reproduced', `Expected replay actualStatus reproduced, received ${replayValidation.actualStatus}`);
  assert(replayValidation.targetOrigin === baseUrl, `Expected replay targetOrigin ${baseUrl}, received ${replayValidation.targetOrigin}`);

  console.log(JSON.stringify({
    ok: true,
    reportId: extensionResponse.reportId,
    taskId: createdTask.agentTaskId,
    executionId: createdExecution.executionId,
    executionStatus: execution.status,
    validationStatus: execution.resultSummary.validationStatus,
    artifactTypes,
    replayValidation: {
      status: replayValidation.status,
      expectation: replayValidation.expectation,
      baselineStatus: replayValidation.baselineStatus,
      actualStatus: replayValidation.actualStatus,
      targetOrigin: replayValidation.targetOrigin
    }
  }, null, 2));
}

void main();