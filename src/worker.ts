import { randomUUID } from 'node:crypto';

import { Queue, Worker } from 'bullmq';

import { createGitHubIntegration } from './integrations/github/client.js';
import { createArtifactBundleRepository } from './repositories/artifact-bundle-repository.js';
import { loadConfig } from './support/config.js';
import { createDatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { createReplayRunRepository } from './repositories/replay-run-repository.js';
import { createFeedbackRepository } from './repositories/feedback-repository.js';
import { createGitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createTriageJobRepository } from './repositories/triage-job-repository.js';
import { createArtifactStore } from './services/artifacts/index.js';
import { buildReplayArtifacts, summarizeReplayPlan } from './services/replay/har-replay-plan.js';
import { executeReplayPlan } from './services/replay/playwright-replay-executor.js';
import { createIssueDraft } from './services/triage/issue-draft.js';

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
  const artifactBundleRepository = createArtifactBundleRepository(database);
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

      const report = await feedbackRepository.findById(job.data.reportId);

      if (!report) {
        throw new Error(`missing feedback report ${job.data.reportId}`);
      }

      await feedbackRepository.updateStatus(report.id, 'triaged');

      const draft = createIssueDraft(report);
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