import type { FastifyInstance } from 'fastify';

import { registerExtensionWebhookRoute } from './extension.js';
import { registerSlackWebhookRoute } from './slack.js';
import { registerObservabilityWebhookRoute } from './observability.js';

export function registerWebhookRoutes(app: FastifyInstance): void {
  registerExtensionWebhookRoute(app);
  registerSlackWebhookRoute(app);
  registerObservabilityWebhookRoute(app);
}