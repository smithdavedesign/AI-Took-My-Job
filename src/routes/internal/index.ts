import type { FastifyInstance } from 'fastify';

import { registerAgentTaskInternalRoutes } from './agent-tasks.js';
import { registerGitHubInternalRoutes } from './github.js';
import { registerReplayInternalRoutes } from './replay.js';

export function registerInternalRoutes(app: FastifyInstance): void {
  registerAgentTaskInternalRoutes(app);
  registerGitHubInternalRoutes(app);
  registerReplayInternalRoutes(app);
}