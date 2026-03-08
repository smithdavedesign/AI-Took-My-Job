import type { FastifyInstance } from 'fastify';

import { registerProjectPublicRoutes } from './projects.js';

export function registerPublicRoutes(app: FastifyInstance): void {
  registerProjectPublicRoutes(app);
}