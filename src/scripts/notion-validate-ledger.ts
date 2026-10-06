import 'dotenv/config';

type NotionProperty = {
  type?: string;
};

type NotionDatabaseResponse = {
  title?: Array<{ plain_text?: string }>;
  properties?: Record<string, NotionProperty>;
};

const REQUIRED_PROPERTIES: Array<{ name: string; type: string }> = [
  { name: 'Name', type: 'title' },
  { name: 'Execution ID', type: 'rich_text' },
  { name: 'Task ID', type: 'rich_text' },
  { name: 'Repository', type: 'rich_text' },
  { name: 'Status', type: 'rich_text' },
  { name: 'Terminal State', type: 'rich_text' },
  { name: 'Branch', type: 'rich_text' },
  { name: 'Base Branch', type: 'rich_text' },
  { name: 'Source', type: 'rich_text' },
  { name: 'Trigger', type: 'rich_text' },
  { name: 'Skill', type: 'rich_text' },
  { name: 'Objective', type: 'rich_text' },
  { name: 'Summary', type: 'rich_text' },
  { name: 'Outcome', type: 'rich_text' },
  { name: 'Outcome Delta', type: 'number' },
  { name: 'PR URL', type: 'url' },
  { name: 'Retries', type: 'number' }
];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeDatabaseId(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const last = trimmed.split('/').filter(Boolean).pop() ?? '';
    const idPart = last.split('?')[0] ?? '';
    return idPart;
  }
  return trimmed;
}

async function notionFetch(url: string, token: string, method = 'GET', body?: unknown): Promise<Response> {
  const payload = body ? { body: JSON.stringify(body) } : {};

  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    ...payload
  });
}

async function main(): Promise<void> {
  const token = requiredEnv('NOTION_INTEGRATION_KEY');
  const databaseId = normalizeDatabaseId(requiredEnv('NOTION_EXECUTION_DATABASE_ID'));

  const dbResponse = await notionFetch(`https://api.notion.com/v1/databases/${databaseId}`, token);
  if (!dbResponse.ok) {
    const text = await dbResponse.text();
    throw new Error(`Failed to fetch database metadata: ${dbResponse.status} ${text}`);
  }

  const db = (await dbResponse.json()) as NotionDatabaseResponse;
  const properties = db.properties ?? {};
  const dbName = db.title?.map((t) => t.plain_text ?? '').join('').trim() || '(untitled)';

  const missing: string[] = [];
  const wrongType: Array<{ name: string; expected: string; actual: string }> = [];

  for (const requirement of REQUIRED_PROPERTIES) {
    const found = properties[requirement.name];
    if (!found) {
      missing.push(requirement.name);
      continue;
    }

    if (found.type !== requirement.type) {
      wrongType.push({
        name: requirement.name,
        expected: requirement.type,
        actual: found.type ?? 'unknown'
      });
    }
  }

  const queryResponse = await notionFetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    token,
    'POST',
    { page_size: 1 }
  );

  if (!queryResponse.ok) {
    const text = await queryResponse.text();
    throw new Error(`Failed to query database: ${queryResponse.status} ${text}`);
  }

  console.log(`Connected to Notion database: ${dbName}`);
  console.log(`Database ID: ${databaseId}`);

  if (missing.length === 0 && wrongType.length === 0) {
    console.log('Schema check passed: all required ledger properties are present with expected types.');
    return;
  }

  console.log('Schema check found issues.');

  if (missing.length > 0) {
    console.log('Missing properties:');
    for (const name of missing) {
      console.log(`- ${name}`);
    }
  }

  if (wrongType.length > 0) {
    console.log('Type mismatches:');
    for (const mismatch of wrongType) {
      console.log(`- ${mismatch.name}: expected ${mismatch.expected}, got ${mismatch.actual}`);
    }
  }

  process.exitCode = 2;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
