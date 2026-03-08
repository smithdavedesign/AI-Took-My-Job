import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { createGitHubIntegration, type GitHubIntegration } from './integrations/github/client.js';
import { createAuditRepository, type AuditRepository } from './repositories/audit-repository.js';
import { createFeedbackRepository, type FeedbackRepository } from './repositories/feedback-repository.js';
import { createGitHubIssueLinkRepository, type GitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createTriageJobRepository, type TriageJobRepository } from './repositories/triage-job-repository.js';
import { loadConfig, type AppConfig } from './support/config.js';
import { createDatabaseClient, type DatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerInternalRoutes } from './routes/internal/index.js';
import { registerWebhookRoutes } from './routes/webhooks/index.js';
import { createAuditLogger, type AuditLogger } from './support/audit-log.js';
import { createJobPublisher, type JobPublisher } from './support/job-publisher.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: DatabaseClient;
    redis: Redis;
    reports: FeedbackRepository;
    githubIssueLinks: GitHubIssueLinkRepository;
    auditRepository: AuditRepository;
    triageJobs: TriageJobRepository;
    audit: AuditLogger;
    jobs: JobPublisher;
    github: GitHubIntegration;
  }
}

function buildLoggerOptions(config: AppConfig): boolean | { level: AppConfig['LOG_LEVEL']; transport?: { target: string; options: { colorize: boolean; translateTime: string } } } {
  if (config.NODE_ENV === 'development') {
    return {
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard'
        }
      }
    };
  }

  return {
    level: config.LOG_LEVEL
  };
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();
  const database = createDatabaseClient(config.DATABASE_URL);
  const redis = createRedisConnection(config.REDIS_URL);
  const bullConnection = createBullConnectionOptions(config.REDIS_URL);
  const feedbackRepository = createFeedbackRepository(database);
  const githubIssueLinkRepository = createGitHubIssueLinkRepository(database);
  const auditRepository = createAuditRepository(database);
  const triageJobRepository = createTriageJobRepository(database);
  const app = Fastify({
    logger: buildLoggerOptions(config),
    bodyLimit: 5 * 1024 * 1024,
    requestIdHeader: 'x-request-id'
  });

  app.decorate('config', config);
  app.decorate('db', database);
  app.decorate('redis', redis);
  app.decorate('reports', feedbackRepository);
  app.decorate('githubIssueLinks', githubIssueLinkRepository);
  app.decorate('auditRepository', auditRepository);
  app.decorate('triageJobs', triageJobRepository);
  app.decorate('audit', createAuditLogger(app.log as FastifyBaseLogger, auditRepository));
  app.decorate('jobs', createJobPublisher(app.log as FastifyBaseLogger, bullConnection, triageJobRepository));
  app.decorate('github', createGitHubIntegration(config));

  await app.register(sensible);
  await app.register(helmet, {
    global: true
  });

  app.addHook('onRequest', async (request) => {
    request.log = request.log.child({
      route: request.routeOptions.url,
      sourceIp: request.ip
    });
  });

  app.addHook('onClose', async () => {
    await app.jobs.close();
    await app.redis.quit();
    await app.db.close();
  });

  registerHealthRoutes(app);
  registerInternalRoutes(app);
  registerWebhookRoutes(app);

  return app;
}