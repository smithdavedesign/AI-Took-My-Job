import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const reportIdParamsSchema = z.object({
  reportId: z.string().uuid()
});

export function registerReportInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/reports/:reportId/embedding', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const embedding = await app.reportEmbeddings.findByReportId(reportId);
    if (!embedding) {
      throw app.httpErrors.notFound('report embedding not found');
    }

    return {
      id: embedding.id,
      feedbackReportId: embedding.feedbackReportId,
      model: embedding.model,
      sourceText: embedding.sourceText,
      dimensions: embedding.embedding.length
    };
  });
}