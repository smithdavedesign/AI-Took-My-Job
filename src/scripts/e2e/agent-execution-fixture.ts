import { writeFile } from 'node:fs/promises';
import path from 'node:path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function main(): Promise<void> {
  const executionId = requireEnv('NEXUS_AGENT_EXECUTION_ID');
  const outputPath = requireEnv('NEXUS_AGENT_OUTPUT_FILE');
  const replayBaseUrl = process.env.E2E_AGENT_FIXTURE_BASE_URL
    ?? process.env.E2E_BASE_URL
    ?? 'http://127.0.0.1:4000';
  const proofPath = path.join(process.cwd(), 'nexus-proof.txt');

  await writeFile(proofPath, `execution ${executionId}\n`, 'utf8');
  await writeFile(outputPath, JSON.stringify({
    summary: 'Prepared replay validation verification change.',
    findings: ['Wrote nexus-proof.txt for execution route verification.'],
    replayValidation: {
      enabled: true,
      baseUrl: replayBaseUrl,
      expectation: 'not-reproduced'
    }
  }, null, 2), 'utf8');
}

void main();