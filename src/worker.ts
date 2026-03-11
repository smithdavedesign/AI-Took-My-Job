import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { Queue, Worker } from 'bullmq';

import { createGitHubIntegrationResolver } from './integrations/github/client.js';
import { createAgentTaskExecutionRepository } from './repositories/agent-task-execution-repository.js';
import { createAgentTaskExecutionPullRequestRepository } from './repositories/agent-task-execution-pull-request-repository.js';
import { createAgentTaskExecutionReviewRepository } from './repositories/agent-task-execution-review-repository.js';
import { createAgentTaskReplayValidationRepository } from './repositories/agent-task-replay-validation-repository.js';
import { createAgentTaskValidationPolicyRepository } from './repositories/agent-task-validation-policy-repository.js';
import { createArtifactBundleRepository } from './repositories/artifact-bundle-repository.js';
import { createGitHubInstallationRepository } from './repositories/github-installation-repository.js';
import { loadConfig } from './support/config.js';
import { ensureInitialDatabaseSchema } from './support/database-bootstrap.js';
import { createDatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { createReplayRunRepository } from './repositories/replay-run-repository.js';
import { createProjectRepository } from './repositories/project-repository.js';
import { createReportReviewRepository } from './repositories/report-review-repository.js';
import { createRepoConnectionRepository } from './repositories/repo-connection-repository.js';
import { createShadowSuiteRepository } from './repositories/shadow-suite-repository.js';
import { createShadowSuiteRunRepository } from './repositories/shadow-suite-run-repository.js';
import { createFeedbackRepository } from './repositories/feedback-repository.js';
import { createFeedbackReportEmbeddingRepository } from './repositories/feedback-report-embedding-repository.js';
import { createGitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createTriageJobRepository } from './repositories/triage-job-repository.js';
import { createWorkspaceRepository } from './repositories/workspace-repository.js';
import { createWorkspaceTriagePolicyRepository } from './repositories/workspace-triage-policy-repository.js';
import { createArtifactStore } from './services/artifacts/index.js';
import { runConfiguredAgent } from './services/agent-tasks/agent-runner.js';
import { persistExecutionTextArtifact } from './services/agent-tasks/execution-artifacts.js';
import { isGitHubRepository } from './services/agent-tasks/pull-request-promotion.js';
import { classifyReport } from './services/reports/report-classification.js';
import { resolveDuplicateReports } from './services/reports/report-duplicates.js';
import { resolveRefinedImpactAssessment } from './services/reports/report-impact.js';
import { resolveReportHistory } from './services/reports/report-history.js';
import { buildReportIndex } from './services/reports/report-index.js';
import { resolveOwnershipCandidates } from './services/reports/ownership-candidates.js';
import { resolveSimilarReports } from './services/reports/similar-reports.js';
import { runReplayValidation } from './services/agent-tasks/replay-validation.js';
import { prepareRepositoryWorkspace } from './services/agent-tasks/repository-workspace.js';
import { buildReplayArtifacts, summarizeReplayPlan } from './services/replay/har-replay-plan.js';
import { executeReplayPlan } from './services/replay/playwright-replay-executor.js';
import { createIssueDraft } from './services/triage/issue-draft.js';
import { createAgentTaskRepository } from './repositories/agent-task-repository.js';
import type { StoredAgentTaskExecution } from './types/agent-tasks.js';
import { resolveWorkspaceTriagePolicyForReport } from './services/reports/triage-policy.js';

function logWorker(level: 'info' | 'error', message: string, payload: Record<string, unknown> = {}): void {
  const entry = {
    service: 'nexus-worker',
    level,
    message,
    timestamp: new Date().toISOString(),
    ...payload
  };

  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

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

function repositoryChangePathspec(): string[] {
  return ['--', '.', ':(exclude).nexus', ':(exclude).nexus/**'];
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
  const workspaceRepository = createWorkspaceRepository(database);
  const projectRepository = createProjectRepository(database);
  const githubInstallationRepository = createGitHubInstallationRepository(database);
  const repoConnectionRepository = createRepoConnectionRepository(database);
  const workspaceTriagePolicyRepository = createWorkspaceTriagePolicyRepository(database);
  const reportReviewRepository = createReportReviewRepository(database);
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
  const shadowSuiteRepository = createShadowSuiteRepository(database);
  const shadowSuiteRunRepository = createShadowSuiteRunRepository(database);
  const triageJobRepository = createTriageJobRepository(database);
  const artifactStorage = createArtifactStore(config);
  const githubResolver = createGitHubIntegrationResolver({
    config,
    projects: projectRepository,
    repoConnections: repoConnectionRepository,
    githubInstallations: githubInstallationRepository
  });
  const queue = new Queue('triage', {
    connection: bullConnection
  });

  await ensureInitialDatabaseSchema(database);
  await workspaceTriagePolicyRepository.ensureSchema();

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
          const localStorageSnapshot = localStorageArtifact ? await readJsonArtifact(artifactStorage.store, localStorageArtifact.storageKey) : {};
          const sessionStorageSnapshot = sessionStorageArtifact ? await readJsonArtifact(artifactStorage.store, sessionStorageArtifact.storageKey) : {};
          const storageState = {
            localStorageKeys: Object.keys(localStorageSnapshot),
            sessionStorageKeys: Object.keys(sessionStorageSnapshot)
          };
          const builtReplay = buildReplayArtifacts(harText, storageState);
          const execution = await executeReplayPlan({
            plan: builtReplay.plan,
            steps: builtReplay.executionSteps,
            storageSnapshot: {
              localStorage: Object.fromEntries(Object.entries(localStorageSnapshot).map(([key, value]) => [key, String(value)])),
              sessionStorage: Object.fromEntries(Object.entries(sessionStorageSnapshot).map(([key, value]) => [key, String(value)]))
            }
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

          logWorker('info', 'replay job completed', {
            jobId: job.id,
            reportId: report.id,
            replayRunId,
            requestCount: replayPlan.requestCount,
            executionStatus: execution.status
          });

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
          const classification = classifyReport(report);
          const policy = await resolveWorkspaceTriagePolicyForReport({
            report,
            projects: projectRepository,
            workspaceTriagePolicies: workspaceTriagePolicyRepository
          });
          const ownership = await resolveOwnershipCandidates({
            report,
            ...(draft?.repository ? { repository: draft.repository } : {}),
            ...(policy ? { policy } : {}),
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
          const duplicates = await resolveDuplicateReports({
            report,
            ...(embedding ? {
              embedding: embedding.embedding,
              loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
              loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
            } : {}),
            loadIssueLinkByReportId: (neighborReportId) => githubIssueLinkRepository.findByReportId(neighborReportId)
          });
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
            ...(policy ? { policy } : {}),
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
            classification,
            duplicates,
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
            triagePolicy: policy,
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

          logWorker('info', 'agent task prepared', {
            jobId: job.id,
            agentTaskId,
            reportId: report.id,
            hasDraft: Boolean(draft),
            hasReplay: Boolean(replay),
            artifactCount: artifacts.length
          });

          return;
        } catch (error) {
          await agentTaskRepository.updateStatus(agentTaskId, 'failed', {
            failureReason: error instanceof Error ? error.message : 'unknown agent task preparation failure'
          });
          throw error;
        }
      }

      if (job.name === 'shadow-suite-run' || job.data.type === 'shadow-suite-run') {
        const shadowSuiteId = typeof job.data.payload.shadowSuiteId === 'string'
          ? job.data.payload.shadowSuiteId
          : null;
        const shadowSuiteRunId = typeof job.data.payload.shadowSuiteRunId === 'string'
          ? job.data.payload.shadowSuiteRunId
          : null;
        const targetOrigin = typeof job.data.payload.targetOrigin === 'string' && job.data.payload.targetOrigin.length > 0
          ? job.data.payload.targetOrigin
          : null;

        if (!shadowSuiteId || !shadowSuiteRunId) {
          throw new Error('missing shadow suite identifiers in queued payload');
        }

        const suite = await shadowSuiteRepository.findById(shadowSuiteId);
        if (!suite) {
          throw new Error(`missing shadow suite ${shadowSuiteId}`);
        }

        const run = await shadowSuiteRunRepository.findById(shadowSuiteRunId);
        if (!run) {
          throw new Error(`missing shadow suite run ${shadowSuiteRunId}`);
        }

        const report = await feedbackRepository.findById(suite.feedbackReportId);
        if (!report) {
          throw new Error(`missing feedback report ${suite.feedbackReportId}`);
        }

        const effectiveTargetOrigin = targetOrigin ?? suite.targetOrigin ?? null;
        if (!effectiveTargetOrigin) {
          throw new Error(`shadow suite ${shadowSuiteId} has no target origin configured`);
        }

        const baselineReplay = await replayRunRepository.findLatestByReportId(report.id);
        const artifacts = await artifactBundleRepository.findByReportId(report.id);
        const harArtifact = artifacts.find((artifact) => artifact.artifactType === 'har');
        if (!harArtifact) {
          throw new Error(`missing HAR artifact for report ${report.id}`);
        }

        const now = new Date();
        const startedAt = now.toISOString();
        await shadowSuiteRunRepository.update({
          ...run,
          status: 'processing',
          targetOrigin: effectiveTargetOrigin,
          summary: {
            ...run.summary,
            startedAt
          }
        });

        const replayRunId = randomUUID();
        await replayRunRepository.create({
          id: replayRunId,
          feedbackReportId: report.id,
          artifactId: harArtifact.id,
          status: 'processing',
          summary: {
            stage: 'shadow-suite-replay',
            shadowSuiteId,
            shadowSuiteRunId,
            targetOrigin: effectiveTargetOrigin
          }
        });

        try {
          const harText = await readStreamToString(await artifactStorage.store.readArtifact(harArtifact.storageKey));
          const localStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'local-storage');
          const sessionStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'session-storage');
          const localStorageSnapshot = localStorageArtifact ? await readJsonArtifact(artifactStorage.store, localStorageArtifact.storageKey) : {};
          const sessionStorageSnapshot = sessionStorageArtifact ? await readJsonArtifact(artifactStorage.store, sessionStorageArtifact.storageKey) : {};
          const storageState = {
            localStorageKeys: Object.keys(localStorageSnapshot),
            sessionStorageKeys: Object.keys(sessionStorageSnapshot)
          };
          const builtReplay = buildReplayArtifacts(harText, storageState);
          const execution = await executeReplayPlan({
            plan: builtReplay.plan,
            steps: builtReplay.executionSteps,
            storageSnapshot: {
              localStorage: Object.fromEntries(Object.entries(localStorageSnapshot).map(([key, value]) => [key, String(value)])),
              sessionStorage: Object.fromEntries(Object.entries(sessionStorageSnapshot).map(([key, value]) => [key, String(value)]))
            },
            targetOrigin: effectiveTargetOrigin
          });
          const replayPlan = {
            ...builtReplay.plan,
            execution
          };
          const summary = summarizeReplayPlan(replayPlan);

          await replayRunRepository.update({
            id: replayRunId,
            feedbackReportId: report.id,
            artifactId: harArtifact.id,
            status: 'completed',
            summary,
            replayPlan
          });

          const passed = execution.status === suite.expectedOutcome;
          const completedAt = new Date().toISOString();
          await shadowSuiteRunRepository.update({
            ...run,
            replayRunId,
            status: passed ? 'passed' : 'failed',
            targetOrigin: effectiveTargetOrigin,
            expectedOutcome: suite.expectedOutcome,
            actualOutcome: execution.status,
            summary: {
              ...summary,
              baselineStatus: baselineReplay?.replayPlan?.execution?.status ?? null,
              expectedOutcome: suite.expectedOutcome,
              actualOutcome: execution.status,
              targetOrigin: effectiveTargetOrigin,
              startedAt,
              completedAt
            }
          });

          await shadowSuiteRepository.update({
            ...suite,
            replayRunId,
            lastRunAt: completedAt,
            nextRunAt: new Date(Date.now() + suite.cadenceSeconds * 1000).toISOString()
          });
          await triageJobRepository.updateStatus(job.id, 'completed');

          logWorker('info', 'shadow suite run completed', {
            jobId: job.id,
            shadowSuiteId,
            shadowSuiteRunId,
            replayRunId,
            expectedOutcome: suite.expectedOutcome,
            actualOutcome: execution.status,
            passed,
            targetOrigin: effectiveTargetOrigin
          });

          return;
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : 'unknown shadow suite replay failure';
          await replayRunRepository.update({
            id: replayRunId,
            feedbackReportId: report.id,
            artifactId: harArtifact.id,
            status: 'failed',
            summary: {
              stage: 'shadow-suite-failed',
              shadowSuiteId,
              shadowSuiteRunId,
              targetOrigin: effectiveTargetOrigin
            },
            failureReason
          });
          await shadowSuiteRunRepository.update({
            ...run,
            replayRunId,
            status: 'failed',
            targetOrigin: effectiveTargetOrigin,
            expectedOutcome: suite.expectedOutcome,
            summary: {
              ...run.summary,
              startedAt,
              targetOrigin: effectiveTargetOrigin
            },
            failureReason
          });
          await shadowSuiteRepository.update({
            ...suite,
            lastRunAt: new Date().toISOString(),
            nextRunAt: new Date(Date.now() + suite.cadenceSeconds * 1000).toISOString()
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
          const github = await githubResolver.resolve({
            projectId: task.projectId,
            repository: task.targetRepository
          });
          const workspace = await prepareRepositoryWorkspace({
            config,
            targetRepository: task.targetRepository,
            agentTaskId: task.id,
            executionId,
            github
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

          const initialStatus = await runGit(workspace.worktreePath, ['status', '--short', ...repositoryChangePathspec()], undefined);
          const hasChanges = initialStatus.stdout.trim().length > 0;
          let actualChangedFiles: string[] = [];
          if (hasChanges) {
            await runCommand('git', ['-C', workspace.worktreePath, 'add', '-A', ...repositoryChangePathspec()], {
              cwd: workspace.worktreePath
            });

            const changedFilesResult = await runCommand('git', ['-C', workspace.worktreePath, 'diff', '--cached', '--name-only', '--no-ext-diff', ...repositoryChangePathspec()], {
              cwd: workspace.worktreePath
            });
            actualChangedFiles = changedFilesResult.stdout
              .split('\n')
              .map((entry) => entry.trim())
              .filter(Boolean);
          }

          const contractWarnings: string[] = [];
          if (hasChanges && agentRun.output.outcome === 'no-changes') {
            contractWarnings.push('Agent reported no-changes but the worktree contains staged modifications.');
          }

          if (!hasChanges && agentRun.output.outcome === 'changes-made') {
            contractWarnings.push('Agent reported changes-made but the worktree contains no repository changes.');
          }

          if (hasChanges && agentRun.output.changedFiles.length === 0) {
            contractWarnings.push('Agent did not report changedFiles for a modified worktree.');
          }

          const unreportedChangedFiles = actualChangedFiles.filter((filePath) => !agentRun.output.changedFiles.includes(filePath));
          if (unreportedChangedFiles.length > 0) {
            contractWarnings.push(`Agent omitted changed files from the contract: ${unreportedChangedFiles.join(', ')}`);
          }

          const nonExistentReportedFiles = agentRun.output.changedFiles.filter((filePath) => !actualChangedFiles.includes(filePath));
          if (hasChanges && nonExistentReportedFiles.length > 0) {
            contractWarnings.push(`Agent reported changed files that were not present in the staged diff: ${nonExistentReportedFiles.join(', ')}`);
          }

          const contractStatus: 'passed' | 'failed' = contractWarnings.length === 0 ? 'passed' : 'failed';
          validationEvidence.agentOutputContract = {
            contractVersion: agentRun.output.contractVersion,
            reportedOutcome: agentRun.output.outcome,
            reportedChangedFiles: agentRun.output.changedFiles,
            actualChangedFiles,
            status: contractStatus,
            warnings: contractWarnings
          };

          let patchSummary = agentRun.output.summary;
          let commitSha: string | undefined;
          let pullRequestUrl: string | undefined;
          let finalStatus: StoredAgentTaskExecution['status'] = 'completed';

          if (hasChanges) {
            const diffResult = await runCommand('git', ['-C', workspace.worktreePath, 'diff', '--cached', '--binary', '--no-ext-diff', ...repositoryChangePathspec()], {
              cwd: workspace.worktreePath
            });
            const diffStatResult = await runCommand('git', ['-C', workspace.worktreePath, 'diff', '--cached', '--stat', '--no-ext-diff', ...repositoryChangePathspec()], {
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

            finalStatus = aggregateValidationStatus === 'passed' && contractStatus === 'passed' ? 'validated' : 'changes-generated';

            await agentTaskExecutionReviewRepository.upsert({
              id: randomUUID(),
              agentTaskExecutionId: executionId,
              status: 'pending'
            });

            validationEvidence.reviewGate = {
              required: true,
              status: 'pending'
            };

            if (aggregateValidationStatus !== 'failed' && contractStatus !== 'failed' && workspace.baseBranch && github.enabled && isGitHubRepository(task.targetRepository)) {
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
            ...contractWarnings.map((warning) => `Agent output contract warning: ${warning}`),
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
            validationStatus: aggregateValidationStatus,
            contractStatus
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

          logWorker('info', 'agent execution completed', {
            jobId: job.id,
            agentTaskId: task.id,
            executionId,
            branchName: workspace.branchName,
            worktreePath: workspace.worktreePath,
            status: finalStatus,
            pullRequestUrl
          });

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

      const embedding = await feedbackReportEmbeddingRepository.findByReportId(report.id);
      const classification = classifyReport(report);
      const policy = await resolveWorkspaceTriagePolicyForReport({
        report,
        projects: projectRepository,
        workspaceTriagePolicies: workspaceTriagePolicyRepository
      });
      const duplicates = await resolveDuplicateReports({
        report,
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => feedbackReportEmbeddingRepository.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => feedbackRepository.findById(neighborReportId)
        } : {}),
        loadIssueLinkByReportId: (neighborReportId) => githubIssueLinkRepository.findByReportId(neighborReportId)
      });

      await feedbackRepository.updateStatus(report.id, 'triaged');

      const draftRepository = await githubIssueLinkRepository.findByReportId(report.id);
      const refinedImpact = await resolveRefinedImpactAssessment({
        report,
        ...(draftRepository?.repository ? { repository: draftRepository.repository } : {}),
        ...(policy ? { policy } : {}),
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
        classification,
        duplicates,
        reportIndex: buildReportIndex(report),
        impactScore: refinedImpact.score,
        impactAssessment: refinedImpact,
        triagePolicy: policy
      };
      await feedbackRepository.updatePayload(report.id, enrichedPayload);
      await triageJobRepository.updatePriorityAndPayload(job.id, refinedImpact.score, {
        ...job.data.payload,
        classification,
        duplicates,
        impactScore: refinedImpact.score,
        impactAssessment: refinedImpact
      });

      const enrichedReport = {
        ...report,
        payload: enrichedPayload
      };

      const draft = createIssueDraft(enrichedReport);
      const github = await githubResolver.resolve({
        projectId: report.projectId
      });
      let issueNumber: number | undefined;
      let issueUrl: string | undefined;
      let state: 'local-draft' | 'awaiting-review' | 'synced' | 'sync-failed' = 'local-draft';
      const duplicateIssue = duplicates.candidates.find((candidate) => candidate.confidence === 'high' && candidate.issueUrl);

      if (duplicateIssue?.issueUrl) {
        issueNumber = duplicateIssue.issueNumber;
        issueUrl = duplicateIssue.issueUrl;
        state = 'synced';
      } else if (report.source === 'hosted-feedback') {
        state = 'awaiting-review';
        await reportReviewRepository.upsert({
          id: randomUUID(),
          feedbackReportId: report.id,
          status: 'pending'
        });
      } else if (github.enabled) {
        try {
          const created = await github.createIssueDraft(draft);
          issueNumber = created.number;
          issueUrl = created.url;
          state = 'synced';
        } catch (error) {
          state = 'sync-failed';
          logWorker('error', 'failed to sync GitHub draft', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      await githubIssueLinkRepository.upsert({
        id: randomUUID(),
        feedbackReportId: report.id,
        repository: duplicateIssue?.repository ?? (github.repository || 'local-only'),
        draftTitle: draft.title,
        draftBody: draft.body,
        draftLabels: draft.labels,
        state,
        ...(issueNumber ? { issueNumber } : {}),
        ...(issueUrl ? { issueUrl } : {})
      });

      await feedbackRepository.updateStatus(report.id, state === 'awaiting-review' ? 'awaiting-review' : 'drafted');
      await triageJobRepository.updateStatus(job.id, 'completed');

      logWorker('info', 'triage job completed', {
        jobId: job.id,
        reportId: report.id,
        source: report.source,
        impactScore: refinedImpact.score,
        duplicateLinked: Boolean(duplicateIssue?.issueUrl),
        issueState: state,
        issueNumber,
        issueUrl
      });
    },
    {
      connection: bullConnection
    }
  );

  worker.on('failed', async (job, error) => {
    if (job?.id) {
      await triageJobRepository.updateStatus(job.id, 'failed');
    }
    logWorker('error', 'triage worker job failed', {
      jobId: job?.id ?? null,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  const shutdown = async () => {
    logWorker('info', 'worker shutdown requested');
    await worker.close();
    await queue.close();
    await redis.quit();
    await database.close();
    process.exit(0);
  };

  logWorker('info', 'worker started');
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();