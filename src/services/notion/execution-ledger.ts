import type { AppConfig } from '../../support/config.js';

interface NotionPageSearchResponse {
  results?: Array<{ id: string }>;
}

interface NotionExecutionTimelineEntry {
  stage: string;
  at: string;
  note?: string;
}

interface NotionCreateOrUpdatePayload {
  executionId: string;
  taskId: string;
  repository: string;
  branchName?: string;
  baseBranch?: string;
  source?: string;
  trigger?: string;
  skillName?: string;
  objective?: string;
  status: string;
  summary?: string;
  outcome?: string;
  outcomeDelta?: number;
  pullRequestUrl?: string;
  retries?: number;
  terminalState?: string;
  correlationId?: string;
  modelTier?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  durationMs?: number;
  chainDepth?: number;
  executionTimeline?: NotionExecutionTimelineEntry[];
  escalationReason?: string;
}

function notionHeaders(config: AppConfig): Record<string, string> {
  return {
    'Authorization': `Bearer ${config.NOTION_INTEGRATION_KEY}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };
}

function isConfigured(config: AppConfig): boolean {
  return Boolean(config.NOTION_INTEGRATION_KEY && config.NOTION_EXECUTION_DATABASE_ID);
}

async function findExecutionPageId(config: AppConfig, executionId: string): Promise<string | null> {
  if (!isConfigured(config)) return null;

  const response = await fetch(`https://api.notion.com/v1/databases/${config.NOTION_EXECUTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(config),
    body: JSON.stringify({
      filter: {
        property: 'Execution ID',
        rich_text: {
          equals: executionId
        }
      },
      page_size: 1
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion query failed: ${response.status} ${text}`);
  }

  const data = await response.json() as NotionPageSearchResponse;
  return data.results?.[0]?.id ?? null;
}

export function buildNotionExecutionProperties(payload: NotionCreateOrUpdatePayload): Record<string, unknown> {
  const totalTokens = payload.totalTokens ?? (
    typeof payload.promptTokens === 'number' || typeof payload.completionTokens === 'number'
      ? (payload.promptTokens ?? 0) + (payload.completionTokens ?? 0)
      : undefined
  );
  const executionTimelineText = (payload.executionTimeline ?? [])
    .map((entry) => `${entry.stage}${entry.note ? `:${entry.note}` : ''}@${entry.at}`)
    .join(' | ');

  return {
    Name: {
      title: [{ text: { content: `${payload.repository} • ${payload.executionId.slice(0, 8)}` } }]
    },
    'Execution ID': {
      rich_text: [{ text: { content: payload.executionId } }]
    },
    'Task ID': {
      rich_text: [{ text: { content: payload.taskId } }]
    },
    Repository: {
      rich_text: [{ text: { content: payload.repository } }]
    },
    Status: {
      rich_text: [{ text: { content: payload.status } }]
    },
    'Terminal State': {
      rich_text: [{ text: { content: payload.terminalState ?? payload.status } }]
    },
    Branch: {
      rich_text: [{ text: { content: payload.branchName ?? '' } }]
    },
    'Base Branch': {
      rich_text: [{ text: { content: payload.baseBranch ?? '' } }]
    },
    Source: {
      rich_text: [{ text: { content: payload.source ?? '' } }]
    },
    Trigger: {
      rich_text: [{ text: { content: payload.trigger ?? payload.source ?? '' } }]
    },
    Skill: {
      rich_text: [{ text: { content: payload.skillName ?? '' } }]
    },
    Objective: {
      rich_text: [{ text: { content: payload.objective ?? '' } }]
    },
    Summary: {
      rich_text: [{ text: { content: payload.summary ?? '' } }]
    },
    Outcome: {
      rich_text: [{ text: { content: payload.outcome ?? '' } }]
    },
    'Outcome Delta': {
      number: payload.outcomeDelta ?? null
    },
    'Correlation ID': {
      rich_text: [{ text: { content: payload.correlationId ?? '' } }]
    },
    'Model Tier': {
      rich_text: [{ text: { content: payload.modelTier ?? '' } }]
    },
    'Token Usage': {
      rich_text: [{ text: { content: typeof totalTokens === 'number'
        ? `${totalTokens} total (${payload.promptTokens ?? 0} in / ${payload.completionTokens ?? 0} out)`
        : '' } }]
    },
    'Cost (USD)': {
      number: payload.costUsd ?? null
    },
    'Duration (ms)': {
      number: payload.durationMs ?? null
    },
    'Chain Depth': {
      number: payload.chainDepth ?? null
    },
    'Execution Timeline': {
      rich_text: [{ text: { content: executionTimelineText } }]
    },
    'Escalation Reason': {
      rich_text: [{ text: { content: payload.escalationReason ?? '' } }]
    },
    'PR URL': {
      url: payload.pullRequestUrl ?? null
    },
    Retries: {
      number: payload.retries ?? 0
    }
  };
}

export async function upsertNotionExecutionLedger(config: AppConfig, payload: NotionCreateOrUpdatePayload): Promise<void> {
  if (!isConfigured(config)) {
    return;
  }

  try {
    const existingPageId = await findExecutionPageId(config, payload.executionId);
    const properties = buildNotionExecutionProperties(payload);

    if (existingPageId) {
      const updateResponse = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
        method: 'PATCH',
        headers: notionHeaders(config),
        body: JSON.stringify({ properties })
      });

      if (!updateResponse.ok) {
        const text = await updateResponse.text();
        throw new Error(`Notion update failed: ${updateResponse.status} ${text}`);
      }
      return;
    }

    const createResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(config),
      body: JSON.stringify({
        parent: { database_id: config.NOTION_EXECUTION_DATABASE_ID },
        properties
      })
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      throw new Error(`Notion create failed: ${createResponse.status} ${text}`);
    }
  } catch (error) {
    console.warn('[notion-ledger] upsert failed:', error instanceof Error ? error.message : error);
  }
}
