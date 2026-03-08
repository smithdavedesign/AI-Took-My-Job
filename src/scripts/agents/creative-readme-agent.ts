import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function replaceSectionHeading(content: string, currentHeading: string, nextHeading: string): string {
  return content.includes(currentHeading)
    ? content.replace(currentHeading, nextHeading)
    : content;
}

async function main(): Promise<void> {
  const outputPath = requireEnv('NEXUS_AGENT_OUTPUT_FILE');
  const promptPath = requireEnv('NEXUS_AGENT_PROMPT_FILE');
  const worktreePath = process.env.NEXUS_AGENT_WORKTREE_PATH ?? process.cwd();
  const readmePath = path.join(worktreePath, 'README.md');
  const prompt = await readFile(promptPath, 'utf8');
  const original = await readFile(readmePath, 'utf8');

  if (!/README/i.test(prompt)) {
    throw new Error('creative-readme-agent only supports README-focused tasks');
  }

  const introPattern = /^# AI-DevOps Nexus\n\n[\s\S]*?\n## (Current Scope|What Exists Today)\n/m;
  if (!introPattern.test(original)) {
    throw new Error('README intro block not found');
  }

  let updated = original.replace(
    introPattern,
    [
      '# AI-DevOps Nexus',
      '',
      'AI-DevOps Nexus turns messy internal engineering signal into something a team can actually ship against.',
      '',
      'It is a self-hostable incident-intelligence layer for teams that need more than alert spam, screenshots, and hand-written bug tickets. Nexus captures browser and observability evidence, stores a canonical report, replays the failure path, drafts the issue, and prepares an agent-ready execution bundle.',
      '',
      'The goal is simple: stop losing context between the moment something breaks and the moment someone is finally ready to fix it.',
      '',
      '## Why This Exists',
      '',
      'Most teams already have the raw ingredients for fast debugging. They just do not have a reliable handoff.',
      '',
      'A report arrives from a browser session. Sentry lights up. A HAR file gets attached somewhere. A draft issue appears later with half the evidence missing. Nexus is designed to keep the report, artifacts, replay evidence, draft output, and agent handoff connected as one system instead of five disconnected tools.',
      '',
      '## What Exists Today',
      ''
    ].join('\n')
  );

  const scopeBullet = '- Agent-task intake, isolated execution worktrees, persisted execution artifacts, and replay-backed validation routes.';
  if (!updated.includes(scopeBullet)) {
    updated = updated.replace(
      '- Optional GitHub sync using either a PAT-backed service account or a GitHub App.\n',
      `- Optional GitHub sync using either a PAT-backed service account or a GitHub App.\n${scopeBullet}\n`
    );
  }

  updated = replaceSectionHeading(updated, '## Architecture', '## How It Works');

  await writeFile(readmePath, updated, 'utf8');
  await writeFile(outputPath, JSON.stringify({
    summary: 'Reframed the README with a stronger product narrative while keeping the technical sections intact.',
    findings: [
      'Rewrote the opening README narrative.',
      'Added a Why This Exists section.',
      'Included the live agent-task execution capabilities in the scope summary.',
      'Renamed Architecture to How It Works for a stronger product framing.'
    ],
    validationCommand: 'npm run check'
  }, null, 2), 'utf8');
}

void main();