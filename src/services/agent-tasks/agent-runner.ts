import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { z } from 'zod';

import type { AppConfig } from '../../support/config.js';
import type { StoredAgentTask } from '../../types/agent-tasks.js';

export const AGENT_OUTPUT_CONTRACT_VERSION = 'nexus-agent-output-v1';

const replayValidationSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
  expectation: z.enum(['reproduced', 'not-reproduced', 'partial', 'execution-failed']).default('not-reproduced')
});

const agentOutputSchema = z.object({
  contractVersion: z.literal(AGENT_OUTPUT_CONTRACT_VERSION).default(AGENT_OUTPUT_CONTRACT_VERSION),
  summary: z.string().min(1).max(10000).default('Agent command completed.'),
  findings: z.array(z.string().min(1).max(2000)).default([]),
  outcome: z.enum(['changes-made', 'no-changes', 'blocked']).default('no-changes'),
  changedFiles: z.array(z.string().min(1).max(500)).max(200).default([]),
  validationCommand: z.string().min(1).max(1000).optional(),
  replayValidation: replayValidationSchema.optional(),
  pullRequest: z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(30000),
    draft: z.boolean().optional()
  }).optional()
}).strict();

export type AgentCommandOutput = z.infer<typeof agentOutputSchema>;

export interface AgentRunResult {
  promptPath: string;
  contextPath: string;
  outputPath: string;
  stdout: string;
  stderr: string;
  output: AgentCommandOutput;
}

function buildPrompt(task: StoredAgentTask, executionId: string): string {
  return [
    '# Nexus Agent Task',
    '',
    `Execution ID: ${executionId}`,
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Objective: ${task.objective}`,
    `Execution mode: ${task.executionMode}`,
    '',
    '## Acceptance Criteria',
    ...(task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ['- No explicit acceptance criteria provided.']),
    '',
    '## Instructions',
    '- Read .nexus/context.json before making changes.',
    '- Make changes inside the current worktree only.',
    `- Write a JSON result file to .nexus/output.json using contractVersion \"${AGENT_OUTPUT_CONTRACT_VERSION}\".`,
    '- Always set outcome to one of: changes-made, no-changes, or blocked.',
    '- Always include changedFiles as repository-relative paths for files you intentionally modified.',
    '- Include a validation command in the output when you can verify the fix locally.',
    '- Include replayValidation in the output when you want Nexus to rerun the stored HAR against a target base URL.',
    '- If you prepare a PR, include title and body in the output payload.',
    ...(task.executionMode === 'fix' ? [
      '',
      '## Fix Mode Requirements',
      '- You MUST produce at least one file change. Reporting findings without writing code is not acceptable in fix mode.',
      '- If you cannot implement a complete fix, implement the most impactful partial change and document what remains.',
      '- Do not set outcome to no-changes unless the issue is already resolved in the current code.',
    ] : [
      '',
      '## Investigate Mode',
      '- Focus on findings and diagnosis. Code changes are optional but encouraged if a clear improvement is obvious.',
    ]),
    '',
    '## Output Contract',
    '```json',
    JSON.stringify({
      contractVersion: AGENT_OUTPUT_CONTRACT_VERSION,
      summary: 'Prepared a scoped fix.',
      findings: ['Updated the checkout retry path.'],
      outcome: 'changes-made',
      changedFiles: ['src/checkout/retry.ts'],
      validationCommand: 'npm run check',
      replayValidation: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:4000',
        expectation: 'not-reproduced'
      },
      pullRequest: {
        title: 'Fix checkout retry handling',
        body: 'Draft PR body',
        draft: true
      }
    }, null, 2),
    '```'
  ].join('\n');
}

async function runCommand(command: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (timedOut) {
        reject(new Error(`agent command timed out after ${options.timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`agent command failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runConfiguredAgent(input: {
  config: AppConfig;
  task: StoredAgentTask;
  executionId: string;
  worktreePath: string;
}): Promise<AgentRunResult> {
  const nexusDir = path.join(input.worktreePath, '.nexus');
  const promptPath = path.join(nexusDir, 'task.md');
  const contextPath = path.join(nexusDir, 'context.json');
  const outputPath = path.join(nexusDir, 'output.json');

  await mkdir(nexusDir, { recursive: true });
  await writeFile(promptPath, buildPrompt(input.task, input.executionId), 'utf8');
  await writeFile(contextPath, JSON.stringify(input.task.preparedContext, null, 2), 'utf8');

  if (!input.config.AGENT_EXECUTION_COMMAND) {
    const output: AgentCommandOutput = {
      contractVersion: AGENT_OUTPUT_CONTRACT_VERSION,
      summary: 'No AGENT_EXECUTION_COMMAND configured. Nexus prepared a handoff bundle for a downstream coding agent.',
      findings: ['Agent command not configured; no code changes were applied.'],
      outcome: 'no-changes' as const,
      changedFiles: []
    };
    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

    return {
      promptPath,
      contextPath,
      outputPath,
      stdout: '',
      stderr: '',
      output
    };
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NEXUS_AGENT_TASK_ID: input.task.id,
    NEXUS_AGENT_EXECUTION_ID: input.executionId,
    NEXUS_AGENT_WORKTREE_PATH: input.worktreePath,
    NEXUS_AGENT_PROMPT_FILE: promptPath,
    NEXUS_AGENT_CONTEXT_FILE: contextPath,
    NEXUS_AGENT_OUTPUT_FILE: outputPath
  };

  const { stdout, stderr } = await runCommand(
    input.config.AGENT_EXECUTION_COMMAND,
    input.config.AGENT_EXECUTION_ARGS ?? [],
    {
      cwd: input.worktreePath,
      env,
      timeoutMs: input.config.AGENT_EXECUTION_TIMEOUT_SECONDS * 1000
    }
  );

  const parsedOutput = await (async () => {
    if (!(await fileExists(outputPath))) {
      return {
        contractVersion: AGENT_OUTPUT_CONTRACT_VERSION,
        summary: 'Agent command completed without producing an output file.',
        findings: [],
        outcome: 'no-changes',
        changedFiles: []
      } satisfies AgentCommandOutput;
    }

    const raw = await readFile(outputPath, 'utf8');
    return agentOutputSchema.parse(JSON.parse(raw));
  })();

  return {
    promptPath,
    contextPath,
    outputPath,
    stdout,
    stderr,
    output: parsedOutput
  };
}