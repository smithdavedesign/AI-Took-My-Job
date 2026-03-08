import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'nexus-gateway',
      timestamp: new Date().toISOString(),
      environment: app.config.NODE_ENV,
      artifactStorageProvider: app.artifactStoreMetadata.provider,
      artifactStorageLocation: app.artifactStoreMetadata.location,
      githubAuthMode: app.github.mode,
      githubDraftSyncEnabled: app.github.enabled
    };
  });
}