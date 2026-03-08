import 'dotenv/config';

interface HealthResponse {
  status: string;
}

interface ExtensionWebhookResponse {
  reportId: string;
}

interface ReplayResponse {
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

interface StoredArtifact {
  artifactType: string;
}

interface StoredEmbedding {
  model: string;
  dimensions: number;
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
  validationEvidence?: Record<string, unknown>;
}

interface ExecutionCloseout {
  closeoutStatus: string;
  promotable: boolean;
  blockers: string[];
  gates: {
    review?: {
      status: string;
    };
    validation?: {
      status: string;
    };
  };
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

function buildHarBase64(baseUrl: string): string {
  const harDocument = {
    log: {
      version: '1.2',
      creator: { name: 'nexus-policy-review', version: '1.0' },
      pages: [{ id: 'page_1', title: 'Checkout', startedDateTime: new Date().toISOString() }],
      entries: [
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'GET',
            url: `${baseUrl}/health?token=super-secret-token`,
            headers: [{ name: 'authorization', value: 'Bearer demo-token-value-1234567890' }]
          },
          response: {
            status: 200,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 2, text: '{}' }
          }
        },
        {
          pageref: 'page_1',
          startedDateTime: new Date().toISOString(),
          request: {
            method: 'POST',
            url: `${baseUrl}/not-found`,
            headers: [{ name: 'content-type', value: 'application/json' }],
            postData: { text: JSON.stringify({ cartId: 'cart-456' }) }
          },
          response: {
            status: 404,
            headers: [{ name: 'content-type', value: 'application/json' }],
            content: { mimeType: 'application/json', size: 2, text: '{}' }
          }
        }
      ]
    }
  };

  return Buffer.from(JSON.stringify(harDocument)).toString('base64');
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = getToken();
  const authHeaders = { Authorization: `Bearer ${token}` };
  const health = await requestJson<HealthResponse>(`${baseUrl}/health`);
  assert(health.status === 'ok', 'Health endpoint did not return ok');

  const report = await requestJson<ExtensionWebhookResponse>(`${baseUrl}/webhooks/extension/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexus-shared-secret': getSharedSecret()
    },
    body: JSON.stringify({
      sessionId: `policy_review_${Date.now()}`,
      title: 'Policy review validation report',
      pageUrl: 'https://staging.example.test/checkout',
      environment: 'staging',
      reporter: { id: 'qa-policy', role: 'qa' },
      severity: 'high',
      signals: { consoleErrorCount: 2, networkErrorCount: 1, stakeholderCount: 2 },
      artifacts: {
        hasHar: true,
        hasConsoleLogs: true,
        hasLocalStorageSnapshot: true,
        hasSessionStorageSnapshot: true,
        uploads: {
          har: {
            fileName: 'checkout.har',
            mimeType: 'application/json',
            contentBase64: buildHarBase64(baseUrl)
          },
          consoleLogs: {
            fileName: 'console-logs.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify([{ level: 'error', message: 'checkout failed' }])).toString('base64')
          },
          localStorage: {
            fileName: 'local-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ cartId: 'cart-456' })).toString('base64')
          },
          sessionStorage: {
            fileName: 'session-storage.json',
            mimeType: 'application/json',
            contentBase64: Buffer.from(JSON.stringify({ currentOrderId: 'order-789' })).toString('base64')
          }
        }
      },
      notes: 'policy + review + console logs live test'
    })
  });

  const artifacts = await pollJson<StoredArtifact[]>(
    `${baseUrl}/internal/reports/${report.reportId}/artifacts`,
    { headers: authHeaders },
    (value) => Array.isArray(value) && value.some((artifact) => artifact.artifactType === 'console-logs')
  );
  assert(artifacts.some((artifact) => artifact.artifactType === 'console-logs'), 'console-logs artifact not stored');

  const embedding = await requestJson<StoredEmbedding>(
    `${baseUrl}/internal/reports/${report.reportId}/embedding`,
    { headers: authHeaders }
  );
  assert(embedding.model === 'deterministic-hash-v1', 'report embedding model was not persisted');
  assert(embedding.dimensions === 1536, 'report embedding dimensions were not persisted');

  const replay = await pollJson<ReplayResponse>(
    `${baseUrl}/internal/reports/${report.reportId}/replay`,
    { headers: authHeaders },
    (value) => value.status === 'completed'
  );
  assert(replay.status === 'completed', 'Replay did not complete');

  const task = await requestJson<AgentTaskResponse>(`${baseUrl}/internal/agent-tasks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders
    },
    body: JSON.stringify({
      reportId: report.reportId,
      targetRepository: 'smithdavedesign/testRepo',
      title: 'Validate new policy and review routes',
      objective: 'Create a minimal change and persist validation policy plus review state.',
      executionMode: 'fix',
      acceptanceCriteria: ['Validation policy is persisted.', 'Review state can be approved.']
    })
  });

  const storedTask = await pollJson<StoredAgentTask>(
    `${baseUrl}/internal/agent-tasks/${task.agentTaskId}`,
    { headers: authHeaders },
    (value) => value.status === 'ready'
  );
  assert(storedTask.status === 'ready', 'Task did not become ready');

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
      reason: 'worker is running without AGENT_EXECUTION_COMMAND, so no validation policy or reviewable code changes were generated',
      reportId: report.reportId,
      executionId: createdExecution.executionId,
      executionStatus: execution.status,
      nextAction: execution.resultSummary?.nextAction ?? null
    }, null, 2));
    return;
  }

  await requestExpectingStatus(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/promote`,
    409,
    { method: 'POST', headers: authHeaders }
  );

  const policy = await pollJson<{ status: string; policyName: string }>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/validation-policy`,
    { headers: authHeaders },
    (value) => ['passed', 'failed'].includes(value.status)
  );
  const closeoutBefore = await requestJson<ExecutionCloseout>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`,
    { headers: authHeaders }
  );
  const reviewBefore = await requestJson<{ status: string }>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/review`,
    { headers: authHeaders }
  );
  const reviewAfter = await requestJson<{ status: string }>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/review`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        status: 'approved',
        notes: 'Human review approved this execution for follow-up.'
      })
    }
  );
  const closeoutAfter = await pollJson<ExecutionCloseout>(
    `${baseUrl}/internal/agent-task-executions/${createdExecution.executionId}/closeout`,
    { headers: authHeaders },
    (value) => value.gates.review?.status === 'approved'
  );

  assert(closeoutBefore.promotable === false, 'Execution should not be promotable before approval');
  assert(closeoutBefore.blockers.some((blocker) => blocker.includes('approval')), 'Closeout blockers did not mention approval before review');
  assert(closeoutAfter.promotable === false, 'Execution with failed validation should remain non-promotable after approval');
  assert(closeoutAfter.gates.review?.status === 'approved', `Expected approved review gate, received ${closeoutAfter.gates.review?.status}`);
  assert(closeoutAfter.gates.validation?.status === 'failed', `Expected failed validation gate, received ${closeoutAfter.gates.validation?.status}`);
  assert(closeoutAfter.closeoutStatus === 'blocked', `Unexpected closeout status after approval: ${closeoutAfter.closeoutStatus}`);
  assert(closeoutAfter.blockers.some((blocker) => blocker.includes('validations failed')), 'Closeout blockers did not mention failed validation after approval');

  console.log(JSON.stringify({
    ok: true,
    reportId: report.reportId,
    consoleLogCaptured: true,
    embeddingModel: embedding.model,
    executionId: createdExecution.executionId,
    executionStatus: execution.status,
    policyStatus: policy.status,
    policyName: policy.policyName,
    closeoutBefore: closeoutBefore.closeoutStatus,
    closeoutAfter: closeoutAfter.closeoutStatus,
    reviewBefore: reviewBefore.status,
    reviewAfter: reviewAfter.status
  }, null, 2));
}

void main();