import type { FastifyInstance } from 'fastify';

import { registerGitHubInternalRoutes } from './github.js';

export function registerInternalRoutes(app: FastifyInstance): void {
  registerGitHubInternalRoutes(app);
}