import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  buildGitHubAppInstallationUrl,
  getGitHubAppInstallationDetails,
  listGitHubInstallationRepositories
} from '../../integrations/github/client.js';
import { createGitHubAppInstallState, verifyGitHubAppInstallState } from '../../support/github-app-install-state.js';
import { createPublicWidgetSessionToken } from '../../support/public-widget-access.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const workspaceIdParamsSchema = z.object({
  workspaceId: z.string().uuid()
});

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});

const projectKeyParamsSchema = z.object({
  projectKey: z.string().min(3).max(80)
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
      actorType: 'system',
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
      actorType: 'system',
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
      actorType: 'system',
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
      throw app.httpErrors.conflict('project already has a default repository connection');
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
      actorType: 'system',
      actorId: principal.id,
      requestId: request.id,
      payload: connection
    });

    return reply.code(201).send(connection);
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
      const details = await getGitHubAppInstallationDetails(app.config, query.installation_id);
      const repositories = await listGitHubInstallationRepositories(app.config, query.installation_id);
      const existingInstallation = await app.githubInstallations.findByInstallationId(query.installation_id);
      if (existingInstallation && existingInstallation.workspaceId !== workspace.id) {
        reply.type('text/html; charset=utf-8');
        return reply.code(409).send(buildGitHubAppInstallResultPage({
          status: 'error',
          title: 'Installation already linked',
          message: 'This GitHub App installation is already mapped to a different workspace.',
          details: [
            { label: 'Installation', value: String(query.installation_id) },
            { label: 'Workspace Id', value: existingInstallation.workspaceId }
          ]
        }));
      }

      const syncedInstallation = await app.githubInstallations.upsert({
        id: existingInstallation?.id ?? randomUUID(),
        workspaceId: workspace.id,
        provider: 'github',
        installationId: query.installation_id,
        ...(details.accountLogin ? { accountLogin: details.accountLogin } : {}),
        ...(details.accountType ? { accountType: details.accountType } : {}),
        metadata: {
          targetType: details.targetType ?? null,
          repositoriesSelection: details.repositoriesSelection ?? null,
          permissions: details.permissions,
          repositoryCount: repositories.length,
          lastSetupAction: query.setup_action ?? 'install',
          lastSyncedAt: new Date().toISOString()
        }
      });

      let linkedRepository = installState.repository ?? null;
      let linkStatus = 'installation persisted';
      if (project && installState.repository) {
        const repositoryAvailable = repositories.some((repository) => repository.fullName === installState.repository);
        if (!repositoryAvailable) {
          linkStatus = 'installation saved, repository not visible to this installation';
          linkedRepository = null;
        } else {
          const existingConnection = await app.repoConnections.findByProjectIdAndRepository(project.id, installState.repository);
          if (existingConnection) {
            await app.repoConnections.update(existingConnection.id, {
              githubInstallationId: syncedInstallation.id,
              status: 'active',
              config: {
                onboardingSource: 'github-app-callback',
                installationId: query.installation_id,
                accountLogin: details.accountLogin ?? null
              }
            });
          } else {
            const existingConnections = await app.repoConnections.findByProjectId(project.id);
            const shouldBeDefault = installState.isDefault === true && !existingConnections.some((connection) => connection.isDefault);
            await app.repoConnections.create({
              id: randomUUID(),
              projectId: project.id,
              githubInstallationId: syncedInstallation.id,
              provider: 'github',
              repository: installState.repository,
              isDefault: shouldBeDefault || existingConnections.length === 0,
              status: 'active',
              config: {
                onboardingSource: 'github-app-callback',
                installationId: query.installation_id,
                accountLogin: details.accountLogin ?? null
              }
            });
          }

          linkStatus = 'installation persisted and repository linked';
        }
      }

      await app.audit.write({
        eventType: 'github_app.installation_synced',
        actorType: 'system',
        actorId: details.accountLogin ?? String(query.installation_id),
        requestId: request.id,
        payload: {
          workspaceId: workspace.id,
          projectId: project?.id ?? null,
          repository: installState.repository ?? null,
          installationId: query.installation_id,
          setupAction: query.setup_action ?? 'install',
          linkStatus
        }
      });

      reply.type('text/html; charset=utf-8');
      return reply.send(buildGitHubAppInstallResultPage({
        status: linkedRepository || !installState.repository ? 'success' : 'partial',
        title: linkedRepository || !installState.repository ? 'GitHub App connected' : 'GitHub App connected with follow-up needed',
        message: linkedRepository || !installState.repository
          ? 'The installation metadata is now stored locally and ready for project-scoped GitHub resolution.'
          : 'The installation was stored, but the requested repository was not visible to this installation. Re-run the install flow after expanding repository access or attach the installation manually to another repository connection.',
        details: [
          { label: 'Workspace', value: workspace.name },
          { label: 'Project', value: project ? project.name : 'Not linked during install' },
          { label: 'Installation', value: String(query.installation_id) },
          { label: 'Account', value: details.accountLogin ?? 'Unknown account' },
          { label: 'Repository Link', value: linkedRepository ?? 'No repository linked' },
          { label: 'Result', value: linkStatus }
        ],
        repositories: repositories.map((repository) => repository.fullName)
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