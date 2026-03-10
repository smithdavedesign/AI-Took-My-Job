import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { classifyReport } from '../../services/reports/report-classification.js';
import { buildDeveloperSummary } from '../../services/reports/developer-summary.js';
import { resolveDuplicateReports } from '../../services/reports/report-duplicates.js';
import { resolveRefinedImpactAssessment } from '../../services/reports/report-impact.js';
import { resolveReportHistory } from '../../services/reports/report-history.js';
import { buildReportIndex, readPersistedReportIndex } from '../../services/reports/report-index.js';
import { resolveOwnershipCandidates } from '../../services/reports/ownership-candidates.js';
import { resolveSimilarReports } from '../../services/reports/similar-reports.js';
import { resolveWorkspaceTriagePolicyForReport } from '../../services/reports/triage-policy.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';
import { resolveProjectRepositoryScope } from '../../support/project-repositories.js';

const reportIdParamsSchema = z.object({
  reportId: z.string().uuid()
});

const activeIssuesQuerySchema = z.object({
  service: z.string().min(1).max(255).optional(),
  file: z.string().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const reviewQueueQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  assignedTo: z.string().min(1).max(255).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'impact', 'severity']).optional()
});

const reportReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  repository: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().min(1).max(4000).optional()
});

const reviewQueueActionSchema = z.object({
  action: z.enum(['assign', 'approve', 'reject']),
  reportIds: z.array(z.string().uuid()).min(1).max(50),
  reviewerId: z.string().trim().min(1).max(255).optional(),
  repository: z.string().trim().min(1).max(255).optional(),
  notes: z.string().trim().min(1).max(4000).optional()
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

function severityOrder(severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical'): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function compareTimestamps(left: string | undefined, right: string | undefined): number {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return leftTime - rightTime;
}

function computeAgeHours(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const createdAt = Date.parse(value);
  if (Number.isNaN(createdAt)) {
    return null;
  }

  return Math.round(((Date.now() - createdAt) / 3600000) * 10) / 10;
}

function summarizeReviewActivity(event: { eventType: string; actorId?: string; payload: Record<string, unknown> }): string {
  switch (event.eventType) {
    case 'public_feedback.received':
      return 'Hosted feedback entered the review-gated intake path.';
    case 'report.review_assigned':
      return `Assigned to ${typeof event.payload.reviewerId === 'string' ? event.payload.reviewerId : event.actorId ?? 'unknown reviewer'}.`;
    case 'report.reviewed':
      return `Decision recorded as ${typeof event.payload.reviewStatus === 'string' ? event.payload.reviewStatus : 'unknown'}.`;
    default:
      return event.eventType;
  }
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

function summarizeTriagePolicy(policy: Awaited<ReturnType<FastifyInstance['workspaceTriagePolicies']['findByWorkspaceId']>>): Record<string, unknown> {
  return {
    configured: Boolean(policy),
    ownershipRuleCount: policy?.ownershipRules.length ?? 0,
    priorityRuleCount: policy?.priorityRules.length ?? 0,
    updatedAt: policy?.updatedAt ?? null
  };
}

export function registerReportInternalRoutes(app: FastifyInstance): void {
  const projectCache = new Map<string, Promise<Awaited<ReturnType<FastifyInstance['projects']['findById']>>>>();
  const workspaceTriagePolicyCache = new Map<string, Promise<Awaited<ReturnType<FastifyInstance['workspaceTriagePolicies']['findByWorkspaceId']>>>>();
  const repositoryScopeCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveProjectRepositoryScope>>>>();

  async function loadProject(projectId: string | null | undefined) {
    if (!projectId) {
      return null;
    }

    const cached = projectCache.get(projectId);
    if (cached) {
      return cached;
    }

    const pending = app.projects.findById(projectId);
    projectCache.set(projectId, pending);
    return pending;
  }

  async function loadWorkspaceTriagePolicy(report: NonNullable<Awaited<ReturnType<FastifyInstance['reports']['findById']>>>, project?: Awaited<ReturnType<FastifyInstance['projects']['findById']>> | null) {
    const resolvedProject = project ?? await loadProject(report.projectId);
    if (!resolvedProject) {
      return null;
    }

    const cached = workspaceTriagePolicyCache.get(resolvedProject.workspaceId);
    if (cached) {
      return cached;
    }

    const pending = app.workspaceTriagePolicies.findByWorkspaceId(resolvedProject.workspaceId);
    workspaceTriagePolicyCache.set(resolvedProject.workspaceId, pending);
    return pending;
  }

  async function loadRepositoryScope(projectId: string | null | undefined, repository: string | null | undefined) {
    if (!projectId) {
      return null;
    }

    const cacheKey = `${projectId}:${repository ?? ''}`;
    const cached = repositoryScopeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = resolveProjectRepositoryScope({
      projectId,
      repoConnections: app.repoConnections,
      projects: app.projects,
      repository
    });
    repositoryScopeCache.set(cacheKey, pending);
    return pending;
  }

  async function resolveApprovedProjectRepository(input: {
    report: NonNullable<Awaited<ReturnType<FastifyInstance['reports']['findById']>>>;
    requestedRepository?: string | undefined;
    currentRepository?: string | undefined;
  }): Promise<string> {
    if (!input.report.projectId) {
      return input.requestedRepository ?? input.currentRepository ?? 'local-only';
    }

    const scope = await resolveProjectRepositoryScope({
      projectId: input.report.projectId,
      repository: input.requestedRepository ?? input.currentRepository,
      projects: app.projects,
      repoConnections: app.repoConnections
    });

    if (scope.availableRepositories.length === 0) {
      throw app.httpErrors.conflict('project has no active repository connections');
    }

    const resolvedRepository = input.requestedRepository
      ?? input.currentRepository
      ?? scope.defaultConnection?.repository
      ?? null;

    if (!resolvedRepository) {
      throw app.httpErrors.conflict('project has multiple repositories; select an active repository explicitly');
    }

    if (!scope.availableRepositories.includes(resolvedRepository)) {
      throw app.httpErrors.conflict('selected repository is not an active connection for this project');
    }

    return resolvedRepository;
  }

  async function applyReviewDecision(input: {
    principalId: string;
    requestId: string;
    reportId: string;
    payload: z.infer<typeof reportReviewSchema>;
  }): Promise<Record<string, unknown>> {
    const report = await app.reports.findById(input.reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const draft = await app.githubIssueLinks.findByReportId(input.reportId);
    if (!draft) {
      throw app.httpErrors.notFound('draft not found');
    }

    const decisionNotes = input.payload.notes?.trim();
    const requestedRepository = input.payload.repository?.trim();

    if (report.source === 'hosted-feedback' && !decisionNotes) {
      throw app.httpErrors.conflict('hosted feedback reviews require explicit decision notes');
    }

    if (report.source === 'hosted-feedback' && input.payload.status === 'approved' && !requestedRepository) {
      throw app.httpErrors.conflict('hosted feedback approvals must select an active project repository explicitly');
    }

    const existingReview = await app.reportReviews.findByReportId(input.reportId);
    if (input.payload.status === 'approved' && draft.state === 'synced' && existingReview?.status === 'approved') {
      throw app.httpErrors.conflict('report review is already approved and synced');
    }

    if (input.payload.status === 'rejected') {
      const review = {
        id: existingReview?.id ?? randomUUID(),
        feedbackReportId: input.reportId,
        status: 'rejected' as const,
        reviewerId: input.principalId,
        repository: draft.repository,
        ...(decisionNotes ? { notes: decisionNotes } : {}),
        reviewedAt: new Date().toISOString()
      };

      await app.reportReviews.upsert(review);
      await app.reports.updateStatus(input.reportId, 'drafted');
      await app.githubIssueLinks.upsert({
        ...draft,
        state: 'rejected'
      });

      await app.audit.write({
        eventType: 'report.reviewed',
          actorType: 'service',
        actorId: input.principalId,
        requestId: input.requestId,
        payload: {
          reportId: input.reportId,
          reviewStatus: 'rejected',
          repository: draft.repository,
          notes: decisionNotes ?? null
        }
      });

      return {
        review,
        draft: {
          ...draft,
          state: 'rejected'
        }
      };
    }

    const repository = input.payload.status === 'approved'
      ? await resolveApprovedProjectRepository({
        report,
        requestedRepository,
        currentRepository: draft.repository
      })
      : (requestedRepository ?? draft.repository);
    const github = await app.github.resolve({
      projectId: report.projectId,
      repository,
      strictProjectScoped: Boolean(report.projectId)
    });

    let issueNumber: number | undefined;
    let issueUrl: string | undefined;
    let state: 'local-draft' | 'synced' | 'sync-failed' = 'local-draft';
    let syncError: string | undefined;

    if (github.enabled) {
      try {
        const created = await github.createIssueDraft({
          title: draft.draftTitle,
          body: draft.draftBody,
          labels: draft.draftLabels
        });
        issueNumber = created.number;
        issueUrl = created.url;
        state = 'synced';
      } catch (error) {
        state = 'sync-failed';
        syncError = error instanceof Error ? error.message : 'failed to create GitHub issue draft';
      }
    } else {
      syncError = 'GitHub draft sync is disabled for the selected repository';
    }

    const review = {
      id: existingReview?.id ?? randomUUID(),
      feedbackReportId: input.reportId,
      status: 'approved' as const,
      reviewerId: input.principalId,
      repository,
      ...(decisionNotes ? { notes: decisionNotes } : {}),
      reviewedAt: new Date().toISOString()
    };

    await app.reportReviews.upsert(review);
    await app.reports.updateStatus(input.reportId, 'drafted');
    await app.githubIssueLinks.upsert({
      ...draft,
      repository,
      state,
      ...(issueNumber ? { issueNumber } : {}),
      ...(issueUrl ? { issueUrl } : {})
    });

    await app.audit.write({
      eventType: 'report.reviewed',
      actorType: 'service',
      actorId: input.principalId,
      requestId: input.requestId,
      payload: {
        reportId: input.reportId,
        reviewStatus: 'approved',
        repository,
        issueNumber: issueNumber ?? null,
        issueUrl: issueUrl ?? null,
        syncError: syncError ?? null,
        notes: decisionNotes ?? null
      }
    });

    return {
      review,
      draft: {
        ...draft,
        repository,
        state,
        ...(issueNumber ? { issueNumber } : {}),
        ...(issueUrl ? { issueUrl } : {})
      },
      ...(syncError ? { syncError } : {})
    };
  }

  app.get('/internal/reports/review-queue', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const query = reviewQueueQuerySchema.parse(request.query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const searchNeedle = query.search?.toLowerCase();
    const sort = query.sort ?? 'newest';
    const recentReports = await app.reports.listRecent(Math.min(Math.max(page * limit * 8, 80), 400));
    const pendingCandidates = recentReports.filter((report) => {
      if (report.source !== 'hosted-feedback') {
        return false;
      }

      if (query.projectId && report.projectId !== query.projectId) {
        return false;
      }

      return true;
    });
    const hydratedCandidates = await Promise.all(pendingCandidates.map(async (report) => {
      const [draft, review, project] = await Promise.all([
        app.githubIssueLinks.findByReportId(report.id),
        app.reportReviews.findByReportId(report.id),
        loadProject(report.projectId)
      ]);

      if (!draft || draft.state !== 'awaiting-review') {
        return null;
      }

      if (review && review.status !== 'pending') {
        return null;
      }

      if (query.assignedTo && review?.reviewerId !== query.assignedTo) {
        return null;
      }

      const [repoScope, triagePolicy] = await Promise.all([
        loadRepositoryScope(report.projectId, draft.repository),
        loadWorkspaceTriagePolicy(report, project)
      ]);
      const ownership = await resolveOwnershipCandidates({
        report,
        ...(draft.repository ? { repository: draft.repository } : {}),
        ...(triagePolicy ? { policy: triagePolicy } : {})
      });

      const impactScore = typeof report.payload.impactScore === 'number' ? report.payload.impactScore : null;
      const ageHours = computeAgeHours(report.createdAt ?? null);
      const topOwner = ownership.candidates[0] ?? null;
      const item = {
        reportId: report.id,
        project: project ? {
          id: project.id,
          projectKey: project.projectKey,
          name: project.name
        } : null,
        title: report.title ?? draft.draftTitle,
        severity: report.severity,
        status: report.status,
        issueState: draft.state,
        repository: draft.repository,
        availableRepositories: repoScope?.availableRepositories ?? [],
        impactScore,
        owner: topOwner ? {
          label: topOwner.label,
          kind: topOwner.kind,
          score: topOwner.score
        } : null,
        triagePolicy: summarizeTriagePolicy(triagePolicy),
        reporterIdentifier: report.reporterIdentifier ?? null,
        assignedReviewerId: review?.reviewerId ?? null,
        assignmentNotes: review?.notes ?? null,
        ageHours,
        stale: typeof ageHours === 'number' ? ageHours >= 24 : false,
        createdAt: report.createdAt ?? null,
        updatedAt: report.updatedAt ?? null,
        contextPath: `/internal/reports/${report.id}/context`,
        reviewPath: `/internal/reports/${report.id}/review`
      };

      if (!searchNeedle) {
        return item;
      }

      const haystack = [
        item.title,
        item.repository,
        item.owner?.label,
        item.reporterIdentifier,
        item.assignedReviewerId,
        item.project?.name,
        item.project?.projectKey,
        report.id
      ].filter((value): value is string => Boolean(value)).join('\n').toLowerCase();

      return haystack.includes(searchNeedle) ? item : null;
    }));
    const filteredItems = hydratedCandidates.filter((item): item is NonNullable<typeof item> => Boolean(item));

    filteredItems.sort((left, right) => {
      switch (sort) {
        case 'oldest':
          return compareTimestamps(left.createdAt ?? undefined, right.createdAt ?? undefined)
            || compareTimestamps(left.updatedAt ?? undefined, right.updatedAt ?? undefined)
            || left.reportId.localeCompare(right.reportId);
        case 'impact':
          return (right.impactScore ?? -1) - (left.impactScore ?? -1)
            || severityOrder(right.severity) - severityOrder(left.severity)
            || compareTimestamps(right.createdAt ?? undefined, left.createdAt ?? undefined)
            || right.reportId.localeCompare(left.reportId);
        case 'severity':
          return severityOrder(right.severity) - severityOrder(left.severity)
            || (right.impactScore ?? -1) - (left.impactScore ?? -1)
            || compareTimestamps(right.createdAt ?? undefined, left.createdAt ?? undefined)
            || right.reportId.localeCompare(left.reportId);
        default:
          return compareTimestamps(right.createdAt ?? undefined, left.createdAt ?? undefined)
            || compareTimestamps(right.updatedAt ?? undefined, left.updatedAt ?? undefined)
            || right.reportId.localeCompare(left.reportId);
      }
    });

    const totalItems = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const boundedPage = Math.min(page, totalPages);
    const startIndex = (boundedPage - 1) * limit;
    const items = filteredItems.slice(startIndex, startIndex + limit);
    const severityCounts = filteredItems.reduce<Record<string, number>>((counts, item) => {
      counts[item.severity] = (counts[item.severity] ?? 0) + 1;
      return counts;
    }, {});
    const workflow = filteredItems.reduce((metrics, item) => {
      if (item.assignedReviewerId) {
        metrics.assignedCount += 1;
      } else {
        metrics.unassignedCount += 1;
      }

      if (item.stale) {
        metrics.staleCount += 1;
      }

      if (typeof item.ageHours === 'number') {
        metrics.totalAgeHours += item.ageHours;
        metrics.agedCount += 1;
        metrics.oldestPendingAgeHours = Math.max(metrics.oldestPendingAgeHours, item.ageHours);
      }

      return metrics;
    }, {
      assignedCount: 0,
      unassignedCount: 0,
      staleCount: 0,
      oldestPendingAgeHours: 0,
      totalAgeHours: 0,
      agedCount: 0
    });
    const projectSummaryMap = new Map<string, {
      project: { id: string; projectKey: string; name: string } | null;
      queuedCount: number;
      highestImpactScore: number | null;
      latestCreatedAt: string | null;
      criticalCount: number;
    }>();

    for (const item of filteredItems) {
      const key = item.project?.id ?? 'unscoped';
      const existing = projectSummaryMap.get(key) ?? {
        project: item.project,
        queuedCount: 0,
        highestImpactScore: null,
        latestCreatedAt: null,
        criticalCount: 0
      };

      existing.queuedCount += 1;
      if (item.severity === 'critical') {
        existing.criticalCount += 1;
      }
      if (typeof item.impactScore === 'number') {
        existing.highestImpactScore = existing.highestImpactScore === null
          ? item.impactScore
          : Math.max(existing.highestImpactScore, item.impactScore);
      }
      if (!existing.latestCreatedAt || compareTimestamps(existing.latestCreatedAt, item.createdAt ?? undefined) < 0) {
        existing.latestCreatedAt = item.createdAt;
      }

      projectSummaryMap.set(key, existing);
    }

    return {
      filters: {
        projectId: query.projectId ?? null,
        assignedTo: query.assignedTo ?? null,
        search: query.search ?? null,
        page: boundedPage,
        limit,
        sort
      },
      summary: {
        totalItems,
        totalPages,
        hasNextPage: boundedPage < totalPages,
        hasPreviousPage: boundedPage > 1,
        severityCounts,
        workflow: {
          assignedCount: workflow.assignedCount,
          unassignedCount: workflow.unassignedCount,
          staleCount: workflow.staleCount,
          oldestPendingAgeHours: workflow.oldestPendingAgeHours,
          averageAgeHours: workflow.agedCount > 0
            ? Math.round((workflow.totalAgeHours / workflow.agedCount) * 10) / 10
            : 0
        },
        projectSummaries: Array.from(projectSummaryMap.values()).sort((left, right) => {
          return right.queuedCount - left.queuedCount
            || (right.highestImpactScore ?? -1) - (left.highestImpactScore ?? -1)
            || compareTimestamps(right.latestCreatedAt ?? undefined, left.latestCreatedAt ?? undefined)
            || (right.project?.name ?? 'Unscoped').localeCompare(left.project?.name ?? 'Unscoped');
        })
      },
      items
    };
  });

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

      const replay = await app.replayRuns.findLatestByReportId(report.id);
      const triagePolicy = await loadWorkspaceTriagePolicy(report);

      const ownership = await resolveOwnershipCandidates({
        report,
        ...(draft.repository ? { repository: draft.repository } : {}),
        ...(triagePolicy ? { policy: triagePolicy } : {})
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
        developerSummary: buildDeveloperSummary({
          ownershipCandidates: ownership.candidates,
          replay,
          impactScore: typeof report.payload.impactScore === 'number' ? report.payload.impactScore : null,
          agentTaskCount: 0
        }),
        triagePolicy: summarizeTriagePolicy(triagePolicy),
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

    const [embedding, draft, review, artifacts, replay, tasks, reviewActivity] = await Promise.all([
      app.reportEmbeddings.findByReportId(reportId),
      app.githubIssueLinks.findByReportId(reportId),
      app.reportReviews.findByReportId(reportId),
      app.artifacts.findByReportId(reportId),
      app.replayRuns.findLatestByReportId(reportId),
      app.agentTasks.findByReportId(reportId),
      app.auditRepository.listByReportId(reportId, 40)
    ]);
    const triagePolicy = await loadWorkspaceTriagePolicy(report);

    const [ownership, similar, duplicates, history, impact, executionsByTask] = await Promise.all([
      resolveOwnershipCandidates({
        report,
        ...(draft?.repository ? { repository: draft.repository } : {}),
        ...(triagePolicy ? { policy: triagePolicy } : {}),
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
        ...(triagePolicy ? { policy: triagePolicy } : {}),
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
      reportReview: review ?? null,
      reviewActivity: reviewActivity.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId ?? null,
        createdAt: event.createdAt,
        summary: summarizeReviewActivity(event),
        payload: event.payload
      })),
      artifacts,
      replay: replay ?? null,
      triagePolicy: {
        ...summarizeTriagePolicy(triagePolicy),
        policy: triagePolicy
      },
      ownership,
      similarReports: similar,
      duplicates,
      history,
      impact,
      developerSummary: buildDeveloperSummary({
        ownershipCandidates: ownership.candidates,
        similarCandidates: similar.candidates,
        duplicateCandidates: duplicates.candidates,
        replay,
        impactScore: typeof impact.score === 'number' ? impact.score : null,
        agentTaskCount: tasks.length
      }),
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
    const triagePolicy = await loadWorkspaceTriagePolicy(report);
    const ownership = await resolveOwnershipCandidates({
      report,
      ...(draft?.repository ? { repository: draft.repository } : {}),
      ...(triagePolicy ? { policy: triagePolicy } : {}),
      ...(embedding ? {
        embedding: embedding.embedding,
        loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
        loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
      } : {})
    });

    return {
      reportId,
      triagePolicy: summarizeTriagePolicy(triagePolicy),
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
    const triagePolicy = await loadWorkspaceTriagePolicy(report);
    const impact = await resolveRefinedImpactAssessment({
      report,
      ...(draft?.repository ? { repository: draft.repository } : {}),
      ...(triagePolicy ? { policy: triagePolicy } : {}),
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
      triagePolicy: summarizeTriagePolicy(triagePolicy),
      ...impact
    };
  });

  app.get('/internal/reports/:reportId/developer-summary', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const [embedding, draft, replay, tasks] = await Promise.all([
      app.reportEmbeddings.findByReportId(reportId),
      app.githubIssueLinks.findByReportId(reportId),
      app.replayRuns.findLatestByReportId(reportId),
      app.agentTasks.findByReportId(reportId)
    ]);
    const triagePolicy = await loadWorkspaceTriagePolicy(report);

    const [ownership, similar, duplicates, impact] = await Promise.all([
      resolveOwnershipCandidates({
        report,
        ...(draft?.repository ? { repository: draft.repository } : {}),
        ...(triagePolicy ? { policy: triagePolicy } : {}),
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
      resolveRefinedImpactAssessment({
        report,
        ...(draft?.repository ? { repository: draft.repository } : {}),
        ...(triagePolicy ? { policy: triagePolicy } : {}),
        ...(embedding ? {
          embedding: embedding.embedding,
          loadNearestNeighbors: (vector, limit) => app.reportEmbeddings.findNearestNeighbors(vector, limit),
          loadReportById: (neighborReportId) => app.reports.findById(neighborReportId)
        } : {}),
        loadIssueLinkByReportId: (linkedReportId) => app.githubIssueLinks.findByReportId(linkedReportId),
        loadTasksByReportId: (linkedReportId) => app.agentTasks.findByReportId(linkedReportId),
        loadExecutionsByTaskId: (agentTaskId) => app.agentTaskExecutions.findByTaskId(agentTaskId),
        loadPullRequestByExecutionId: (executionId) => app.agentTaskExecutionPullRequests.findByExecutionId(executionId)
      })
    ]);

    return {
      reportId,
      triagePolicy: summarizeTriagePolicy(triagePolicy),
      developerSummary: buildDeveloperSummary({
        ownershipCandidates: ownership.candidates,
        similarCandidates: similar.candidates,
        duplicateCandidates: duplicates.candidates,
        replay,
        impactScore: typeof impact.score === 'number' ? impact.score : null,
        agentTaskCount: tasks.length
      })
    };
  });

  app.get('/internal/reports/:reportId/review', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const report = await app.reports.findById(reportId);
    if (!report) {
      throw app.httpErrors.notFound('report not found');
    }

    const [draft, review] = await Promise.all([
      app.githubIssueLinks.findByReportId(reportId),
      app.reportReviews.findByReportId(reportId)
    ]);

    return {
      reportId,
      source: report.source,
      projectId: report.projectId ?? null,
      draftState: draft?.state ?? null,
      review: review ?? null
    };
  });

  app.post('/internal/reports/review-queue/actions', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['github:draft']);
    const payload = reviewQueueActionSchema.parse(request.body);

    if (payload.action === 'assign') {
      const assignmentNotes = payload.notes?.trim();
      if (!assignmentNotes) {
        throw app.httpErrors.conflict('review queue assignment requires explicit notes');
      }

      const reviewerId = payload.reviewerId ?? principal.id;
      const results = await Promise.all(payload.reportIds.map(async (reportId) => {
        const report = await app.reports.findById(reportId);
        if (!report) {
          throw app.httpErrors.notFound(`report ${reportId} not found`);
        }

        const existingReview = await app.reportReviews.findByReportId(reportId);
        if (existingReview && existingReview.status !== 'pending') {
          throw app.httpErrors.conflict(`report ${reportId} is no longer pending review`);
        }

        const assignedReview = {
          id: existingReview?.id ?? randomUUID(),
          feedbackReportId: reportId,
          status: 'pending' as const,
          reviewerId,
          ...(payload.notes ? { notes: payload.notes } : {}),
          ...(existingReview?.repository ? { repository: existingReview.repository } : {})
        };

        await app.reportReviews.upsert(assignedReview);
        await app.audit.write({
          eventType: 'report.review_assigned',
          actorType: 'service',
          actorId: principal.id,
          requestId: request.id,
          payload: {
            reportId,
            reviewerId,
            notes: assignmentNotes
          }
        });

        return {
          reportId,
          review: assignedReview
        };
      }));

      return {
        action: 'assign',
        reviewerId,
        results
      };
    }

    const reviewPayload = {
      status: payload.action === 'approve' ? 'approved' : 'rejected',
      ...(payload.repository ? { repository: payload.repository } : {}),
      ...(payload.notes ? { notes: payload.notes } : {})
    } satisfies z.infer<typeof reportReviewSchema>;

    const results = await Promise.all(payload.reportIds.map(async (reportId) => ({
      reportId,
      result: await applyReviewDecision({
        principalId: principal.id,
        requestId: request.id,
        reportId,
        payload: reviewPayload
      })
    })));

    return {
      action: payload.action,
      results
    };
  });

  app.post('/internal/reports/:reportId/review', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['github:draft']);

    const { reportId } = reportIdParamsSchema.parse(request.params);
    const payload = reportReviewSchema.parse(request.body);
    return applyReviewDecision({
      principalId: principal.id,
      requestId: request.id,
      reportId,
      payload
    });
  });
}