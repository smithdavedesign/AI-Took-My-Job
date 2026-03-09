import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  buildGitHubAppInstallationUrl,
  getGitHubAppInstallationDetails,
  listGitHubInstallationRepositories
} from '../../integrations/github/client.js';
import { resolveProjectRepositoryScope } from '../../support/project-repositories.js';
import { createGitHubAppInstallState, verifyGitHubAppInstallState } from '../../support/github-app-install-state.js';
import { createPublicWidgetSessionToken } from '../../support/public-widget-access.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const workspaceIdParamsSchema = z.object({
  workspaceId: z.string().uuid()
});

const installationIdParamsSchema = z.object({
  installationId: z.coerce.number().int().positive()
});

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});

const projectKeyParamsSchema = z.object({
  projectKey: z.string().min(3).max(80)
});

const repoConnectionIdParamsSchema = z.object({
  repoConnectionId: z.string().uuid()
});

const widgetSessionSchema = z.object({
  origin: z.url().optional(),
  mode: z.enum(['widget', 'embed']).default('embed'),
  ttlSeconds: z.coerce.number().int().min(60).max(86400).optional()
});

const githubAppInstallLinkSchema = z.object({
  projectId: z.string().uuid().optional(),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repository must be owner/repo').optional(),
  isDefault: z.boolean().optional(),
  ttlSeconds: z.coerce.number().int().min(60).max(7200).optional()
});

const githubAppReconcileSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  projectId: z.string().uuid().optional(),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repository must be owner/repo').optional(),
  isDefault: z.boolean().optional()
});

const githubAppTransferSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  projectId: z.string().uuid().optional(),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repository must be owner/repo').optional(),
  isDefault: z.boolean().optional(),
  deactivateSourceConnections: z.boolean().optional()
});

const githubAppInstallCallbackQuerySchema = z.object({
  installation_id: z.coerce.number().int().positive(),
  setup_action: z.string().optional(),
  state: z.string().min(32).optional()
});

const createWorkspaceSchema = z.object({
  slug: z.string().min(3).max(80).optional(),
  name: z.string().min(1).max(120)
});

const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  projectKey: z.string().min(3).max(80).optional(),
  name: z.string().min(1).max(120),
  routingConfig: z.record(z.string(), z.unknown()).optional()
});

