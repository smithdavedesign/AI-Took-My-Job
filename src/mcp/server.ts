import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

type PreviewableArtifactType =
  | 'console-logs'
  | 'local-storage'
  | 'session-storage'
  | 'har'
  | 'agent-task-markdown'
  | 'agent-context'
  | 'agent-output'
  | 'agent-validation'
  | 'agent-replay-validation'
  | 'agent-validation-policy';

interface ContextArtifact {
  id?: string;
  artifactType?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function parseServiceTokens(rawValue: string | undefined): ServiceToken[] {
  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as ServiceToken[];
}

function chooseServiceToken(): string {
  if (process.env.NEXUS_MCP_TOKEN) {
    return process.env.NEXUS_MCP_TOKEN;
  }

  const tokens = parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS);
  const match = tokens.find((token) => token.scopes.includes('internal:read'));
  if (!match) {
    throw new Error('No internal service token is available for the MCP server');
  }

  return match.token;
}

function getBaseUrl(): string {
  return process.env.NEXUS_MCP_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:4000';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${chooseServiceToken()}`,
      ...(init?.headers ?? {})
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
}

async function requestText(target: string, init?: RequestInit): Promise<string> {
  const response = await fetch(target, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${target} failed: ${response.status} ${text}`);
  }

  return text;
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  return `${normalizeBaseUrl(getBaseUrl())}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

function isPreviewableArtifactType(value: unknown): value is PreviewableArtifactType {
  return [
    'console-logs',
    'local-storage',
    'session-storage',
    'har',
    'agent-task-markdown',
    'agent-context',
    'agent-output',
    'agent-validation',
    'agent-replay-validation',
    'agent-validation-policy'
  ].includes(String(value));
}

function truncateText(text: string, maxCharacters: number): string {
  return text.length > maxCharacters
    ? `${text.slice(0, maxCharacters)}\n...[truncated]`
    : text;
}

function summarizeJsonArtifact(artifactType: PreviewableArtifactType, value: unknown): Record<string, unknown> {
  if (artifactType === 'console-logs' && Array.isArray(value)) {
    return {
      kind: 'console-log-summary',
      entryCount: value.length,
      levels: Array.from(new Set(value.map((entry) => typeof entry === 'object' && entry !== null ? String((entry as Record<string, unknown>).level ?? 'unknown') : 'unknown'))),
      sample: value.slice(0, 5)
    };
  }

  if ((artifactType === 'local-storage' || artifactType === 'session-storage') && value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      kind: `${artifactType}-summary`,
      keyCount: keys.length,
      keys,
      sample: Object.fromEntries(keys.slice(0, 10).map((key) => [key, (value as Record<string, unknown>)[key]]))
    };
  }

  if (artifactType === 'har' && value && typeof value === 'object') {
    const log = (value as Record<string, unknown>).log;
    const entries = log && typeof log === 'object' ? (log as Record<string, unknown>).entries : undefined;
    const pages = log && typeof log === 'object' ? (log as Record<string, unknown>).pages : undefined;
    if (Array.isArray(entries)) {
      return {
        kind: 'har-summary',
        pageCount: Array.isArray(pages) ? pages.length : 0,
        entryCount: entries.length,
        sampleRequests: entries.slice(0, 5).map((entry) => {
          const request = entry && typeof entry === 'object' ? (entry as Record<string, unknown>).request : undefined;
          return request && typeof request === 'object'
            ? {
              method: (request as Record<string, unknown>).method ?? null,
              url: (request as Record<string, unknown>).url ?? null
            }
            : { method: null, url: null };
        })
      };
    }
  }

  return {
    kind: 'json-preview',
    value
  };
}

async function buildArtifactPreview(artifact: ContextArtifact, maxCharacters: number): Promise<Record<string, unknown> | null> {
  if (typeof artifact.id !== 'string' || !isPreviewableArtifactType(artifact.artifactType)) {
    return null;
  }

  try {
    const download = await requestJson<{ downloadPath?: string }>(`/internal/artifacts/${artifact.id}/download-url`);
    if (typeof download.downloadPath !== 'string') {
      return null;
    }

    const raw = await requestText(buildAbsoluteUrl(download.downloadPath));
    if (artifact.artifactType === 'agent-task-markdown' || artifact.artifactType === 'agent-validation') {
      return {
        kind: 'text-preview',
        text: truncateText(raw, maxCharacters)
      };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return summarizeJsonArtifact(artifact.artifactType, parsed);
    } catch {
      return {
        kind: 'text-preview',
        text: truncateText(raw, maxCharacters)
      };
    }
  } catch (error) {
    return {
      kind: 'preview-error',
      error: error instanceof Error ? error.message : 'unknown preview error'
    };
  }
}

async function buildIssueContext(input: {
  reportId: string;
  includeDownloadUrls: boolean;
  includeInlinePreviews: boolean;
  previewCharacters: number;
}): Promise<Record<string, unknown>> {
  const context = await requestJson<Record<string, unknown>>(`/internal/reports/${input.reportId}/context`);

  const artifacts = Array.isArray(context.artifacts) ? context.artifacts as Array<Record<string, unknown>> : [];
  const enhancedArtifacts = await Promise.all(artifacts.map(async (artifact) => {
    let nextArtifact: Record<string, unknown> = artifact;

    if (input.includeDownloadUrls && typeof artifact.id === 'string') {
      try {
        const download = await requestJson<Record<string, unknown>>(`/internal/artifacts/${artifact.id}/download-url`);
        nextArtifact = {
          ...nextArtifact,
          download
        };
      } catch {
        nextArtifact = artifact;
      }
    }

    if (input.includeInlinePreviews) {
      const preview = await buildArtifactPreview(artifact, input.previewCharacters);
      if (preview) {
        nextArtifact = {
          ...nextArtifact,
          preview
        };
      }
    }

    return nextArtifact;
  }));

  return {
    ...context,
    artifacts: enhancedArtifacts
  };
}

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'nexus-mcp',
    version: '0.1.0'
  });

  server.registerTool('nexus_active_issues', {
    title: 'Nexus Active Issues',
    description: 'List active Nexus issues filtered by owning service and/or file path heuristics.',
    inputSchema: {
      service: z.string().optional().describe('Owning team or service label to filter by.'),
      file: z.string().optional().describe('File path substring to search for in report and draft context.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum number of issues to return.')
    }
  }, async ({ service, file, limit }) => {
    const params = new URLSearchParams();
    if (service) {
      params.set('service', service);
    }
    if (file) {
      params.set('file', file);
    }
    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }

    const path = params.size > 0
      ? `/internal/reports/active-issues?${params.toString()}`
      : '/internal/reports/active-issues';
    const response = await requestJson<{ items?: Array<Record<string, unknown>> }>(path);
    return textResult({
      ...response,
      matchedIssueCount: Array.isArray(response.items) ? response.items.length : 0
    });
  });

  server.registerTool('nexus_issue_context', {
    title: 'Nexus Issue Context',
    description: 'Return the aggregated Nexus issue context for a report, including artifacts, ownership, impact, history, and replay.',
    inputSchema: {
      reportId: z.string().uuid().describe('Nexus report id.'),
      includeDownloadUrls: z.boolean().optional().describe('Whether to attempt to include signed artifact download metadata.'),
      includeInlinePreviews: z.boolean().optional().describe('Whether to inline previewable artifact summaries such as console logs and storage snapshots.'),
      previewCharacters: z.number().int().min(200).max(20000).optional().describe('Maximum characters for text previews when inline previews are enabled.')
    }
  }, async ({ reportId, includeDownloadUrls, includeInlinePreviews, previewCharacters }) => {
    return textResult(await buildIssueContext({
      reportId,
      includeDownloadUrls: includeDownloadUrls ?? false,
      includeInlinePreviews: includeInlinePreviews ?? true,
      previewCharacters: previewCharacters ?? 4000
    }));
  });

  server.registerTool('nexus_reproduction_status', {
    title: 'Nexus Reproduction Status',
    description: 'Return the latest replay-backed reproduction status and recent agent execution summaries for a report.',
    inputSchema: {
      reportId: z.string().uuid().describe('Nexus report id.')
    }
  }, async ({ reportId }) => {
    const context = await requestJson<Record<string, unknown>>(`/internal/reports/${reportId}/context`);
    return textResult({
      reportId,
      replay: context.replay ?? null,
      agentTasks: context.agentTasks ?? []
    });
  });

  server.registerTool('nexus_observability_context', {
    title: 'Nexus Observability Context',
    description: 'Return the linked observability context that was normalized into a Nexus report.',
    inputSchema: {
      reportId: z.string().uuid().describe('Nexus report id.')
    }
  }, async ({ reportId }) => {
    const context = await requestJson<Record<string, unknown>>(`/internal/reports/${reportId}/context`);
    return textResult({
      reportId,
      report: context.report ?? null,
      observabilityContext: context.observabilityContext ?? null,
      classification: context.classification ?? null,
      impact: context.impact ?? null
    });
  });

  server.registerTool('nexus_engineering_summary', {
    title: 'Nexus Engineering Summary',
    description: 'Return a compact ownership, clustering, and reproduction summary for an issue so developers can triage from the editor quickly.',
    inputSchema: {
      reportId: z.string().uuid().describe('Nexus report id.')
    }
  }, async ({ reportId }) => {
    const summary = await requestJson<Record<string, unknown>>(`/internal/reports/${reportId}/developer-summary`);
    return textResult(summary);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();