import { Queue } from 'bullmq';
import type { FastifyBaseLogger } from 'fastify';
import { randomUUID } from 'node:crypto';

import type { TriageJobRepository } from '../repositories/triage-job-repository.js';
import type { BullConnectionOptions } from './redis.js';

export interface QueuedJob {
  type: 'triage' | 'replay' | 'agent-task' | 'agent-execution';
  reportId: string;
  source: string;
  priority: number;
  payload: Record<string, unknown>;
}

export interface JobPublisher {
  enqueue(job: QueuedJob): Promise<{ jobId: string }>;
  close(): Promise<void>;
}

export function createJobPublisher(
  logger: FastifyBaseLogger,
  connection: BullConnectionOptions,
  repository: TriageJobRepository
): JobPublisher {
  const queue = new Queue('triage', {
    connection
  });

  return {
    async enqueue(job) {
      const jobId = randomUUID();

      await repository.create({
        id: jobId,
        reportId: job.reportId,
        jobType: job.type,
        status: 'queued',
        priority: job.priority,
        payload: job.payload
      });

      await queue.add(job.type, job, {
        jobId,
        priority: job.priority,
        removeOnComplete: 100,
        removeOnFail: 100
      });

      logger.info({ jobId, ...job }, 'queued job');
      return { jobId };
    },
    async close() {
      await queue.close();
    }
  };
}