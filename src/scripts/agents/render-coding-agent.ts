import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CONTRACT_VERSION = 'nexus-agent-output-v1';
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-6';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const MAX_FILE_COUNT = 40;
const MAX_FILE_BYTES = 12_000;
const MAX_TOTAL_BYTES = 160_000;
const TEXT_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.css', '.scss', '.html', '.sql', '.sh', '.txt'
]);
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'var', '.nexus']);
const RESERVED_OUTPUT_DIRECTORIES = ['.git', '.nexus'];

interface FileSnapshot {
  path: string;
  content: string;
}

interface ProposedFileChange {
  path: string;
  content: string;
  reason?: string;
}

interface ModelAgentResponse {
  summary: string;
  findings: string[];
  outcome: 'changes-made' | 'no-changes' | 'blocked';
  changedFiles: string[];
  validationCommand?: string;
  fileChanges: ProposedFileChange[];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function envOrDefault(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : defaultValue;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\//, '');
}

function isReservedOutputPath(filePath: string): boolean {
  return RESERVED_OUTPUT_DIRECTORIES.some((directory) => filePath === directory || filePath.startsWith(`${directory}/`));
}

function isCandidateTextFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return true;
  }

  const baseName = path.basename(filePath);
  return ['Dockerfile', 'README', 'README.md'].includes(baseName);
}

async function collectRepositorySnapshot(rootPath: string): Promise<FileSnapshot[]> {
  const queue: string[] = ['.'];
  const snapshots: FileSnapshot[] = [];
  let totalBytes = 0;

  while (queue.length > 0 && snapshots.length < MAX_FILE_COUNT && totalBytes < MAX_TOTAL_BYTES) {
    const relativeDir = queue.shift();
    if (!relativeDir) {
      break;
    }

    const absoluteDir = path.join(rootPath, relativeDir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir === '.' ? entry.name : path.posix.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          queue.push(relativePath);
        }
        continue;
      }

      if (!entry.isFile() || !isCandidateTextFile(relativePath)) {
        continue;
      }

      const absolutePath = path.join(rootPath, relativePath);
      const fileStats = await stat(absolutePath);
      if (fileStats.size > MAX_FILE_BYTES) {
        continue;
      }

      if (totalBytes + fileStats.size > MAX_TOTAL_BYTES) {
        break;
      }

      const content = await readFile(absolutePath, 'utf8');
      snapshots.push({
        path: relativePath.replaceAll(path.sep, '/'),
        content
      });
      totalBytes += fileStats.size;
    }
  }

  return snapshots;
}

function buildAgentPrompt(input: { prompt: string; context: string; repositoryFiles: FileSnapshot[] }): string {
  return [
    'You are a non-interactive coding agent running inside Nexus.',
    'Return JSON only. Do not use markdown fences.',
    'When you change a file, include the full replacement content for that file in fileChanges.',
    'Only propose repository-relative text file paths.',
    'Keep changes minimal and focused on the task.',
    '',
    '## Nexus Task Prompt',
    input.prompt,
    '',
    '## Nexus Prepared Context',
    input.context,
    '',
    '## Repository Snapshot',
    JSON.stringify(input.repositoryFiles, null, 2)
  ].join('\n');
}

function agentTool(): Anthropic.Tool {
  return {
    name: 'nexus_agent_result',
    description: 'Report the result of the coding agent task.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: { type: 'string' }
        },
        outcome: {
          type: 'string',
          enum: ['changes-made', 'no-changes', 'blocked']
        },
        changedFiles: {
          type: 'array',
          items: { type: 'string' }
        },
        validationCommand: {
          type: 'string'
        },
        fileChanges: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
              reason: { type: 'string' }
            },
            required: ['path', 'content', 'reason']
          }
        }
      },
      required: ['summary', 'findings', 'outcome', 'changedFiles', 'validationCommand', 'fileChanges']
    }
  };
}

async function requestClaudeAgentResult(input: { prompt: string; context: string; worktreePath: string }): Promise<ModelAgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const client = new Anthropic({ apiKey });
  const repositoryFiles = await collectRepositorySnapshot(input.worktreePath);

  const response = await client.messages.create({
    model: envOrDefault('ANTHROPIC_MODEL', DEFAULT_ANTHROPIC_MODEL),
    max_tokens: 8192,
    tools: [agentTool()],
    tool_choice: { type: 'tool', name: 'nexus_agent_result' },
    system: 'You are a careful software engineer acting as a non-interactive coding agent inside Nexus. You must call the nexus_agent_result tool with your result. Keep changes minimal and focused on the task. Only propose repository-relative text file paths. When you change a file, include the full replacement content in fileChanges.',
    messages: [
      {
        role: 'user',
        content: buildAgentPrompt({
          prompt: input.prompt,
          context: input.context,
          repositoryFiles
        })
      }
    ]
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'nexus_agent_result'
  );
  if (!toolUseBlock) {
    throw new Error('Claude response did not include nexus_agent_result tool call');
  }

  return toolUseBlock.input as ModelAgentResponse;
}

