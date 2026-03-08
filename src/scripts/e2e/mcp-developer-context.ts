import 'dotenv/config';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ActiveIssuesResponse {
  items?: Array<{
    reportId?: string;
  }>;
}

interface ToolTextContent {
  type: 'text';
  text: string;
}

function extractTextContent(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return '';
  }

  const textEntry = content.find((entry): entry is ToolTextContent => {
    return Boolean(entry)
      && typeof entry === 'object'
      && 'type' in entry
      && 'text' in entry
      && (entry as { type?: unknown }).type === 'text'
      && typeof (entry as { text?: unknown }).text === 'string';
  });

  return textEntry?.text ?? '';
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed: ${response.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

async function main(): Promise<void> {
  const activeIssues = await requestJson<ActiveIssuesResponse>(`${getBaseUrl()}/internal/reports/active-issues?limit=1`, {
    headers: {
      Authorization: `Bearer ${getToken()}`
    }
  });

  const reportId = activeIssues.items?.[0]?.reportId;
  assert(reportId, 'No active issue available for MCP smoke');

  const client = new Client({
    name: 'nexus-e2e-mcp',
    version: '0.1.0'
  });
  const transport = new StdioClientTransport({
    command: 'npm',
    args: ['run', 'mcp:dev'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_BASE_URL: getBaseUrl(),
      NEXUS_MCP_BASE_URL: getBaseUrl(),
      NEXUS_MCP_TOKEN: getToken()
    },
    stderr: 'pipe'
  });

  await client.connect(transport);
  try {
    const summary = await client.callTool({
      name: 'nexus_engineering_summary',
      arguments: {
        reportId
      }
    });
    const reproduction = await client.callTool({
      name: 'nexus_reproduction_status',
      arguments: {
        reportId
      }
    });

    const summaryText = extractTextContent(summary);
    const reproductionText = extractTextContent(reproduction);
    assert(summaryText.includes('nextAction'), 'Engineering summary did not include nextAction');
    assert(reproductionText.includes('replay'), 'Reproduction status did not include replay details');

    console.log(JSON.stringify({
      reportId,
      summaryLength: summaryText.length,
      reproductionLength: reproductionText.length
    }, null, 2));
  } finally {
    await transport.close();
  }
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});