import type { FastifyInstance } from 'fastify';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';
import { registerAgentTaskInternalRoutes } from './agent-tasks.js';
import { registerGitHubInternalRoutes } from './github.js';
import { registerOnboardingInternalRoutes } from './onboarding.js';
import { registerReportInternalRoutes } from './reports.js';
import { registerReplayInternalRoutes } from './replay.js';
import { registerShadowSuiteInternalRoutes } from './shadow-suites.js';

export function registerInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/service-identity/self', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);

    return {
      id: principal.id,
      scopes: principal.scopes,
      source: principal.source ?? null,
      metadata: principal.metadata ?? null
    };
  });

  registerAgentTaskInternalRoutes(app);
  registerGitHubInternalRoutes(app);
  registerOnboardingInternalRoutes(app);
  registerReportInternalRoutes(app);
  registerReplayInternalRoutes(app);
  registerShadowSuiteInternalRoutes(app);
}