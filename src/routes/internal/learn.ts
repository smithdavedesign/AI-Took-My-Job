import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { StoredProjectRolloutChecklist } from '../../types/learn.js';
import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const projectIdParamsSchema = z.object({
  projectId: z.string().uuid()
});

const rolloutStepSchema = z.object({
  status: z.enum(['not-started', 'in-progress', 'complete']),
  note: z.string().trim().max(4000).default('')
});

const rolloutChecklistSchema = z.object({
  steps: z.object({
    pilot: rolloutStepSchema,
    connect: rolloutStepSchema,
    launch: rolloutStepSchema,
    operate: rolloutStepSchema,
    promote: rolloutStepSchema
  })
});

function createDefaultChecklist(projectId: string): Omit<StoredProjectRolloutChecklist, 'createdAt' | 'updatedAt'> {
  return {
    id: randomUUID(),
    projectId,
    steps: {
      pilot: { status: 'not-started', note: '' },
      connect: { status: 'not-started', note: '' },
      launch: { status: 'not-started', note: '' },
      operate: { status: 'not-started', note: '' },
      promote: { status: 'not-started', note: '' }
    }
  };
}

export function registerLearnInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/projects/:projectId/rollout-checklist', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const project = await app.projects.findById(projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    const checklist = await app.projectRolloutChecklists.findByProjectId(projectId);
    return {
      project,
      checklist: checklist ?? createDefaultChecklist(projectId)
    };
  });

  app.put('/internal/projects/:projectId/rollout-checklist', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { projectId } = projectIdParamsSchema.parse(request.params);
    const payload = rolloutChecklistSchema.parse(request.body ?? {});
    const project = await app.projects.findById(projectId);
    if (!project) {
      throw app.httpErrors.notFound('project not found');
    }

    const existing = await app.projectRolloutChecklists.findByProjectId(projectId);
    const checklist = await app.projectRolloutChecklists.upsert({
      id: existing?.id ?? randomUUID(),
      projectId,
      steps: payload.steps,
      updatedBy: principal.id
    });

    await app.audit.write({
      eventType: 'project.rollout_checklist_updated',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        projectId,
        checklistId: checklist.id,
        completedStepCount: Object.values(checklist.steps).filter((step) => step.status === 'complete').length,
        inProgressStepCount: Object.values(checklist.steps).filter((step) => step.status === 'in-progress').length
      }
    });

    return {
      project,
      checklist
    };
  });
}