import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { Queue, Worker } from 'bullmq';

import { createGitHubIntegration } from './integrations/github/client.js';
import { createAgentTaskExecutionRepository } from './repositories/agent-task-execution-repository.js';
import { createAgentTaskExecutionPullRequestRepository } from './repositories/agent-task-execution-pull-request-repository.js';
import { createAgentTaskExecutionReviewRepository } from './repositories/agent-task-execution-review-repository.js';
import { createAgentTaskReplayValidationRepository } from './repositories/agent-task-replay-validation-repository.js';
import { createAgentTaskValidationPolicyRepository } from './repositories/agent-task-validation-policy-repository.js';
import { createArtifactBundleRepository } from './repositories/artifact-bundle-repository.js';
import { loadConfig } from './support/config.js';
import { createDatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { createReplayRunRepository } from './repositories/replay-run-repository.js';
import { createFeedbackRepository } from './repositories/feedback-repository.js';
import { createFeedbackReportEmbeddingRepository } from './repositories/feedback-report-embedding-repository.js';
import { createGitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createTriageJobRepository } from './repositories/triage-job-repository.js';
import { createArtifactStore } from './services/artifacts/index.js';
import { runConfiguredAgent } from './services/agent-tasks/agent-runner.js';
import { persistExecutionTextArtifact } from './services/agent-tasks/execution-artifacts.js';
import { isGitHubRepository } from './services/agent-tasks/pull-request-promotion.js';
import { resolveRefinedImpactAssessment } from './services/reports/report-impact.js';
import { resolveReportHistory } from './services/reports/report-history.js';
import { resolveOwnershipCandidates } from './services/reports/ownership-candidates.js';
import { resolveSimilarReports } from './services/reports/similar-reports.js';
import { runReplayValidation } from './services/agent-tasks/replay-validation.js';
import { prepareRepositoryWorkspace } from './services/agent-tasks/repository-workspace.js';
import { buildReplayArtifacts, summarizeReplayPlan } from './services/replay/har-replay-plan.js';
import { executeReplayPlan } from './services/replay/playwright-replay-executor.js';
import { createIssueDraft } from './services/triage/issue-draft.js';
import { createAgentTaskRepository } from './repositories/agent-task-repository.js';
import type { StoredAgentTaskExecution } from './types/agent-tasks.js';

async function runCommand(command: string, args: string[], options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<{ code: number; stdout: string; stderr: string }> {
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
    let timedOut = false;

    const timeout = options.timeoutMs
      ? setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, options.timeoutMs)
      : null;

    child.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on('error', (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (timedOut) {
        reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        return;
      }

      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

async function runGit(worktreePath: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return runCommand('git', ['-C', worktreePath, ...args], {
    cwd: worktreePath,
    ...(env ? { env } : {})
  });
}

async function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonArtifact(storage: ReturnType<typeof createArtifactStore>['store'], storageKey: string): Promise<Record<string, unknown>> {
  const stream = await storage.readArtifact(storageKey);
  const text = await readStreamToString(stream);
  return JSON.parse(text) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisConnection(config.REDIS_URL);
  const bullConnection = createBullConnectionOptions(config.REDIS_URL);
  const feedbackRepository = createFeedbackRepository(database);
  const feedbackReportEmbeddingRepository = createFeedbackReportEmbeddingRepository(database);
  const artifactBundleRepository = createArtifactBundleRepository(database);
  const agentTaskRepository = createAgentTaskRepository(database);
  const agentTaskExecutionRepository = createAgentTaskExecutionRepository(database);
  const agentTaskExecutionPullRequestRepository = createAgentTaskExecutionPullRequestRepository(database);
  const agentTaskExecutionReviewRepository = createAgentTaskExecutionReviewRepository(database);
  const agentTaskReplayValidationRepository = createAgentTaskReplayValidationRepository(database);
  const agentTaskValidationPolicyRepository = createAgentTaskValidationPolicyRepository(database);
  const githubIssueLinkRepository = createGitHubIssueLinkRepository(database);
  const replayRunRepository = createReplayRunRepository(database);
  const triageJobRepository = createTriageJobRepository(database);
  const artifactStorage = createArtifactStore(config);
  const github = createGitHubIntegration(config);
  const queue = new Queue('triage', {
    connection: bullConnection
  });

  const worker = new Worker(
    'triage',
    async (job) => {
      if (!job.id) {
        throw new Error('missing Bull job id');
      }

      await triageJobRepository.updateStatus(job.id, 'processing');

      if (job.name === 'replay' || job.data.type === 'replay') {
        const report = await feedbackRepository.findById(job.data.reportId);

        if (!report) {
          throw new Error(`missing feedback report ${job.data.reportId}`);
        }

        const artifacts = await artifactBundleRepository.findByReportId(report.id);
        const harArtifact = artifacts.find((artifact) => artifact.artifactType === 'har');

        if (!harArtifact) {
          throw new Error(`missing HAR artifact for report ${report.id}`);
        }

        const replayRunId = randomUUID();
        await replayRunRepository.create({
          id: replayRunId,
          feedbackReportId: report.id,
          artifactId: harArtifact.id,
          status: 'processing',
          summary: {
            stage: 'loading-har'
          }
        });

        try {
          const harStream = await artifactStorage.store.readArtifact(harArtifact.storageKey);
          const harText = await readStreamToString(harStream);
          const localStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'local-storage');
          const sessionStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'session-storage');
          const storageState = {
            localStorageKeys: localStorageArtifact ? Object.keys(await readJsonArtifact(artifactStorage.store, localStorageArtifact.storageKey)) : [],
            sessionStorageKeys: sessionStorageArtifact ? Object.keys(await readJsonArtifact(artifactStorage.store, sessionStorageArtifact.storageKey)) : []
          };
          const builtReplay = buildReplayArtifacts(harText, storageState);
          const execution = await executeReplayPlan({
            plan: builtReplay.plan,
            steps: builtReplay.executionSteps
          });
          const replayPlan = {
            ...builtReplay.plan,
            execution
          };

          await replayRunRepository.update({
            id: replayRunId,
            feedbackReportId: report.id,
            artifactId: harArtifact.id,
            status: 'completed',
            summary: summarizeReplayPlan(replayPlan),
            replayPlan
          });

          await triageJobRepository.updateStatus(job.id, 'completed');

          console.log(JSON.stringify({
            message: 'replay job completed',
            jobId: job.id,
            reportId: report.id,
            replayRunId,
            requestCount: replayPlan.requestCount,
            executionStatus: execution.status
          }));

          return;
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : 'unknown replay failure';
          await replayRunRepository.update({
            id: replayRunId,
            feedbackReportId: report.id,
            artifactId: harArtifact.id,
            status: 'failed',
            summary: {
              stage: 'failed'
            },
            failureReason
          });
          throw error;
        }
      }

      if (job.name === 'agent-task' || job.data.type === 'agent-task') {
        const report = await feedbackRepository.findById(job.data.reportId);

        if (!report) {
          throw new Error(`missing feedback report ${job.data.reportId}`);
        }

        const agentTaskId = typeof job.data.payload.agentTaskId === 'string'
          ? job.data.payload.agentTaskId
          : null;

        if (!agentTaskId) {
          throw new Error('missing agentTaskId in queued agent-task payload');
        }

        await agentTaskRepository.updateStatus(agentTaskId, 'preparing');

        try {
          const draft = await githubIssueLinkRepository.findByReportId(report.id);
          const replay = await replayRunRepository.findLatestByReportId(report.id);
          const artifacts = await artifactBundleRepository.findByReportId(report.id);
          const embedding = await feedbackReportEmbeddingRepository.findByReportId(report.id);
          const ownership = await resolveOwnershipCandidates({
            report,
            ...(draft?.repository ? { repository: draft.repository } : {}),
            ...(embedding ? {
              embedding: embedding.embedding,
              loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
              loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
            } : {})
          });
          const similarReports = embedding
            ? await resolveSimilarReports({
              report,
              embedding: embedding.embedding,
              loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
              loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId),
              loadIssueLinkByReportId: (neighborReportId) => githubIssueLinkRepository.findByReportId(neighborReportId)
            })
            : { candidates: [] };
          const history = await resolveReportHistory({
            report,
            ...(embedding ? {
              embedding: embedding.embedding,
              loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
              loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
            } : {}),
            loadIssueLinkByReportId: (linkedReportId) => githubIssueLinkRepository.findByReportId(linkedReportId),
            loadTasksByReportId: (linkedReportId) => agentTaskRepository.findByReportId(linkedReportId),
            loadExecutionsByTaskId: (agentTaskId) => agentTaskExecutionRepository.findByTaskId(agentTaskId),
            loadPullRequestByExecutionId: (executionId) => agentTaskExecutionPullRequestRepository.findByExecutionId(executionId)
          });
          const impact = await resolveRefinedImpactAssessment({
            report,
            ...(draft?.repository ? { repository: draft.repository } : {}),
            ...(embedding ? {
              embedding: embedding.embedding,
              loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
              loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
            } : {}),
            loadIssueLinkByReportId: (linkedReportId) => githubIssueLinkRepository.findByReportId(linkedReportId),
            loadTasksByReportId: (linkedReportId) => agentTaskRepository.findByReportId(linkedReportId),
            loadExecutionsByTaskId: (agentTaskId) => agentTaskExecutionRepository.findByTaskId(agentTaskId),
            loadPullRequestByExecutionId: (executionId) => agentTaskExecutionPullRequestRepository.findByExecutionId(executionId)
          });
          const preparedContext = {
            report: {
              id: report.id,
              source: report.source,
              title: report.title ?? null,
              severity: report.severity,
              reporterIdentifier: report.reporterIdentifier ?? null,
              status: report.status
            },
            objective: job.data.payload.objective,
            executionMode: job.data.payload.executionMode,
            acceptanceCriteria: job.data.payload.acceptanceCriteria ?? [],
            contextNotes: job.data.payload.contextNotes ?? null,
            githubDraft: draft ? {
              repository: draft.repository,
              issueNumber: draft.issueNumber ?? null,
              issueUrl: draft.issueUrl ?? null,
              state: draft.state,
              title: draft.draftTitle,
              labels: draft.draftLabels
            } : null,
            impact,
            replay: replay ? {
              status: replay.status,
              summary: replay.summary,
              executionStatus: replay.replayPlan?.execution?.status ?? null,
              matchedFailingStepOrders: replay.replayPlan?.execution?.matchedFailingStepOrders ?? []
            } : null,
            history,
            similarReports,
            ownership,
            artifacts: artifacts.map((artifact) => ({
              id: artifact.id,
              artifactType: artifact.artifactType,
              storageKey: artifact.storageKey,
              metadata: artifact.metadata
            }))
          };

          await agentTaskRepository.updateStatus(agentTaskId, 'ready', {
            preparedContext
          });
          await triageJobRepository.updateStatus(job.id, 'completed');

          console.log(JSON.stringify({
            message: 'agent task prepared',
            jobId: job.id,
            agentTaskId,
            reportId: report.id,
            hasDraft: Boolean(draft),
            hasReplay: Boolean(replay),
            artifactCount: artifacts.length
          }));

          return;
        } catch (error) {
          await agentTaskRepository.updateStatus(agentTaskId, 'failed', {
            failureReason: error instanceof Error ? error.message : 'unknown agent task preparation failure'
          });
          throw error;
        }
      }

      if (job.name === 'agent-execution' || job.data.type === 'agent-execution') {
        const agentTaskId = typeof job.data.payload.agentTaskId === 'string'
          ? job.data.payload.agentTaskId
          : null;
        const executionId = typeof job.data.payload.executionId === 'string'
          ? job.data.payload.executionId
          : null;

        if (!agentTaskId || !executionId) {
          throw new Error('missing agent task execution identifiers in queued payload');
        }

        const task = await agentTaskRepository.findById(agentTaskId);
        if (!task) {
          throw new Error(`missing agent task ${agentTaskId}`);
        }

        const report = await feedbackRepository.findById(task.feedbackReportId);
        if (!report) {
          throw new Error(`missing feedback report ${task.feedbackReportId}`);
        }

        const execution = await agentTaskExecutionRepository.findById(executionId);
        if (!execution) {
          throw new Error(`missing agent task execution ${executionId}`);
        }

        const startedAt = new Date().toISOString();
        await agentTaskRepository.updateStatus(task.id, 'running', {
          preparedContext: task.preparedContext
        });
        const runningExecution: StoredAgentTaskExecution = {
          ...execution,
          status: 'running',
          startedAt
        };
        await agentTaskExecutionRepository.update(runningExecution);

        try {
          const workspace = await prepareRepositoryWorkspace({
            config,
            targetRepository: task.targetRepository,
            agentTaskId: task.id,
            executionId
          });

          const replayContext = task.preparedContext.replay;
          const artifactContext = Array.isArray(task.preparedContext.artifacts)
            ? task.preparedContext.artifacts as Array<Record<string, unknown>>
            : [];
          const agentRun = await runConfiguredAgent({
            config,
            task,
            executionId,
            worktreePath: workspace.worktreePath
          });
          const promptContent = await readFile(agentRun.promptPath, 'utf8');

          await persistExecutionTextArtifact({
            artifacts: artifactBundleRepository,
            artifactStore: artifactStorage.store,
            reportId: report.id,
            executionId,
            taskId: task.id,
            artifactType: 'agent-task-markdown',
            fileName: 'task.md',
            content: promptContent,
            metadata: {
              branchName: workspace.branchName,
              worktreePath: workspace.worktreePath
            }
          });
          await persistExecutionTextArtifact({
            artifacts: artifactBundleRepository,
            artifactStore: artifactStorage.store,
            reportId: report.id,
            executionId,
            taskId: task.id,
            artifactType: 'agent-context',
            fileName: 'context.json',
            content: JSON.stringify(task.preparedContext, null, 2),
            metadata: {
              branchName: workspace.branchName
            }
          });
          await persistExecutionTextArtifact({
            artifacts: artifactBundleRepository,
            artifactStore: artifactStorage.store,
            reportId: report.id,
            executionId,
            taskId: task.id,
            artifactType: 'agent-output',
            fileName: 'output.json',
            content: JSON.stringify({
              output: agentRun.output,
              stdout: agentRun.stdout,
              stderr: agentRun.stderr
            }, null, 2),
            metadata: {
              branchName: workspace.branchName
            }
          });

          const validationEvidence: Record<string, unknown> = {
            reportId: report.id,
            replayStatus: typeof replayContext === 'object' && replayContext !== null && 'status' in replayContext
              ? replayContext.status
              : null,
            artifactCount: artifactContext.length,
            acceptanceCriteria: task.acceptanceCriteria,
            agentRunner: {
              configured: Boolean(config.AGENT_EXECUTION_COMMAND),
              command: config.AGENT_EXECUTION_COMMAND ?? null
            }
          };

          let validationLog: string | undefined;
          let commandValidationStatus: 'not-run' | 'passed' | 'failed' = 'not-run';
          if (agentRun.output.validationCommand) {
            const validationResult = await runCommand('/bin/sh', ['-lc', agentRun.output.validationCommand], {
              cwd: workspace.worktreePath,
              timeoutMs: config.AGENT_EXECUTION_TIMEOUT_SECONDS * 1000
            });
            validationLog = [
              `$ ${agentRun.output.validationCommand}`,
              '',
              validationResult.stdout,
              validationResult.stderr
            ].filter(Boolean).join('\n');
            commandValidationStatus = validationResult.code === 0 ? 'passed' : 'failed';
            validationEvidence.validation = {
              status: commandValidationStatus,
              command: agentRun.output.validationCommand,
              exitCode: validationResult.code
            };
          }

          if (validationLog) {
            await persistExecutionTextArtifact({
              artifacts: artifactBundleRepository,
              artifactStore: artifactStorage.store,
              reportId: report.id,
              executionId,
              taskId: task.id,
              artifactType: 'agent-validation',
              fileName: 'validation.log',
              content: validationLog,
              metadata: {
                status: commandValidationStatus
              }
            });
          }

          let replayValidationStatus: 'not-run' | 'passed' | 'failed' = 'not-run';
          if (agentRun.output.replayValidation?.enabled) {
            const replayValidation = await runReplayValidation({
              reportId: report.id,
              artifactStore: artifactStorage.store,
              artifacts: artifactBundleRepository,
              replayRuns: replayRunRepository,
              expectation: agentRun.output.replayValidation.expectation,
              ...(agentRun.output.replayValidation.baseUrl ? { baseUrl: agentRun.output.replayValidation.baseUrl } : {})
            });
            replayValidationStatus = replayValidation.passed ? 'passed' : 'failed';
            validationEvidence.replayValidation = {
              status: replayValidationStatus,
              ...replayValidation.summary
            };
            validationEvidence.validationPolicy = replayValidation.policy;

            await agentTaskReplayValidationRepository.upsert({
              id: randomUUID(),
              agentTaskExecutionId: executionId,
              replayRunId: replayValidation.replayRunId,
              status: replayValidationStatus,
              expectation: agentRun.output.replayValidation.expectation,
              baselineSummary: replayValidation.baselineSummary,
              postChangeSummary: replayValidation.summary,
              ...(replayValidation.baselineStatus ? { baselineStatus: replayValidation.baselineStatus as 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed' } : {}),
              ...(replayValidation.actualStatus ? { actualStatus: replayValidation.actualStatus } : {}),
              ...(agentRun.output.replayValidation.baseUrl ? { targetOrigin: agentRun.output.replayValidation.baseUrl } : {})
            });

            await agentTaskValidationPolicyRepository.upsert({
              id: randomUUID(),
              agentTaskExecutionId: executionId,
              policyName: replayValidation.policy.policyName,
              status: replayValidation.policy.status,
              baselineRequirement: replayValidation.policy.baselineRequirement,
              outcomeRequirement: replayValidation.policy.outcomeRequirement,
              baselineRequirementMet: replayValidation.policy.baselineRequirementMet,
              outcomeRequirementMet: replayValidation.policy.outcomeRequirementMet,
              details: replayValidation.summary
            });

            await persistExecutionTextArtifact({
              artifacts: artifactBundleRepository,
              artifactStore: artifactStorage.store,
              reportId: report.id,
              executionId,
              taskId: task.id,
              artifactType: 'agent-replay-validation',
              fileName: 'replay-validation.json',
              content: JSON.stringify(replayValidation.summary, null, 2),
              metadata: {
                status: replayValidationStatus,
                expectation: agentRun.output.replayValidation.expectation,
                baseUrl: agentRun.output.replayValidation.baseUrl ?? null
              }
            });

            await persistExecutionTextArtifact({
              artifacts: artifactBundleRepository,
              artifactStore: artifactStorage.store,
              reportId: report.id,
              executionId,
              taskId: task.id,
              artifactType: 'agent-validation-policy',
              fileName: 'validation-policy.json',
              content: JSON.stringify(replayValidation.policy, null, 2),
              metadata: {
                status: replayValidation.policy.status,
                policyName: replayValidation.policy.policyName
              }
            });
          }

          const requestedValidations = [commandValidationStatus, replayValidationStatus].filter((status) => status !== 'not-run');
          const aggregateValidationStatus: 'not-run' | 'passed' | 'failed' = requestedValidations.length === 0
            ? 'not-run'
            : requestedValidations.every((status) => status === 'passed')
              ? 'passed'
              : 'failed';

          const initialStatus = await runGit(workspace.worktreePath, ['status', '--short'], undefined);
          const hasChanges = initialStatus.stdout.trim().length > 0;
          let patchSummary = agentRun.output.summary;
          let commitSha: string | undefined;
          let pullRequestUrl: string | undefined;
          let finalStatus: StoredAgentTaskExecution['status'] = 'completed';

          if (hasChanges) {
            await runCommand('git', ['-C', workspace.worktreePath, 'add', '-A'], {
              cwd: workspace.worktreePath
            });

            const diffResult = await runCommand('git', ['-C', workspace.worktreePath, 'diff', '--cached', '--binary', '--no-ext-diff'], {
              cwd: workspace.worktreePath
            });
            const diffStatResult = await runCommand('git', ['-C', workspace.worktreePath, 'diff', '--cached', '--stat', '--no-ext-diff'], {
              cwd: workspace.worktreePath
            });
            patchSummary = diffStatResult.stdout || agentRun.output.summary;

            await persistExecutionTextArtifact({
              artifacts: artifactBundleRepository,
              artifactStore: artifactStorage.store,
              reportId: report.id,
              executionId,
              taskId: task.id,
              artifactType: 'agent-diff',
              fileName: 'changes.diff',
              content: diffResult.stdout,
              metadata: {
                branchName: workspace.branchName,
                diffStat: diffStatResult.stdout
              }
            });

            await runCommand('git', ['-C', workspace.worktreePath, 'commit', '-m', `nexus: ${task.title}`], {
              cwd: workspace.worktreePath,
              env: {
                GIT_AUTHOR_NAME: 'Nexus Agent',
                GIT_AUTHOR_EMAIL: 'nexus-agent@example.local',
                GIT_COMMITTER_NAME: 'Nexus Agent',
                GIT_COMMITTER_EMAIL: 'nexus-agent@example.local'
              }
            });

            const headResult = await runCommand('git', ['-C', workspace.worktreePath, 'rev-parse', 'HEAD'], {
              cwd: workspace.worktreePath
            });
            commitSha = headResult.stdout;
            validationEvidence.commitSha = commitSha;

            finalStatus = aggregateValidationStatus === 'passed' ? 'validated' : 'changes-generated';

            await agentTaskExecutionReviewRepository.upsert({
              id: randomUUID(),
              agentTaskExecutionId: executionId,
              status: 'pending'
            });

            validationEvidence.reviewGate = {
              required: true,
              status: 'pending'
            };

            if (aggregateValidationStatus !== 'failed' && workspace.baseBranch && github.enabled && isGitHubRepository(task.targetRepository)) {
              validationEvidence.pullRequest = {
                status: 'blocked-awaiting-approval'
              };
            }
          }

          const findings = [
            `Prepared isolated git worktree on branch ${workspace.branchName}.`,
            ...(workspace.baseBranch ? [`Base branch: ${workspace.baseBranch}.`] : ['Target repository has no commits yet; prepared an orphan worktree branch.']),
            `Execution mode: ${task.executionMode}.`,
            ...(replayContext ? ['Replay context is attached to the execution bundle.'] : []),
            ...(artifactContext.length > 0 ? [`${artifactContext.length} artifacts are linked into the execution bundle.`] : []),
            ...agentRun.output.findings,
            ...(hasChanges ? ['Agent execution produced code changes in the worktree.'] : ['Agent execution did not modify repository files.'])
          ];

          const completedAt = new Date().toISOString();
          const resultSummary = {
            outcome: finalStatus === 'validated'
                ? 'validated'
                : hasChanges
                  ? 'fix-proposed'
                  : 'workspace-prepared',
            nextAction: hasChanges && aggregateValidationStatus !== 'failed'
                ? 'await-human-approval-before-pr'
              : hasChanges
                ? 'review-agent-output'
                : 'handoff-to-coding-agent',
            targetRepository: task.targetRepository,
            branchName: workspace.branchName,
            ...(workspace.baseBranch ? { baseBranch: workspace.baseBranch } : { repositoryState: 'empty' }),
            ...(commitSha ? { commitSha } : {}),
            ...(pullRequestUrl ? { pullRequestUrl } : {}),
            validationStatus: aggregateValidationStatus
          };

          const completedExecution: StoredAgentTaskExecution = {
            ...execution,
            status: finalStatus,
            branchName: workspace.branchName,
            worktreePath: workspace.worktreePath,
            resultSummary,
            findings,
            patchSummary,
            validationEvidence,
            startedAt,
            completedAt,
            ...(pullRequestUrl ? { pullRequestUrl } : {})
          };
          if (workspace.baseBranch) {
            completedExecution.baseBranch = workspace.baseBranch;
          }
          await agentTaskExecutionRepository.update(completedExecution);
          await agentTaskRepository.updateStatus(task.id, 'completed', {
            preparedContext: {
              ...task.preparedContext,
              execution: {
                executionId,
                branchName: workspace.branchName,
                worktreePath: workspace.worktreePath,
                resultSummary,
                validationEvidence,
                ...(workspace.baseBranch ? { baseBranch: workspace.baseBranch } : {})
              }
            }
          });
          await triageJobRepository.updateStatus(job.id, 'completed');

          console.log(JSON.stringify({
            message: 'agent execution completed',
            jobId: job.id,
            agentTaskId: task.id,
            executionId,
            branchName: workspace.branchName,
            worktreePath: workspace.worktreePath,
            status: finalStatus,
            pullRequestUrl
          }));

          return;
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : 'unknown agent execution failure';
          await agentTaskExecutionRepository.update({
            ...execution,
            status: 'failed',
            resultSummary: execution.resultSummary,
            findings: execution.findings,
            validationEvidence: execution.validationEvidence,
            failureReason,
            startedAt,
            completedAt: new Date().toISOString()
          });
          await agentTaskRepository.updateStatus(task.id, 'failed', {
            preparedContext: task.preparedContext,
            failureReason
          });
          throw error;
        }
      }

      const report = await feedbackRepository.findById(job.data.reportId);

      if (!report) {
        throw new Error(`missing feedback report ${job.data.reportId}`);
      }

      await feedbackRepository.updateStatus(report.id, 'triaged');

      const embedding = await feedbackReportEmbeddingRepository.findByReportId(report.id);
      const draftRepository = await githubIssueLinkRepository.findByReportId(report.id);
      const refinedImpact = await resolveRefinedImpactAssessment({
        report,
        ...(draftRepository?.repository ? { repository: draftRepository.repository } : {}),
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
        } : {}),
        loadIssueLinkByReportId: (linkedReportId) => githubIssueLinkRepository.findByReportId(linkedReportId),
        loadTasksByReportId: (linkedReportId) => agentTaskRepository.findByReportId(linkedReportId),
        loadExecutionsByTaskId: (agentTaskId) => agentTaskExecutionRepository.findByTaskId(agentTaskId),
        loadPullRequestByExecutionId: (executionId) => agentTaskExecutionPullRequestRepository.findByExecutionId(executionId)
      });
      const enrichedPayload = {
        ...report.payload,
        impactScore: refinedImpact.score,
        impactAssessment: refinedImpact
      };
      await feedbackRepository.updatePayload(report.id, enrichedPayload);
      await triageJobRepository.updatePriorityAndPayload(job.id, refinedImpact.score, {
        ...job.data.payload,
        impactScore: refinedImpact.score,
        impactAssessment: refinedImpact
      });

      const enrichedReport = {
        ...report,
        payload: enrichedPayload
      };

      const draft = createIssueDraft(enrichedReport);
      let issueNumber: number | undefined;
      let issueUrl: string | undefined;
      let state: 'local-draft' | 'synced' | 'sync-failed' = 'local-draft';

      if (github.enabled) {
        try {
          const created = await github.createIssueDraft(draft);
          issueNumber = created.number;
          issueUrl = created.url;
          state = 'synced';
        } catch (error) {
          state = 'sync-failed';
          console.error('failed to sync GitHub draft', error);
        }
      }

      await githubIssueLinkRepository.upsert({
        id: randomUUID(),
        feedbackReportId: report.id,
        repository: github.repository || 'local-only',
        draftTitle: draft.title,
        draftBody: draft.body,
        draftLabels: draft.labels,
        state,
        ...(issueNumber ? { issueNumber } : {}),
        ...(issueUrl ? { issueUrl } : {})
      });

      await feedbackRepository.updateStatus(report.id, 'drafted');
      await triageJobRepository.updateStatus(job.id, 'completed');

      console.log(JSON.stringify({
        message: 'triage job completed',
        jobId: job.id,
        reportId: report.id,
        source: report.source,
        impactScore: refinedImpact.score,
        issueState: state,
        issueNumber,
        issueUrl
      }));
    },
    {
      connection: bullConnection
    }
  );

  worker.on('failed', async (job, error) => {
    if (job?.id) {
      await triageJobRepository.updateStatus(job.id, 'failed');
    }
    console.error('triage worker job failed', error);
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await redis.quit();
    await database.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();