import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';

import { createGitHubIntegrationResolver, type GitHubIntegrationResolver } from './integrations/github/client.js';
import { createAuditRepository, type AuditRepository } from './repositories/audit-repository.js';
import { createAgentTaskRepository, type AgentTaskRepository } from './repositories/agent-task-repository.js';
import { createAgentTaskExecutionRepository, type AgentTaskExecutionRepository } from './repositories/agent-task-execution-repository.js';
import { createAgentTaskExecutionPullRequestRepository, type AgentTaskExecutionPullRequestRepository } from './repositories/agent-task-execution-pull-request-repository.js';
import { createAgentTaskExecutionReviewRepository, type AgentTaskExecutionReviewRepository } from './repositories/agent-task-execution-review-repository.js';
import { createAgentTaskReplayValidationRepository, type AgentTaskReplayValidationRepository } from './repositories/agent-task-replay-validation-repository.js';
import { createAgentTaskValidationPolicyRepository, type AgentTaskValidationPolicyRepository } from './repositories/agent-task-validation-policy-repository.js';
import { createArtifactBundleRepository, type ArtifactBundleRepository } from './repositories/artifact-bundle-repository.js';
import { createFeedbackReportEmbeddingRepository, type FeedbackReportEmbeddingRepository } from './repositories/feedback-report-embedding-repository.js';
import { createArtifactStore } from './services/artifacts/index.js';
import type { ArtifactStore, ArtifactStoreMetadata } from './services/artifacts/artifact-store.js';
import { createFeedbackRepository, type FeedbackRepository } from './repositories/feedback-repository.js';
import { createGitHubInstallationRepository, type GitHubInstallationRepository } from './repositories/github-installation-repository.js';
import { createGitHubIssueLinkRepository, type GitHubIssueLinkRepository } from './repositories/github-issue-link-repository.js';
import { createProjectRepository, type ProjectRepository } from './repositories/project-repository.js';
import { createReplayRunRepository, type ReplayRunRepository } from './repositories/replay-run-repository.js';
import { createReportReviewRepository, type ReportReviewRepository } from './repositories/report-review-repository.js';
import { createRepoConnectionRepository, type RepoConnectionRepository } from './repositories/repo-connection-repository.js';
import { createShadowSuiteRepository, type ShadowSuiteRepository } from './repositories/shadow-suite-repository.js';
import { createShadowSuiteRunRepository, type ShadowSuiteRunRepository } from './repositories/shadow-suite-run-repository.js';
import { createTriageJobRepository, type TriageJobRepository } from './repositories/triage-job-repository.js';
import { createWorkspaceRepository, type WorkspaceRepository } from './repositories/workspace-repository.js';
import { loadConfig, type AppConfig } from './support/config.js';
import { createDatabaseClient, type DatabaseClient } from './support/database.js';
import { createBullConnectionOptions, createRedisConnection } from './support/redis.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerInternalRoutes } from './routes/internal/index.js';
import { registerLearnRoutes } from './routes/learn.js';
import { registerPublicRoutes } from './routes/public/index.js';
import { registerWebhookRoutes } from './routes/webhooks/index.js';
import { createAuditLogger, type AuditLogger } from './support/audit-log.js';
import { createJobPublisher, type JobPublisher } from './support/job-publisher.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: DatabaseClient;
    redis: Redis;
    reports: FeedbackRepository;
    artifacts: ArtifactBundleRepository;
    artifactStore: ArtifactStore;
    artifactStoreMetadata: ArtifactStoreMetadata;
    replayRuns: ReplayRunRepository;
    shadowSuites: ShadowSuiteRepository;
    shadowSuiteRuns: ShadowSuiteRunRepository;
    agentTasks: AgentTaskRepository;
    agentTaskExecutions: AgentTaskExecutionRepository;
    agentTaskExecutionPullRequests: AgentTaskExecutionPullRequestRepository;
    agentTaskExecutionReviews: AgentTaskExecutionReviewRepository;
    agentTaskReplayValidations: AgentTaskReplayValidationRepository;
    agentTaskValidationPolicies: AgentTaskValidationPolicyRepository;
    reportEmbeddings: FeedbackReportEmbeddingRepository;
    githubIssueLinks: GitHubIssueLinkRepository;
    reportReviews: ReportReviewRepository;
    workspaces: WorkspaceRepository;
    projects: ProjectRepository;
    githubInstallations: GitHubInstallationRepository;
    repoConnections: RepoConnectionRepository;
    auditRepository: AuditRepository;
    triageJobs: TriageJobRepository;
    audit: AuditLogger;
    jobs: JobPublisher;
    github: GitHubIntegrationResolver;
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
  const workspaceRepository = createWorkspaceRepository(database);
  const projectRepository = createProjectRepository(database);
  const githubInstallationRepository = createGitHubInstallationRepository(database);
  const repoConnectionRepository = createRepoConnectionRepository(database);
  const reportReviewRepository = createReportReviewRepository(database);
  const artifactBundleRepository = createArtifactBundleRepository(database);
  const agentTaskRepository = createAgentTaskRepository(database);
  const agentTaskExecutionRepository = createAgentTaskExecutionRepository(database);
  const agentTaskExecutionPullRequestRepository = createAgentTaskExecutionPullRequestRepository(database);
  const agentTaskExecutionReviewRepository = createAgentTaskExecutionReviewRepository(database);
  const agentTaskReplayValidationRepository = createAgentTaskReplayValidationRepository(database);
  const agentTaskValidationPolicyRepository = createAgentTaskValidationPolicyRepository(database);
  const feedbackReportEmbeddingRepository = createFeedbackReportEmbeddingRepository(database);
  const githubIssueLinkRepository = createGitHubIssueLinkRepository(database);
  const replayRunRepository = createReplayRunRepository(database);
  const shadowSuiteRepository = createShadowSuiteRepository(database);
  const shadowSuiteRunRepository = createShadowSuiteRunRepository(database);
  const auditRepository = createAuditRepository(database);
  const triageJobRepository = createTriageJobRepository(database);
  const artifactStorage = createArtifactStore(config);
  const app = Fastify({
    logger: buildLoggerOptions(config),
    bodyLimit: 5 * 1024 * 1024,
    requestIdHeader: 'x-request-id'
  });

  app.decorate('config', config);
  app.decorate('db', database);
  app.decorate('redis', redis);
  app.decorate('reports', feedbackRepository);
  app.decorate('workspaces', workspaceRepository);
  app.decorate('projects', projectRepository);
  app.decorate('githubInstallations', githubInstallationRepository);
  app.decorate('repoConnections', repoConnectionRepository);
  app.decorate('artifacts', artifactBundleRepository);
  app.decorate('agentTasks', agentTaskRepository);
  app.decorate('agentTaskExecutions', agentTaskExecutionRepository);
  app.decorate('agentTaskExecutionPullRequests', agentTaskExecutionPullRequestRepository);
  app.decorate('agentTaskExecutionReviews', agentTaskExecutionReviewRepository);
  app.decorate('agentTaskReplayValidations', agentTaskReplayValidationRepository);
  app.decorate('agentTaskValidationPolicies', agentTaskValidationPolicyRepository);
  app.decorate('reportEmbeddings', feedbackReportEmbeddingRepository);
  app.decorate('artifactStore', artifactStorage.store);
  app.decorate('artifactStoreMetadata', artifactStorage.metadata);
  app.decorate('replayRuns', replayRunRepository);
  app.decorate('shadowSuites', shadowSuiteRepository);
  app.decorate('shadowSuiteRuns', shadowSuiteRunRepository);
  app.decorate('githubIssueLinks', githubIssueLinkRepository);
  app.decorate('reportReviews', reportReviewRepository);
  app.decorate('auditRepository', auditRepository);
  app.decorate('triageJobs', triageJobRepository);
  app.decorate('audit', createAuditLogger(app.log as FastifyBaseLogger, auditRepository));
  app.decorate('jobs', createJobPublisher(app.log as FastifyBaseLogger, bullConnection, triageJobRepository));
  app.decorate('github', createGitHubIntegrationResolver({
    config,
    repoConnections: repoConnectionRepository,
    githubInstallations: githubInstallationRepository
  }));

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
  registerLearnRoutes(app);
  registerArtifactRoutes(app);
  registerInternalRoutes(app);
  registerPublicRoutes(app);
  registerWebhookRoutes(app);

  return app;
}