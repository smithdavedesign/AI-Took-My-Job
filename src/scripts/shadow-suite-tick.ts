import 'dotenv/config';

interface ServiceToken {
  id: string;
  token: string;
  scopes: string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://127.0.0.1:4000';
}

function parseServiceTokens(rawValue: string | undefined): ServiceToken[] {
  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as ServiceToken[];
}

function chooseServiceToken(tokens: ServiceToken[]): ServiceToken {
  const token = tokens.find((entry) => entry.scopes.includes('internal:read'));
  assert(token, 'No INTERNAL_SERVICE_TOKENS entry provides internal:read');
  return token;
}

async function main(): Promise<void> {
  const token = chooseServiceToken(parseServiceTokens(process.env.INTERNAL_SERVICE_TOKENS));
  const environment = process.env.SHADOW_SUITE_ENVIRONMENT;
  const limit = process.env.SHADOW_SUITE_LIMIT;

  const response = await fetch(`${getBaseUrl()}/internal/shadow-suites/run-due`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ...(environment ? { environment } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      triggeredBy: 'shadow-suite-tick'
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST /internal/shadow-suites/run-due failed: ${response.status} ${text}`);
  }

  console.log(text);
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});