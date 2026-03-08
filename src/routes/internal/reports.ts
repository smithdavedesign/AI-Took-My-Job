import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { classifyReport } from '../../services/reports/report-classification.js';
import { resolveDuplicateReports } from '../../services/reports/report-duplicates.js';
import { resolveRefinedImpactAssessment } from '../../services/reports/report-impact.js';
import { resolveReportHistory } from '../../services/reports/report-history.js';
import { buildReportIndex, readPersistedReportIndex } from '../../services/reports/report-index.js';
import { resolveOwnershipCandidates } from '../../services/reports/ownership-candidates.js';
import { resolveSimilarReports } from '../../services/reports/similar-reports.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const reportIdParamsSchema = z.object({
  reportId: z.string().uuid()
});

const activeIssuesQuerySchema = z.object({
  service: z.string().min(1).max(255).optional(),
  file: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

function normalizedText(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return JSON.stringify(value).toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function matchesFileNeedle(fileNeedle: string, pathHints: string[], haystack: string): { matched: boolean; matchedPaths: string[] } {
  if (!fileNeedle) {
    return {
      matched: true,
      matchedPaths: []
    };
  }

  const normalizedNeedle = fileNeedle.toLowerCase();
  const pathMatches = pathHints.filter((pathHint) => {
    if (pathHint.includes(normalizedNeedle)) {
      return true;
    }

    const pathSegments = pathHint.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] ?? '';
    return lastSegment === normalizedNeedle || lastSegment.endsWith(`/${normalizedNeedle}`);
  });

  if (pathMatches.length > 0) {
    return {
      matched: true,
      matchedPaths: pathMatches
    };
  }

  return {
    matched: haystack.includes(normalizedNeedle),
    matchedPaths: []
  };
}

function summarizeObservabilityContext(report: { source: string; externalId?: string; reporterIdentifier?: string; payload: Record<string, unknown> }): Record<string, unknown> {
  return {
    provider: report.source,
    externalId: report.externalId ?? null,
    reporterIdentifier: report.reporterIdentifier ?? null,
    owner: typeof report.payload.owner === 'string'
      ? report.payload.owner
      : typeof report.payload.metadata === 'object' && report.payload.metadata !== null && typeof (report.payload.metadata as Record<string, unknown>).owner === 'string'
        ? (report.payload.metadata as Record<string, unknown>).owner
        : null,
    payload: report.payload
  };
}

export function registerReportInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/reports/active-issues', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const query = activeIssuesQuerySchema.parse(request.query);
    const recentReports = await app.reports.listRecent(Math.min((query.limit ?? 20) * 5, 100));
    const serviceNeedle = query.service?.trim().toLowerCase();
    const fileNeedle = query.file?.trim().toLowerCase();
    const items: Array<Record<string, unknown>> = [];

    for (const report of recentReports) {
      const draft = await app.githubIssueLinks.findByReportId(report.id);
      if (!draft) {
        continue;
      }

      const ownership = await resolveOwnershipCandidates({
        report,
        ...(draft.repository ? { repository: draft.repository } : {})
      });

      const haystack = [
        report.title ?? '',
        draft.draftTitle,
        draft.draftBody,
        normalizedText(report.payload)
      ].join('\n').toLowerCase();
      const reportIndex = readPersistedReportIndex(report.payload) ?? buildReportIndex(report);
      const pathHints = uniqueStrings(reportIndex.filePaths);

      if (serviceNeedle) {
        const serviceMatch = ownership.candidates.some((candidate) => candidate.label.toLowerCase().includes(serviceNeedle))
          || reportIndex.services.some((service) => service.includes(serviceNeedle))
          || haystack.includes(serviceNeedle);
        if (!serviceMatch) {
          continue;
        }
      }

      const fileMatch = fileNeedle ? matchesFileNeedle(fileNeedle, pathHints, haystack) : { matched: true, matchedPaths: [] };
      if (!fileMatch.matched) {
        continue;
      }

      items.push({
        reportId: report.id,
        title: report.title ?? draft.draftTitle,
        severity: report.severity,
        source: report.source,
        status: report.status,
        repository: draft.repository,
        issueState: draft.state,
        issueNumber: draft.issueNumber ?? null,
        issueUrl: draft.issueUrl ?? null,
        ownershipCandidates: ownership.candidates,
        reportIndex,
        pathHints,
        matchedPaths: fileMatch.matchedPaths,
        contextPath: `/internal/reports/${report.id}/context`
      });

      if (items.length >= (query.limit ?? 20)) {
        break;
      }
    }

    return {
      filters: {
        service: query.service ?? null,
        file: query.file ?? null,
        limit: query.limit ?? 20
      },
      items
    };
  });

  app.get('/internal/reports/:reportId/context', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const [embedding, draft, artifacts, replay, tasks] = await Promise.all([
      app.reportEmbeddings.findByReportId(reportId),
      app.githubIssueLinks.findByReportId(reportId),
      app.artifacts.findByReportId(reportId),
      app.replayRuns.findLatestByReportId(reportId),
      app.agentTasks.findByReportId(reportId)
    ]);

    const [ownership, similar, duplicates, history, impact, executionsByTask] = await Promise.all([
      resolveOwnershipCandidates({
        report,
        ...(draft?.repository ? { repository: draft.repository } : {}),
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
        } : {})
      }),
      embedding
        ? resolveSimilarReports({
          report,
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => app.reports.findById(neighborReportId),
          loadIssueLinkByReportId: (neighborReportId) => app.githubIssueLinks.findByReportId(neighborReportId)
        })
        : Promise.resolve({ candidates: [] }),
      resolveDuplicateReports({
        report,
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
        } : {}),
        loadIssueLinkByReportId: (linkedReportId) => app.githubIssueLinks.findByReportId(linkedReportId)
      }),
      resolveReportHistory({
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
      }),
      resolveRefinedImpactAssessment({
        report,
        ...(draft?.repository ? { repository: draft.repository } : {}),
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
        } : {}),
        loadIssueLinkByReportId: (linkedReportId) => app.githubIssueLinks.findByReportId(linkedReportId),
        loadTasksByReportId: (linkedReportId) => app.agentTasks.findByReportId(linkedReportId),
        loadExecutionsByTaskId: (agentTaskId) => app.agentTaskExecutions.findByTaskId(agentTaskId),
        loadPullRequestByExecutionId: (executionId) => app.agentTaskExecutionPullRequests.findByExecutionId(executionId)
      }),
      Promise.all(tasks.map(async (task) => ({
        task,
        executions: await app.agentTaskExecutions.findByTaskId(task.id)
      })))
    ]);

    return {
      report: {
        id: report.id,
        source: report.source,
        title: report.title ?? null,
        status: report.status,
        severity: report.severity,
        externalId: report.externalId ?? null,
        reporterIdentifier: report.reporterIdentifier ?? null
      },
      classification: classifyReport(report),
      draft,
      artifacts,
      replay: replay ?? null,
      ownership,
      similarReports: similar,
      duplicates,
      history,
      impact,
      reportIndex: readPersistedReportIndex(report.payload) ?? buildReportIndex(report),
      observabilityContext: summarizeObservabilityContext(report),
      agentTasks: executionsByTask.map((entry) => ({
        id: entry.task.id,
        title: entry.task.title,
        status: entry.task.status,
        executionMode: entry.task.executionMode,
        executions: entry.executions.map((execution) => ({
          id: execution.id,
          status: execution.status,
          pullRequestUrl: execution.pullRequestUrl ?? null,
          resultSummary: execution.resultSummary,
          validationEvidence: execution.validationEvidence,
          startedAt: execution.startedAt ?? null,
          completedAt: execution.completedAt ?? null
        }))
      }))
    };
  });

  app.get('/internal/reports/:reportId/classification', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    return {
      reportId,
      ...classifyReport(report)
    };
  });

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

  app.get('/internal/reports/:reportId/duplicates', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const embedding = await app.reportEmbeddings.findByReportId(reportId);
    const duplicates = await resolveDuplicateReports({
      report,
      ...(embedding ? {
        embedding: embedding.embedding,
        loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
        loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
      } : {}),
      loadIssueLinkByReportId: (linkedReportId) => app.githubIssueLinks.findByReportId(linkedReportId)
    });

    return {
      reportId,
      candidates: duplicates.candidates
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

  app.get('/internal/reports/:reportId/impact', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const embedding = await app.reportEmbeddings.findByReportId(reportId);
    const draft = await app.githubIssueLinks.findByReportId(reportId);
    const impact = await resolveRefinedImpactAssessment({
      report,
      ...(draft?.repository ? { repository: draft.repository } : {}),
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
      ...impact
    };
  });
}