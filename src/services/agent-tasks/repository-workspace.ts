import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type { GitHubIntegration } from '../../integrations/github/client.js';
import type { AppConfig } from '../../support/config.js';

export interface PreparedRepositoryWorkspace {
  branchName: string;
  baseBranch?: string;
  worktreePath: string;
}

export interface RepositoryCommandContext {
  env?: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
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

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr || stdout}`));
    });
  });
}

function withEnv(env?: NodeJS.ProcessEnv): { env?: NodeJS.ProcessEnv } {
  return env ? { env } : {};
}

async function createAskPassScript(token: string): Promise<{ scriptPath: string; cleanup(): Promise<void> }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nexus-askpass-'));
  const scriptPath = path.join(tempDir, 'askpass.sh');
  const escapedToken = token.replace(/'/g, `'"'"'`);
  await writeFile(
    scriptPath,
    `#!/bin/sh\ncase "$1" in\n  *Username*) printf '%s' 'x-access-token' ;;\n  *) printf '%s' '${escapedToken}' ;;\nesac\n`,
    { mode: 0o700 }
  );

  return {
    scriptPath,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

async function buildCloneTarget(config: AppConfig, targetRepository: string, github?: GitHubIntegration): Promise<{
  cloneSource: string;
  env?: NodeJS.ProcessEnv;
  cleanup?: () => Promise<void>;
  repositoryLabel: string;
}> {
  if (targetRepository.startsWith('/') || targetRepository.startsWith('.')) {
    const resolvedPath = path.resolve(targetRepository);
    return {
      cloneSource: resolvedPath,
      repositoryLabel: sanitizeSegment(resolvedPath)
    };
  }

  const parts = targetRepository.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`unsupported target repository format: ${targetRepository}`);
  }
  const [owner, repo] = parts as [string, string];

  const token = github ? await github.resolveGitAuthToken() : config.GITHUB_TOKEN;
  if (!token) {
    throw new Error('repository checkout requires GitHub credentials for the target repository');
  }

  const askPass = await createAskPassScript(token);
  return {
    cloneSource: `https://github.com/${owner}/${repo}.git`,
    repositoryLabel: `${sanitizeSegment(owner)}__${sanitizeSegment(repo)}`,
    env: {
      GIT_ASKPASS: askPass.scriptPath,
      GIT_TERMINAL_PROMPT: '0'
    },
    cleanup: askPass.cleanup
  };
}

export async function createRepositoryCommandContext(config: AppConfig, targetRepository: string, github?: GitHubIntegration): Promise<RepositoryCommandContext> {
  const cloneTarget = await buildCloneTarget(config, targetRepository, github);

  return {
    ...(cloneTarget.env ? { env: cloneTarget.env } : {}),
    async cleanup() {
      if (cloneTarget.cleanup) {
        await cloneTarget.cleanup();
      }
    }
  };
}

async function ensureRepositoryMirror(repositoryLabel: string, cloneSource: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const rootPath = path.resolve(process.cwd(), 'var/agent-workspaces/repos');
  const repositoryPath = path.join(rootPath, repositoryLabel);

  await mkdir(rootPath, { recursive: true });

  if (!(await pathExists(repositoryPath))) {
    await runCommand('git', ['clone', cloneSource, repositoryPath], withEnv(env));
    return repositoryPath;
  }

  await runCommand('git', ['-C', repositoryPath, 'fetch', '--all', '--prune'], withEnv(env));
  return repositoryPath;
}

async function resolveBaseBranch(repositoryPath: string, env?: NodeJS.ProcessEnv): Promise<string> {
  try {
    const symbolic = await runCommand('git', ['-C', repositoryPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], withEnv(env));
    return symbolic.stdout.replace(/^origin\//, '');
  } catch {
    const remoteShow = await runCommand('git', ['-C', repositoryPath, 'remote', 'show', 'origin'], withEnv(env));
    const headBranchLine = remoteShow.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('HEAD branch: '));

    if (headBranchLine) {
      const headBranch = headBranchLine.replace('HEAD branch: ', '').trim();
      if (headBranch && headBranch !== '(unknown)') {
        return headBranch;
      }
    }

    const remoteBranches = await runCommand('git', ['-C', repositoryPath, 'branch', '-r'], withEnv(env));
    const branchNames = remoteBranches.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^origin\//, ''));

    if (branchNames.includes('main')) {
      return 'main';
    }

    if (branchNames.includes('master')) {
      return 'master';
    }

    const firstBranch = branchNames.find((line) => line !== 'HEAD -> origin/HEAD');
    if (firstBranch) {
      return firstBranch;
    }

    return 'main';
  }
}

async function repositoryHasUsableBaseRef(repositoryPath: string, baseBranch: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await runCommand('git', ['-C', repositoryPath, 'rev-parse', '--verify', `refs/remotes/origin/${baseBranch}`], withEnv(env));
    return true;
  } catch {
    return false;
  }
}

export async function prepareRepositoryWorkspace(input: {
  config: AppConfig;
  targetRepository: string;
  agentTaskId: string;
  executionId: string;
  github?: GitHubIntegration;
}): Promise<PreparedRepositoryWorkspace> {
  const cloneTarget = await buildCloneTarget(input.config, input.targetRepository, input.github);

  try {
    const repositoryPath = await ensureRepositoryMirror(
      cloneTarget.repositoryLabel,
      cloneTarget.cloneSource,
      cloneTarget.env
    );
    const baseBranch = await resolveBaseBranch(repositoryPath, cloneTarget.env);
    const runsRoot = path.resolve(process.cwd(), 'var/agent-workspaces/runs');
    const worktreePath = path.join(runsRoot, `${sanitizeSegment(input.agentTaskId)}-${sanitizeSegment(input.executionId)}`);
    const branchName = `nexus/agent-task-${input.agentTaskId.slice(0, 8)}-${input.executionId.slice(0, 8)}-${randomBytes(2).toString('hex')}`;
    const hasUsableBaseRef = await repositoryHasUsableBaseRef(repositoryPath, baseBranch, cloneTarget.env);

    await mkdir(runsRoot, { recursive: true });
    await rm(worktreePath, { recursive: true, force: true });
    await runCommand('git', ['-C', repositoryPath, 'worktree', 'prune'], withEnv(cloneTarget.env));

    if (hasUsableBaseRef) {
      await runCommand(
        'git',
        ['-C', repositoryPath, 'worktree', 'add', '-B', branchName, worktreePath, `origin/${baseBranch}`],
        withEnv(cloneTarget.env)
      );

      return {
        branchName,
        baseBranch,
        worktreePath
      };
    }

    await runCommand(
      'git',
      ['-C', repositoryPath, 'worktree', 'add', '--orphan', '-B', branchName, worktreePath],
      withEnv(cloneTarget.env)
    );

    return {
      branchName,
      worktreePath
    };
  } finally {
    if (cloneTarget.cleanup) {
      await cloneTarget.cleanup();
    }
  }
}