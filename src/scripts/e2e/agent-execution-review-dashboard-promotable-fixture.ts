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
  const proofPath = path.join(process.cwd(), 'nexus-review-dashboard-promotable-proof.txt');

  await writeFile(proofPath, `review dashboard promotable execution ${executionId}\n`, 'utf8');
  await writeFile(outputPath, JSON.stringify({
    contractVersion: 'nexus-agent-output-v1',
    summary: 'Prepared a promotable change for the review dashboard GitHub sync validation.',
    findings: ['Wrote nexus-review-dashboard-promotable-proof.txt for the dashboard promotion flow.'],
    outcome: 'changes-made',
    changedFiles: ['nexus-review-dashboard-promotable-proof.txt']
  }, null, 2), 'utf8');
}

void main();