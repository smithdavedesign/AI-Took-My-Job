import { spawn } from 'node:child_process';

import type { GitHubIntegration } from '../../integrations/github/client.js';
import { createRepositoryCommandContext } from './repository-workspace.js';
import type { AppConfig } from '../../support/config.js';
import type { StoredAgentTask, StoredAgentTaskExecution } from '../../types/agent-tasks.js';

function buildReference(baseUrl: string | undefined, path: string): string {
  return baseUrl ? `${baseUrl}${path}` : path;
}

function formatJsonBlock(value: unknown): string[] {
  return [
    '```json',
    JSON.stringify(value, null, 2),
    '```'
  ];
}

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
  config: AppConfig;
  task: StoredAgentTask;
  execution: StoredAgentTaskExecution;
  taskTitle: string;
  taskObjective: string;
  findings: string[];
  validationEvidence: Record<string, unknown>;
  fallbackBody?: string;
}): string {
  if (input.fallbackBody) {
    return input.fallbackBody;
  }

  const reportContext = input.task.preparedContext.report && typeof input.task.preparedContext.report === 'object'
    ? input.task.preparedContext.report as Record<string, unknown>
    : {};
  const impactContext = input.task.preparedContext.impact && typeof input.task.preparedContext.impact === 'object'
    ? input.task.preparedContext.impact as Record<string, unknown>
    : null;
  const ownershipContext = input.task.preparedContext.ownership && typeof input.task.preparedContext.ownership === 'object'
    ? input.task.preparedContext.ownership as Record<string, unknown>
    : null;
  const artifacts = Array.isArray(input.task.preparedContext.artifacts)
    ? input.task.preparedContext.artifacts as Array<Record<string, unknown>>
    : [];
  const replayValidation = input.validationEvidence.replayValidation && typeof input.validationEvidence.replayValidation === 'object'
    ? input.validationEvidence.replayValidation as Record<string, unknown>
    : null;
  const validationStatus = typeof input.execution.resultSummary.validationStatus === 'string'
    ? input.execution.resultSummary.validationStatus
    : 'not-run';
  const reportId = typeof reportContext.id === 'string' ? reportContext.id : input.task.feedbackReportId;
  const executionId = input.execution.id;
  const evidenceReferences = {
    execution: buildReference(input.config.APP_BASE_URL, `/internal/agent-task-executions/${executionId}`),
    executionArtifacts: buildReference(input.config.APP_BASE_URL, `/internal/agent-task-executions/${executionId}/artifacts`),
    executionCloseout: buildReference(input.config.APP_BASE_URL, `/internal/agent-task-executions/${executionId}/closeout`),
    executionReplayValidation: buildReference(input.config.APP_BASE_URL, `/internal/agent-task-executions/${executionId}/replay-validation`),
    reportHistory: buildReference(input.config.APP_BASE_URL, `/internal/reports/${reportId}/history`),
    reportImpact: buildReference(input.config.APP_BASE_URL, `/internal/reports/${reportId}/impact`)
  };

  return [
    '## Nexus Agent Task',
    '',
    `- Title: ${input.taskTitle}`,
    `- Objective: ${input.taskObjective}`,
    `- Execution ID: ${executionId}`,
    `- Report ID: ${reportId}`,
    `- Validation Status: ${validationStatus}`,
    ...(replayValidation && typeof replayValidation.status === 'string' ? [`- Replay Validation: ${replayValidation.status}`] : []),
    `- Artifact Count: ${artifacts.length}`,
    '',
    '## Evidence References',
    `- Execution: ${evidenceReferences.execution}`,
    `- Execution Artifacts: ${evidenceReferences.executionArtifacts}`,
    `- Execution Closeout: ${evidenceReferences.executionCloseout}`,
    `- Replay Validation: ${evidenceReferences.executionReplayValidation}`,
    `- Report History: ${evidenceReferences.reportHistory}`,
    `- Refined Impact: ${evidenceReferences.reportImpact}`,
    '',
    ...(impactContext ? [
      '## Impact Summary',
      ...formatJsonBlock(impactContext),
      ''
    ] : []),
    ...(ownershipContext ? [
      '## Ownership Hints',
      ...formatJsonBlock(ownershipContext),
      ''
    ] : []),
    '## Findings',
    ...(input.findings.length > 0 ? input.findings.map((finding) => `- ${finding}`) : ['- No findings supplied.']),
    '',
    '## Validation Evidence',
    ...formatJsonBlock(input.validationEvidence)
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
        config: input.config,
        task: input.task,
        execution: input.execution,
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