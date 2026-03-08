import { spawn } from 'node:child_process';

import type { GitHubIntegration } from '../../integrations/github/client.js';
import { createRepositoryCommandContext } from './repository-workspace.js';
import type { AppConfig } from '../../support/config.js';
import type { StoredAgentTask, StoredAgentTaskExecution } from '../../types/agent-tasks.js';

interface PromoteExecutionPullRequestInput {
  config: AppConfig;
  github: GitHubIntegration;
  task: StoredAgentTask;
  execution: StoredAgentTaskExecution;
  fallbackBody?: string;
  draft?: boolean;
}

export interface PromoteExecutionPullRequestResult {
  pullRequestNumber: number;
  pullRequestUrl: string;
}

function runCommand(command: string, args: string[], options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      resolve({
        code: code ?? 0,
        stdout,
        stderr
      });
    });
  });
}

export function isGitHubRepository(value: string): boolean {
  return value.split('/').filter(Boolean).length === 2 && !value.startsWith('/') && !value.startsWith('.');
}

export function buildPullRequestBody(input: {
  taskTitle: string;
  taskObjective: string;
  findings: string[];
  validationEvidence: Record<string, unknown>;
  fallbackBody?: string;
}): string {
  if (input.fallbackBody) {
    return input.fallbackBody;
  }

  return [
    '## Nexus Agent Task',
    '',
    `- Title: ${input.taskTitle}`,
    `- Objective: ${input.taskObjective}`,
    '',
    '## Findings',
    ...(input.findings.length > 0 ? input.findings.map((finding) => `- ${finding}`) : ['- No findings supplied.']),
    '',
    '## Validation Evidence',
    '```json',
    JSON.stringify(input.validationEvidence, null, 2),
    '```'
  ].join('\n');
}

export async function promoteExecutionPullRequest(input: PromoteExecutionPullRequestInput): Promise<PromoteExecutionPullRequestResult> {
  if (!input.execution.worktreePath || !input.execution.branchName || !input.execution.baseBranch) {
    throw new Error('execution is missing worktree, branch, or base branch metadata');
  }

  const commandContext = await createRepositoryCommandContext(input.config, input.task.targetRepository);

  try {
    await runCommand('git', ['-C', input.execution.worktreePath, 'push', '-u', 'origin', input.execution.branchName], {
      cwd: input.execution.worktreePath,
      ...(commandContext.env ? { env: commandContext.env } : {})
    });

    const pullRequest = await input.github.createPullRequest({
      repository: input.task.targetRepository,
      title: `Nexus fix: ${input.task.title}`,
      body: buildPullRequestBody({
        taskTitle: input.task.title,
        taskObjective: input.task.objective,
        findings: input.execution.findings,
        validationEvidence: input.execution.validationEvidence,
        ...(input.fallbackBody ? { fallbackBody: input.fallbackBody } : {})
      }),
      head: input.execution.branchName,
      base: input.execution.baseBranch,
      draft: input.draft ?? true
    });

    return {
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url
    };
  } finally {
    await commandContext.cleanup();
  }
}