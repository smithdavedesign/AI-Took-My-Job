import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
}