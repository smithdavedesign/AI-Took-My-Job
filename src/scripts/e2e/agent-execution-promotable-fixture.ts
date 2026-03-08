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
  const proofPath = path.join(process.cwd(), 'nexus-promotable-proof.txt');

  await writeFile(proofPath, `promotable execution ${executionId}\n`, 'utf8');
  await writeFile(outputPath, JSON.stringify({
    summary: 'Prepared a promotable change for PR audit and merge validation.',
    findings: ['Wrote nexus-promotable-proof.txt for the promotion and merge flow.']
  }, null, 2), 'utf8');
}

void main();