async function requestOpenAiAgentResult(input: { prompt: string; context: string; worktreePath: string }): Promise<ModelAgentResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const repositoryFiles = await collectRepositorySnapshot(input.worktreePath);
  const response = await fetch(`${envOrDefault('OPENAI_BASE_URL', DEFAULT_OPENAI_BASE_URL)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: envOrDefault('OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'nexus_agent_result',
          strict: true,
          schema: agentTool().input_schema
        }
      },
      messages: [
        {
          role: 'system',
          content: 'You are a careful software engineer acting as a non-interactive coding agent inside Nexus. Return JSON only. Do not use markdown fences. When you change a file, include the full replacement content for that file in fileChanges. Only propose repository-relative text file paths. Keep changes minimal and focused on the task.'
        },
        {
          role: 'user',
          content: buildAgentPrompt({ prompt: input.prompt, context: input.context, repositoryFiles })
        }
      ]
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${responseText}`);
  }

  const parsed = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
  const messageContent = parsed.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error('OpenAI response did not include message content');
  }

  return JSON.parse(messageContent) as ModelAgentResponse;
}

function resolveSafeTargetPath(rootPath: string, proposedPath: string): string {
  const normalized = normalizeRelativePath(proposedPath);
  const resolved = path.resolve(rootPath, normalized);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Proposed file path escapes the repository: ${proposedPath}`);
  }
  return resolved;
}

async function runGitCommand(rootPath: string, args: string[]): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', rootPath, ...args], {
      cwd: rootPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf8'));
        return;
      }

      reject(new Error(`git ${args.join(' ')} failed with code ${code}: ${Buffer.concat(stderrChunks).toString('utf8').trim()}`));
    });
  });
}

async function listRepositoryVisibleChanges(rootPath: string): Promise<string[]> {
  const pathspec = ['--', '.', ':(exclude).nexus', ':(exclude).nexus/**'];
  const [modifiedOutput, untrackedOutput] = await Promise.all([
    runGitCommand(rootPath, ['diff', '--name-only', '--no-ext-diff', ...pathspec]),
    runGitCommand(rootPath, ['ls-files', '--others', '--exclude-standard', ...pathspec])
  ]);

  return Array.from(new Set([
    ...modifiedOutput.split('\n').map((entry) => entry.trim()).filter(Boolean),
    ...untrackedOutput.split('\n').map((entry) => entry.trim()).filter(Boolean)
  ])).sort();
}

async function applyFileChanges(rootPath: string, fileChanges: ProposedFileChange[]): Promise<string[]> {
  const changedPaths: string[] = [];
  for (const fileChange of fileChanges) {
    const normalizedPath = normalizeRelativePath(fileChange.path);
    if (isReservedOutputPath(normalizedPath)) {
      continue;
    }

    const targetPath = resolveSafeTargetPath(rootPath, fileChange.path);
    await mkdir(path.dirname(targetPath), { recursive: true });

    let existingContent: string | null = null;
    try {
      existingContent = await readFile(targetPath, 'utf8');
    } catch {
      existingContent = null;
    }

    if (existingContent === fileChange.content) {
      continue;
    }

    await writeFile(targetPath, fileChange.content, 'utf8');
    changedPaths.push(normalizedPath.replaceAll(path.sep, '/'));
  }

  return changedPaths;
}

async function writeBlockedOutput(outputPath: string, summary: string, findings: string[]): Promise<void> {
  await writeFile(outputPath, JSON.stringify({
    contractVersion: CONTRACT_VERSION,
    summary,
    findings,
    outcome: 'blocked',
    changedFiles: []
  }, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const outputPath = requireEnv('NEXUS_AGENT_OUTPUT_FILE');
  const promptPath = requireEnv('NEXUS_AGENT_PROMPT_FILE');
  const contextPath = requireEnv('NEXUS_AGENT_CONTEXT_FILE');
  const worktreePath = process.env.NEXUS_AGENT_WORKTREE_PATH ?? process.cwd();

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    await writeBlockedOutput(
      outputPath,
      'Render API agent wrapper is configured, but no API key has been set on the worker.',
      [
        `Set ANTHROPIC_API_KEY (preferred, model default: ${DEFAULT_ANTHROPIC_MODEL}) or OPENAI_API_KEY (fallback, model default: ${DEFAULT_OPENAI_MODEL}) on the worker service.`
      ]
    );
    return;
  }

  const prompt = await readFile(promptPath, 'utf8');
  const context = await readFile(contextPath, 'utf8');

  const modelResult = await (process.env.ANTHROPIC_API_KEY
    ? requestClaudeAgentResult({ prompt, context, worktreePath })
    : requestOpenAiAgentResult({ prompt, context, worktreePath }));

  await applyFileChanges(worktreePath, Array.isArray(modelResult.fileChanges) ? modelResult.fileChanges : []);
  const repositoryChangedFiles = await listRepositoryVisibleChanges(worktreePath);
  const finalOutcome: 'changes-made' | 'no-changes' | 'blocked' = repositoryChangedFiles.length > 0
    ? 'changes-made'
    : modelResult.outcome === 'blocked'
      ? 'blocked'
      : 'no-changes';

  const reportedChangedFiles = repositoryChangedFiles.length > 0 ? repositoryChangedFiles : [];
  await writeFile(outputPath, JSON.stringify({
    contractVersion: CONTRACT_VERSION,
    summary: modelResult.summary,
    findings: modelResult.findings,
    outcome: finalOutcome,
    changedFiles: reportedChangedFiles,
    ...(modelResult.validationCommand ? { validationCommand: modelResult.validationCommand } : {})
  }, null, 2), 'utf8');
}

void main();