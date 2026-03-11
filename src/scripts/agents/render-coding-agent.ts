import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CONTRACT_VERSION = 'nexus-agent-output-v1';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4';
const MAX_FILE_COUNT = 40;
const MAX_FILE_BYTES = 12_000;
const MAX_TOTAL_BYTES = 160_000;
const TEXT_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.css', '.scss', '.html', '.sql', '.sh', '.txt'
]);
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'var', '.nexus']);

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

function parseOptionalJsonArray(name: string): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a JSON array of strings`);
  }

  return parsed;
}

function envOrDefault(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : defaultValue;
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

function responseSchema(): Record<string, unknown> {
  return {
    name: 'nexus_agent_result',
    strict: true,
    schema: {
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
        json_schema: responseSchema()
      },
      messages: [
        {
          role: 'system',
          content: 'You are GPT-5.4 acting as a careful software engineer. Produce valid JSON that follows the provided schema exactly.'
        },
        {
          role: 'user',
          content: buildAgentPrompt({
            prompt: input.prompt,
            context: input.context,
            repositoryFiles
          })
        }
      ]
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${responseText}`);
  }

  const parsed = JSON.parse(responseText) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const messageContent = parsed.choices?.[0]?.message?.content;
  if (!messageContent) {
    throw new Error('OpenAI response did not include message content');
  }

  return JSON.parse(messageContent) as ModelAgentResponse;
}

function resolveSafeTargetPath(rootPath: string, proposedPath: string): string {
  const normalized = proposedPath.replaceAll('\\', '/').replace(/^\//, '');
  const resolved = path.resolve(rootPath, normalized);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Proposed file path escapes the repository: ${proposedPath}`);
  }
  return resolved;
}

async function applyFileChanges(rootPath: string, fileChanges: ProposedFileChange[]): Promise<string[]> {
  const changedPaths: string[] = [];
  for (const fileChange of fileChanges) {
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
    changedPaths.push(fileChange.path.replaceAll(path.sep, '/'));
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

  if (!process.env.OPENAI_API_KEY) {
    await writeBlockedOutput(
      outputPath,
      'Render API agent wrapper is configured, but OPENAI_API_KEY has not been set on the worker.',
      [
        'Set OPENAI_API_KEY on the worker service to enable API-backed agent execution.',
        `Optionally set OPENAI_MODEL (default ${DEFAULT_OPENAI_MODEL}) and OPENAI_BASE_URL.`
      ]
    );
    return;
  }

  const prompt = await readFile(promptPath, 'utf8');
  const context = await readFile(contextPath, 'utf8');
  const requestedArgs = parseOptionalJsonArray('OPENAI_MODEL_REQUEST_ARGS');
  if (requestedArgs.length > 0) {
    process.env.OPENAI_MODEL_REQUEST_ARGS = JSON.stringify(requestedArgs);
  }

  const modelResult = await requestOpenAiAgentResult({
    prompt,
    context,
    worktreePath
  });

  const actualChangedFiles = await applyFileChanges(worktreePath, modelResult.fileChanges);
  const finalOutcome: 'changes-made' | 'no-changes' | 'blocked' = actualChangedFiles.length > 0
    ? 'changes-made'
    : modelResult.outcome === 'blocked'
      ? 'blocked'
      : 'no-changes';

  const reportedChangedFiles = actualChangedFiles.length > 0 ? actualChangedFiles : modelResult.changedFiles;
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