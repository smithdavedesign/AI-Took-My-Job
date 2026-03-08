import type { FastifyInstance } from 'fastify';

import { registerGitHubInternalRoutes } from './github.js';
import { registerReplayInternalRoutes } from './replay.js';

export function registerInternalRoutes(app: FastifyInstance): void {
  registerGitHubInternalRoutes(app);
  registerReplayInternalRoutes(app);
}