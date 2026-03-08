import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveReportHistory } from '../../services/reports/report-history.js';
import { resolveOwnershipCandidates } from '../../services/reports/ownership-candidates.js';
import { resolveSimilarReports } from '../../services/reports/similar-reports.js';
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

  app.get('/internal/reports/:reportId/ownership', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const embedding = await app.reportEmbeddings.findByReportId(reportId);
    const draft = await app.githubIssueLinks.findByReportId(reportId);
    const ownership = await resolveOwnershipCandidates({
      report,
      ...(draft?.repository ? { repository: draft.repository } : {}),
      ...(embedding ? {
        embedding: embedding.embedding,
        loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
        loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
      } : {})
    });

    return {
      reportId,
      candidates: ownership.candidates,
      neighbors: ownership.neighbors
    };
  });

  app.get('/internal/reports/:reportId/similar', async (request) => {
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

    const similar = await resolveSimilarReports({
      report,
      embedding: embedding.embedding,
      loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
      loadReportById: (neighborReportId) => app.reports.findById(neighborReportId),
      loadIssueLinkByReportId: (neighborReportId) => app.githubIssueLinks.findByReportId(neighborReportId)
    });

    return {
      reportId,
      candidates: similar.candidates
    };
  });

  app.get('/internal/reports/:reportId/history', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const embedding = await app.reportEmbeddings.findByReportId(reportId);
    const history = await resolveReportHistory({
      report,
      ...(embedding ? {
        embedding: embedding.embedding,
        loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
        loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
      } : {}),
      loadIssueLinkByReportId: (linkedReportId) => app.githubIssueLinks.findByReportId(linkedReportId),
      loadTasksByReportId: (linkedReportId) => app.agentTasks.findByReportId(linkedReportId),
      loadExecutionsByTaskId: (agentTaskId) => app.agentTaskExecutions.findByTaskId(agentTaskId),
      loadPullRequestByExecutionId: (executionId) => app.agentTaskExecutionPullRequests.findByExecutionId(executionId)
    });

    return {
      reportId,
      ...history
    };
  });
}