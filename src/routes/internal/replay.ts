import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';

export function registerReplayInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/reports/:reportId/replay', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const paramsSchema = z.object({
      reportId: z.string().uuid()
    });

    const { reportId } = paramsSchema.parse(request.params);
    const replay = await app.replayRuns.findLatestByReportId(reportId);

    if (!replay) {
      throw app.httpErrors.notFound('replay not found');
    }

    return replay;
  });
}