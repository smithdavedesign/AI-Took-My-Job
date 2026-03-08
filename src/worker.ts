import { randomUUID } from 'node:crypto';

import { Worker } from 'bullmq';

import { createGitHubIntegration } from './integrations/github/client.js';
import { loadConfig } from './support/config.js';
import { createDatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { createFeedbackRepository } from './repositories/feedback-repository.js';
import { createGitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createTriageJobRepository } from './repositories/triage-job-repository.js';
import { createIssueDraft } from './services/triage/issue-draft.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisConnection(config.REDIS_URL);
  const bullConnection = createBullConnectionOptions(config.REDIS_URL);
  const feedbackRepository = createFeedbackRepository(database);
  const githubIssueLinkRepository = createGitHubIssueLinkRepository(database);
  const triageJobRepository = createTriageJobRepository(database);
  const github = createGitHubIntegration(config);

  const worker = new Worker(
    'triage',
    async (job) => {
      if (!job.id) {
        throw new Error('missing Bull job id');
      }

      await triageJobRepository.updateStatus(job.id, 'processing');

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
    await redis.quit();
    await database.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();