const createGitHubInstallationSchema = z.object({
  workspaceId: z.string().uuid(),
  installationId: z.coerce.number().int().positive(),
  accountLogin: z.string().min(1).max(120).optional(),
  accountType: z.string().min(1).max(60).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const createRepoConnectionSchema = z.object({
  projectId: z.string().uuid(),
  githubInstallationId: z.string().uuid().optional(),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'repository must be owner/repo'),
  isDefault: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

const updateRepoConnectionSchema = z.object({
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  config: z.record(z.string(), z.unknown()).optional()
}).refine((value) => Object.keys(value).length > 0, 'at least one update field is required');

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildGitHubAppInstallResultPage(input: {
  status: 'success' | 'partial' | 'error';
  title: string;
  message: string;
  details: Array<{ label: string; value: string }>;
  repositories?: string[];
}): string {
  const palette = input.status === 'success'
    ? { accent: '#0e6b46', soft: 'rgba(14,107,70,0.12)' }
    : input.status === 'partial'
      ? { accent: '#8b6208', soft: 'rgba(139,98,8,0.12)' }
      : { accent: '#922f2f', soft: 'rgba(146,47,47,0.12)' };

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>GitHub App Onboarding</title>',
    '  <style>',
    `    :root { --accent: ${palette.accent}; --accent-soft: ${palette.soft}; --ink: #18212b; --muted: rgba(24,33,43,0.7); --panel: rgba(255,255,255,0.9); --line: rgba(24,33,43,0.12); }`,
    '    * { box-sizing: border-box; }',
    '    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; color: var(--ink); background: radial-gradient(circle at top, #fbf6ea 0%, #e2ece8 100%); }',
    '    main { max-width: 860px; margin: 0 auto; padding: 36px 18px 54px; }',
    '    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 28px; padding: 24px; box-shadow: 0 24px 60px rgba(24,33,43,0.12); }',
    '    .eyebrow { display: inline-flex; padding: 8px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 0.76rem/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: 0.08em; }',
    '    h1 { margin: 16px 0 10px; font-size: clamp(2.4rem, 6vw, 4rem); line-height: 0.94; }',
    '    p { color: var(--muted); line-height: 1.6; }',
    '    dl { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 10px 16px; margin: 22px 0 0; }',
    '    dt { font-weight: 700; }',
    '    dd { margin: 0; color: var(--muted); }',
    '    ul { margin: 18px 0 0; padding-left: 20px; color: var(--muted); }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <section class="panel">',
    '      <span class="eyebrow">GitHub App Onboarding</span>',
    `      <h1>${escapeHtml(input.title)}</h1>`,
    `      <p>${escapeHtml(input.message)}</p>`,
    '      <dl>',
    ...input.details.flatMap((detail) => [`        <dt>${escapeHtml(detail.label)}</dt>`, `        <dd>${escapeHtml(detail.value)}</dd>`]),
    '      </dl>',
    ...(input.repositories && input.repositories.length > 0
      ? ['      <ul>', ...input.repositories.slice(0, 12).map((repository) => `        <li>${escapeHtml(repository)}</li>`), '      </ul>']
      : []),
    '    </section>',
    '  </main>',
    '</body>',
    '</html>'
  ].join('\n');
}

async function persistGitHubInstallationBinding(app: FastifyInstance, input: {
  workspace: { id: string; name: string };
  installationId: number;
  setupAction?: string;
  project?: { id: string; name: string } | null;
  repository?: string | null;
  isDefault?: boolean;
  allowWorkspaceTransfer?: boolean;
}): Promise<{
  details: Awaited<ReturnType<typeof getGitHubAppInstallationDetails>>;
  repositories: Awaited<ReturnType<typeof listGitHubInstallationRepositories>>;
  syncedInstallation: Awaited<ReturnType<FastifyInstance['githubInstallations']['upsert']>>;
  linkedRepository: string | null;
  linkStatus: string;
  repoConnectionId: string | null;
}> {
  const details = await getGitHubAppInstallationDetails(app.config, input.installationId);
  const repositories = await listGitHubInstallationRepositories(app.config, input.installationId);
  const existingInstallation = await app.githubInstallations.findByInstallationId(input.installationId);

  if (existingInstallation && existingInstallation.workspaceId !== input.workspace.id && input.allowWorkspaceTransfer !== true) {
    throw app.httpErrors.conflict('This GitHub App installation is already mapped to another workspace');
  }

  const syncedInstallation = await app.githubInstallations.upsert({
    id: existingInstallation?.id ?? randomUUID(),
    workspaceId: input.workspace.id,
    provider: 'github',
    installationId: input.installationId,
    ...(details.accountLogin ? { accountLogin: details.accountLogin } : {}),
    ...(details.accountType ? { accountType: details.accountType } : {}),
    metadata: {
      targetType: details.targetType ?? null,
      repositoriesSelection: details.repositoriesSelection ?? null,
      permissions: details.permissions,
      repositoryCount: repositories.length,
      lastSetupAction: input.setupAction ?? 'manual-reconcile',
      lastSyncedAt: new Date().toISOString()
    }
  });

  let linkedRepository = input.repository ?? null;
  let linkStatus = 'installation persisted';
  let repoConnectionId: string | null = null;

  if (input.project && input.repository) {
    const repositoryAvailable = repositories.some((repository) => repository.fullName === input.repository);
    if (!repositoryAvailable) {
      linkedRepository = null;
      linkStatus = 'installation saved, repository not visible to this installation';
    } else {
      const existingConnection = await app.repoConnections.findByProjectIdAndRepository(input.project.id, input.repository);
      if (existingConnection) {
        const updatedConnection = await app.repoConnections.update(existingConnection.id, {
          githubInstallationId: syncedInstallation.id,
          ...(typeof input.isDefault === 'boolean' ? { isDefault: input.isDefault } : {}),
          status: 'active',
          config: {
            onboardingSource: input.setupAction ?? 'manual-reconcile',
            installationId: input.installationId,
            accountLogin: details.accountLogin ?? null
          }
        });
        repoConnectionId = updatedConnection?.id ?? existingConnection.id;
      } else {
        const existingConnections = await app.repoConnections.findByProjectId(input.project.id);
        const shouldBeDefault = typeof input.isDefault === 'boolean'
          ? input.isDefault
          : existingConnections.length === 0;
        const repoConnectionIdValue = randomUUID();
        await app.repoConnections.create({
          id: repoConnectionIdValue,
          projectId: input.project.id,
          githubInstallationId: syncedInstallation.id,
          provider: 'github',
          repository: input.repository,
          isDefault: shouldBeDefault,
          status: 'active',
          config: {
            onboardingSource: input.setupAction ?? 'manual-reconcile',
            installationId: input.installationId,
            accountLogin: details.accountLogin ?? null
          }
        });
        repoConnectionId = repoConnectionIdValue;
      }

      linkStatus = 'installation persisted and repository linked';
    }
  }

  return {
    details,
    repositories,
    syncedInstallation,
    linkedRepository,
    linkStatus,
    repoConnectionId
  };
}

async function buildGitHubInstallationAdminSnapshot(app: FastifyInstance, installationId: number): Promise<{
  installation: NonNullable<Awaited<ReturnType<FastifyInstance['githubInstallations']['findByInstallationId']>>>;
  workspace: NonNullable<Awaited<ReturnType<FastifyInstance['workspaces']['findById']>>>;
  linkedProjects: Array<{
    project: { id: string; projectKey: string; name: string };
    repoConnection: { id: string; repository: string; isDefault: boolean; status: 'active' | 'inactive' };
  }>;
}> {
  const installation = await app.githubInstallations.findByInstallationId(installationId);
  if (!installation) {
    throw app.httpErrors.notFound('github installation not found');
  }

  const workspace = await app.workspaces.findById(installation.workspaceId);
  if (!workspace) {
    throw app.httpErrors.conflict('github installation workspace no longer exists');
  }

  const linkedConnections = await app.repoConnections.findByGitHubInstallationId(installation.id);
  const linkedProjects = await Promise.all(linkedConnections.map(async (connection) => {
    const project = await app.projects.findById(connection.projectId);
    return project ? {
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      repoConnection: {
        id: connection.id,
        repository: connection.repository,
        isDefault: connection.isDefault,
        status: connection.status
      }
    } : null;
  }));

  return {
    installation,
    workspace,
    linkedProjects: linkedProjects.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  };
}

export function registerOnboardingInternalRoutes(app: FastifyInstance): void {
  app.post('/internal/workspaces', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createWorkspaceSchema.parse(request.body);
    const slug = payload.slug ? slugify(payload.slug) : slugify(payload.name);

    const existing = await app.workspaces.findBySlug(slug);
    if (existing) {
      throw app.httpErrors.conflict('workspace slug already exists');
    }

    const workspace = {
      id: randomUUID(),
      slug,
      name: payload.name
    } as const;

    await app.workspaces.create(workspace);
    await app.audit.write({
      eventType: 'workspace.created',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: workspace
    });

    return reply.code(201).send(workspace);
  });

  app.get('/internal/workspaces/:workspaceId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    const workspace = await app.workspaces.findById(workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    return workspace;
  });

  app.get('/internal/workspaces/:workspaceId/projects', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    return app.projects.findByWorkspaceId(workspaceId);
  });

  app.get('/internal/workspaces/:workspaceId/github-installations', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    return app.githubInstallations.findByWorkspaceId(workspaceId);
  });

  app.get('/internal/github-app/installations/:installationId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { installationId } = installationIdParamsSchema.parse(request.params);
    const snapshot = await buildGitHubInstallationAdminSnapshot(app, installationId);

    return {
      installation: {
        ...snapshot.installation,
        installationId: Number(snapshot.installation.installationId)
      },
      workspace: snapshot.workspace,
      linkedProjects: snapshot.linkedProjects
    };
  });

  app.post('/internal/projects', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createProjectSchema.parse(request.body);
    const workspace = await app.workspaces.findById(payload.workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    const projectKey = payload.projectKey ? slugify(payload.projectKey) : slugify(payload.name);
    const existing = await app.projects.findByKey(projectKey);
    if (existing) {
      throw app.httpErrors.conflict('project key already exists');
    }

    const project = {
      id: randomUUID(),
      workspaceId: workspace.id,
      projectKey,
      name: payload.name,
      status: 'active',
      routingConfig: payload.routingConfig ?? {}
    } as const;

    await app.projects.create(project);
    await app.audit.write({
      eventType: 'project.created',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: project
    });

    return reply.code(201).send(project);
  });

  app.get('/internal/projects/:projectId', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await app.projects.findById(projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    return project;
  });

  app.get('/internal/projects/:projectId/operations', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await app.projects.findById(projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    const workspace = await app.workspaces.findById(project.workspaceId);
    if (!workspace) {
      throw app.httpErrors.conflict('project workspace not found');
    }

    const repoScope = await resolveProjectRepositoryScope({
      projectId: project.id,
      projects: app.projects,
      repoConnections: app.repoConnections
    });
    const installations = await app.githubInstallations.findByWorkspaceId(workspace.id);
    const recentReports = (await app.reports.listRecent(100)).filter((report) => report.projectId === project.id);
    const pendingReviewCount = recentReports.filter((report) => report.source === 'hosted-feedback' && report.status === 'awaiting-review').length;
    const reportStatusCounts = recentReports.reduce<Record<string, number>>((counts, report) => {
      counts[report.status] = (counts[report.status] ?? 0) + 1;
      return counts;
    }, {});
    const agentTasks = await Promise.all(recentReports.map((report) => app.agentTasks.findByReportId(report.id)));
    const flattenedTasks = agentTasks.flat();
    const taskStatusCounts = flattenedTasks.reduce<Record<string, number>>((counts, task) => {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
      return counts;
    }, {});

    return {
      workspace,
      project,
      repositories: {
        available: repoScope.availableRepositories,
        defaultRepository: repoScope.defaultConnection?.repository ?? null,
        connections: repoScope.activeConnections
      },
      githubInstallations: installations.map((installation) => ({
        ...installation,
        installationId: Number(installation.installationId)
      })),
      reports: {
        total: recentReports.length,
        pendingReviewCount,
        statusCounts: reportStatusCounts,
        recent: recentReports.slice(0, 10).map((report) => ({
          id: report.id,
          source: report.source,
          title: report.title ?? null,
          status: report.status,
          severity: report.severity,
          createdAt: report.createdAt ?? null
        }))
      },
      agentTasks: {
        total: flattenedTasks.length,
        statusCounts: taskStatusCounts,
        recent: flattenedTasks.slice(0, 10).map((task) => ({
          id: task.id,
          title: task.title,
          targetRepository: task.targetRepository,
          status: task.status,
          executionMode: task.executionMode
        }))
      }
    };
  });

  app.get('/internal/projects/key/:projectKey', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectKey } = projectKeyParamsSchema.parse(request.params);
    const project = await app.projects.findByKey(projectKey);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    return project;
  });

  app.post('/internal/github/installations', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createGitHubInstallationSchema.parse(request.body);
    const workspace = await app.workspaces.findById(payload.workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    const existing = await app.githubInstallations.findByInstallationId(payload.installationId);
    if (existing) {
      throw app.httpErrors.conflict('installation already exists');
    }

    const installation = {
      id: randomUUID(),
      workspaceId: workspace.id,
      provider: 'github',
      installationId: payload.installationId,
      metadata: payload.metadata ?? {},
      ...(payload.accountLogin ? { accountLogin: payload.accountLogin } : {}),
      ...(payload.accountType ? { accountType: payload.accountType } : {})
    } as const;

    await app.githubInstallations.create(installation);
    await app.audit.write({
      eventType: 'github_installation.created',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: installation
    });

    return reply.code(201).send(installation);
  });

  app.post('/internal/repo-connections', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createRepoConnectionSchema.parse(request.body);
    const project = await app.projects.findById(payload.projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    const existingConnection = await app.repoConnections.findByProjectIdAndRepository(project.id, payload.repository);
    if (existingConnection) {
      throw app.httpErrors.conflict('repository connection already exists for project');
    }

    let githubInstallationId: string | undefined;
    if (payload.githubInstallationId) {
      const installation = await app.githubInstallations.findById(payload.githubInstallationId);
      if (!installation) {
        throw app.httpErrors.notFound('github installation not found');
      }

      if (installation.workspaceId !== project.workspaceId) {
        throw app.httpErrors.conflict('github installation workspace does not match project workspace');
      }

      githubInstallationId = installation.id;
    }

    const existingConnections = await app.repoConnections.findByProjectId(project.id);
    const isDefault = payload.isDefault ?? existingConnections.length === 0;
    if (isDefault && existingConnections.some((connection) => connection.isDefault)) {
      await app.repoConnections.clearDefaultByProjectId(project.id);
    }

    const connection = {
      id: randomUUID(),
      projectId: project.id,
      provider: 'github',
      repository: payload.repository,
      isDefault,
      status: 'active',
      config: payload.config ?? {},
      ...(githubInstallationId ? { githubInstallationId } : {})
    } as const;

    await app.repoConnections.create(connection);
    await app.audit.write({
      eventType: 'repo_connection.created',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: connection
    });

    return reply.code(201).send(connection);
  });

  app.patch('/internal/repo-connections/:repoConnectionId', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { repoConnectionId } = repoConnectionIdParamsSchema.parse(request.params);
    const payload = updateRepoConnectionSchema.parse(request.body ?? {});
    const existing = await app.repoConnections.findById(repoConnectionId);
    if (!existing) {
      throw app.httpErrors.notFound('repo connection not found');
    }

    if (payload.isDefault) {
      await app.repoConnections.clearDefaultByProjectId(existing.projectId);
    }

    const updated = await app.repoConnections.update(repoConnectionId, {
      ...(typeof payload.isDefault === 'boolean' ? { isDefault: payload.isDefault } : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.config ? { config: payload.config } : {})
    });

    if (!updated) {
      throw app.httpErrors.notFound('repo connection not found');
    }

    await app.audit.write({
      eventType: 'repo_connection.updated',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        repoConnectionId,
        projectId: existing.projectId,
        updates: payload
      }
    });

    return updated;
  });

  app.get('/internal/projects/:projectId/repo-connections', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    return app.repoConnections.findByProjectId(projectId);
  });

  app.post('/internal/workspaces/:workspaceId/github-app/install-link', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    const payload = githubAppInstallLinkSchema.parse(request.body ?? {});
    const workspace = await app.workspaces.findById(workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    let project = null;
    if (payload.projectId) {
      project = await app.projects.findById(payload.projectId);
      if (!project) {
        throw app.httpErrors.notFound('project not found');
      }

      if (project.workspaceId !== workspace.id) {
        throw app.httpErrors.conflict('project workspace does not match install workspace');
      }
    }

    try {
      const state = createGitHubAppInstallState(app.config, {
        workspaceId: workspace.id,
        ...(project ? { projectId: project.id } : {}),
        ...(payload.repository ? { repository: payload.repository } : {}),
        ...(typeof payload.isDefault === 'boolean' ? { isDefault: payload.isDefault } : {}),
        ...(typeof payload.ttlSeconds === 'number' ? { ttlSeconds: payload.ttlSeconds } : {})
      });

      return {
        workspace,
        ...(project ? { project } : {}),
        repository: payload.repository ?? null,
        installUrl: buildGitHubAppInstallationUrl(app.config, state.token),
        callbackUrl: `${app.config.APP_BASE_URL?.replace(/\/$/, '') ?? `${request.protocol}://${request.hostname}${app.config.PORT === 80 || app.config.PORT === 443 ? '' : `:${app.config.PORT}`}`}/github/app/install/callback`,
        expiresAt: state.state.expiresAt,
        stateToken: state.token
      };
    } catch (error) {
      throw app.httpErrors.conflict(error instanceof Error ? error.message : 'GitHub App onboarding is not configured');
    }
  });

  app.post('/internal/workspaces/:workspaceId/github-app/reconcile', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    const payload = githubAppReconcileSchema.parse(request.body ?? {});
    const workspace = await app.workspaces.findById(workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    let project = null;
    if (payload.projectId) {
      project = await app.projects.findById(payload.projectId);
      if (!project) {
        throw app.httpErrors.notFound('project not found');
      }

      if (project.workspaceId !== workspace.id) {
        throw app.httpErrors.conflict('project workspace does not match reconcile workspace');
      }
    }

    const synced = await persistGitHubInstallationBinding(app, {
      workspace,
      installationId: payload.installationId,
      setupAction: 'manual-reconcile',
      project,
      repository: payload.repository ?? null,
      ...(typeof payload.isDefault === 'boolean' ? { isDefault: payload.isDefault } : {})
    });

    await app.audit.write({
      eventType: 'github_app.installation_reconciled',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        workspaceId: workspace.id,
        projectId: project?.id ?? null,
        installationId: payload.installationId,
        repository: payload.repository ?? null,
        repoConnectionId: synced.repoConnectionId,
        result: synced.linkStatus
      }
    });

    return {
      workspace,
      project,
      installation: {
        ...synced.syncedInstallation,
        installationId: Number(synced.syncedInstallation.installationId)
      },
      repositoryLink: {
        requested: payload.repository ?? null,
        linked: synced.linkedRepository,
        repoConnectionId: synced.repoConnectionId,
        result: synced.linkStatus
      },
      repositories: synced.repositories.map((repository) => repository.fullName),
      account: synced.details.accountLogin ?? null
    };
  });

  app.post('/internal/workspaces/:workspaceId/github-app/transfer-installation', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { workspaceId } = workspaceIdParamsSchema.parse(request.params);
    const payload = githubAppTransferSchema.parse(request.body ?? {});
    const workspace = await app.workspaces.findById(workspaceId);
    if (!workspace) {
      throw app.httpErrors.notFound('workspace not found');
    }

    let project = null;
    if (payload.projectId) {
      project = await app.projects.findById(payload.projectId);
      if (!project) {
        throw app.httpErrors.notFound('project not found');
      }

      if (project.workspaceId !== workspace.id) {
        throw app.httpErrors.conflict('project workspace does not match transfer workspace');
      }
    }

    const current = await buildGitHubInstallationAdminSnapshot(app, payload.installationId);
    const sourceWorkspace = current.workspace;
    const sourceConnections = current.linkedProjects;
    const shouldDeactivate = payload.deactivateSourceConnections !== false && sourceWorkspace.id !== workspace.id;

    const deactivatedConnectionIds: string[] = [];
    if (shouldDeactivate) {
      for (const entry of sourceConnections) {
        await app.repoConnections.update(entry.repoConnection.id, {
          status: 'inactive',
          config: {
            transferredAt: new Date().toISOString(),
            transferredToWorkspaceId: workspace.id,
            transferredBy: principal.id
          }
        });
        deactivatedConnectionIds.push(entry.repoConnection.id);
      }
    }

    const synced = await persistGitHubInstallationBinding(app, {
      workspace,
      installationId: payload.installationId,
      setupAction: 'manual-transfer',
      project,
      repository: payload.repository ?? null,
      ...(typeof payload.isDefault === 'boolean' ? { isDefault: payload.isDefault } : {}),
      allowWorkspaceTransfer: true
    });

    await app.audit.write({
      eventType: 'github_app.installation_transferred',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        installationId: payload.installationId,
        sourceWorkspaceId: sourceWorkspace.id,
        targetWorkspaceId: workspace.id,
        projectId: project?.id ?? null,
        repository: payload.repository ?? null,
        deactivatedConnectionIds
      }
    });

    return {
      sourceWorkspace,
      targetWorkspace: workspace,
      installation: {
        ...synced.syncedInstallation,
        installationId: Number(synced.syncedInstallation.installationId)
      },
      repositoryLink: {
        requested: payload.repository ?? null,
        linked: synced.linkedRepository,
        repoConnectionId: synced.repoConnectionId,
        result: synced.linkStatus
      },
      deactivatedConnectionIds,
      account: synced.details.accountLogin ?? null
    };
  });

  app.post('/internal/projects/:projectId/widget-session', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const payload = widgetSessionSchema.parse(request.body ?? {});
    const project = await app.projects.findById(projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    const { token, claims } = createPublicWidgetSessionToken(app.config, {
      projectId: project.id,
      projectKey: project.projectKey,
      mode: payload.mode,
      ...(payload.origin ? { origin: payload.origin } : {}),
      ...(typeof payload.ttlSeconds === 'number' ? { ttlSeconds: payload.ttlSeconds } : {})
    });
    const baseUrl = app.config.APP_BASE_URL?.replace(/\/$/, '') ?? `${request.protocol}://${request.hostname}${app.config.PORT === 80 || app.config.PORT === 443 ? '' : `:${app.config.PORT}`}`;
    const widgetUrl = new URL(`/public/projects/${project.projectKey}/widget`, baseUrl);
    widgetUrl.searchParams.set('accessToken', token);
    if (payload.mode === 'embed') {
      widgetUrl.searchParams.set('embed', 'true');
    }
    const embedScriptUrl = new URL(`/public/projects/${project.projectKey}/embed.js`, baseUrl);
    embedScriptUrl.searchParams.set('accessToken', token);

    return {
      project: {
        id: project.id,
        projectKey: project.projectKey,
        name: project.name
      },
      accessToken: token,
      expiresAt: claims.expiresAt,
      origin: claims.origin ?? null,
      mode: claims.mode,
      widgetUrl: widgetUrl.toString(),
      embedScriptUrl: embedScriptUrl.toString(),
      feedbackAuthHeader: 'x-nexus-widget-token'
    };
  });

  app.get('/github/app/install/callback', async (request, reply) => {
    const query = githubAppInstallCallbackQuerySchema.parse(request.query);

    if (!query.state) {
      reply.type('text/html; charset=utf-8');
      return reply.code(200).send(buildGitHubAppInstallResultPage({
        status: 'partial',
        title: 'GitHub App installed manually',
        message: 'GitHub redirected back without a signed install state. This usually means the app was installed directly from GitHub instead of starting from the Nexus install-link route. The installation itself is valid, but Nexus cannot auto-link it to a workspace or project from this callback alone.',
        details: [
          { label: 'Installation', value: String(query.installation_id) },
          { label: 'Setup Action', value: query.setup_action ?? 'install' },
          { label: 'Next Step', value: 'Set GITHUB_APP_INSTALLATION_ID or re-run the install from Nexus.' }
        ]
      }));
    }

    let installState;
    try {
      installState = verifyGitHubAppInstallState(app.config, query.state);
    } catch (error) {
      reply.type('text/html; charset=utf-8');
      return reply.code(401).send(buildGitHubAppInstallResultPage({
        status: 'error',
        title: 'Install state rejected',
        message: error instanceof Error ? error.message : 'The GitHub App install callback could not be verified.',
        details: [
          { label: 'Installation', value: String(query.installation_id) },
          { label: 'Setup Action', value: query.setup_action ?? 'install' }
        ]
      }));
    }

    const workspace = await app.workspaces.findById(installState.workspaceId);
    if (!workspace) {
      reply.type('text/html; charset=utf-8');
      return reply.code(404).send(buildGitHubAppInstallResultPage({
        status: 'error',
        title: 'Workspace not found',
        message: 'The workspace referenced by this installation flow no longer exists.',
        details: [
          { label: 'Workspace Id', value: installState.workspaceId },
          { label: 'Installation', value: String(query.installation_id) }
        ]
      }));
    }

    let project = null;
    if (installState.projectId) {
      project = await app.projects.findById(installState.projectId);
      if (!project || project.workspaceId !== workspace.id) {
        reply.type('text/html; charset=utf-8');
        return reply.code(409).send(buildGitHubAppInstallResultPage({
          status: 'error',
          title: 'Project mapping failed',
          message: 'The project selected for this installation no longer belongs to the target workspace.',
          details: [
            { label: 'Workspace', value: workspace.name },
            { label: 'Project Id', value: installState.projectId }
          ]
        }));
      }
    }

    try {
      const synced = await persistGitHubInstallationBinding(app, {
        workspace,
        installationId: query.installation_id,
        setupAction: query.setup_action ?? 'install',
        project,
        repository: installState.repository ?? null,
        ...(typeof installState.isDefault === 'boolean' ? { isDefault: installState.isDefault } : {})
      });

      await app.audit.write({
        eventType: 'github_app.installation_synced',
        actorType: 'system',
        actorId: synced.details.accountLogin ?? String(query.installation_id),
        requestId: request.id,
        payload: {
          workspaceId: workspace.id,
          projectId: project?.id ?? null,
          repository: installState.repository ?? null,
          installationId: query.installation_id,
          setupAction: query.setup_action ?? 'install',
          linkStatus: synced.linkStatus
        }
      });

      reply.type('text/html; charset=utf-8');
      return reply.send(buildGitHubAppInstallResultPage({
        status: synced.linkedRepository || !installState.repository ? 'success' : 'partial',
        title: synced.linkedRepository || !installState.repository ? 'GitHub App connected' : 'GitHub App connected with follow-up needed',
        message: synced.linkedRepository || !installState.repository
          ? 'The installation metadata is now stored locally and ready for project-scoped GitHub resolution.'
          : 'The installation was stored, but the requested repository was not visible to this installation. Re-run the install flow after expanding repository access or attach the installation manually to another repository connection.',
        details: [
          { label: 'Workspace', value: workspace.name },
          { label: 'Project', value: project ? project.name : 'Not linked during install' },
          { label: 'Installation', value: String(query.installation_id) },
          { label: 'Account', value: synced.details.accountLogin ?? 'Unknown account' },
          { label: 'Repository Link', value: synced.linkedRepository ?? 'No repository linked' },
          { label: 'Result', value: synced.linkStatus }
        ],
        repositories: synced.repositories.map((repository) => repository.fullName)
      }));
    } catch (error) {
      reply.type('text/html; charset=utf-8');
      return reply.code(502).send(buildGitHubAppInstallResultPage({
        status: 'error',
        title: 'GitHub App sync failed',
        message: error instanceof Error ? error.message : 'The installation callback could not be completed.',
        details: [
          { label: 'Workspace', value: workspace.name },
          { label: 'Installation', value: String(query.installation_id) },
          { label: 'Repository', value: installState.repository ?? 'None requested' }
        ]
      }));
    }
  });
}