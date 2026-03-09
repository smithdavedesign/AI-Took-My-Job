import { randomBytes, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireInternalServiceAuth } from '../../support/internal-auth.js';

const serviceIdentityIdParamsSchema = z.object({
  identityId: z.string().min(3).max(255)
});

const createServiceIdentitySchema = z.object({
  id: z.string().min(3).max(255).optional(),
  scopes: z.array(z.string().min(1).max(255)).min(1).max(20),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const rotateServiceIdentitySchema = z.object({
  scopes: z.array(z.string().min(1).max(255)).min(1).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

async function refreshActiveServicePrincipals(app: FastifyInstance): Promise<void> {
  app.servicePrincipals = await app.serviceIdentityRepository.listActive();
}

export function registerServiceIdentityInternalRoutes(app: FastifyInstance): void {
  app.get('/internal/service-identities', async (request) => {
    requireInternalServiceAuth(app, request, ['internal:read']);
    return app.serviceIdentityRepository.listAll();
  });

  app.post('/internal/service-identities', async (request, reply) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const payload = createServiceIdentitySchema.parse(request.body ?? {});
    const token = randomBytes(24).toString('hex');
    const id = payload.id ?? `service-${randomUUID()}`;
    const created = await app.serviceIdentityRepository.createManualPrincipal({
      id,
      token,
      scopes: payload.scopes,
      metadata: payload.metadata ?? {}
    });

    await refreshActiveServicePrincipals(app);
    await app.audit.write({
      eventType: 'service_identity.created',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        id: created.id,
        scopes: created.scopes,
        source: created.source
      }
    });

    return reply.code(201).send({
      identity: created,
      token
    });
  });

  app.post('/internal/service-identities/:identityId/rotate', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { identityId } = serviceIdentityIdParamsSchema.parse(request.params);
    const payload = rotateServiceIdentitySchema.parse(request.body ?? {});
    const token = randomBytes(24).toString('hex');
    const rotated = await app.serviceIdentityRepository.rotatePrincipal({
      id: identityId,
      token,
      ...(payload.scopes ? { scopes: payload.scopes } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {})
    });

    if (!rotated) {
      throw app.httpErrors.notFound('service identity not found');
    }

    await refreshActiveServicePrincipals(app);
    await app.audit.write({
      eventType: 'service_identity.rotated',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        id: rotated.id,
        scopes: rotated.scopes
      }
    });

    return {
      identity: rotated,
      token
    };
  });

  app.post('/internal/service-identities/:identityId/revoke', async (request) => {
    const principal = requireInternalServiceAuth(app, request, ['internal:read']);
    const { identityId } = serviceIdentityIdParamsSchema.parse(request.params);
    const revoked = await app.serviceIdentityRepository.revoke(identityId);

    if (!revoked) {
      throw app.httpErrors.notFound('service identity not found');
    }

    await refreshActiveServicePrincipals(app);
    await app.audit.write({
      eventType: 'service_identity.revoked',
      actorType: 'service',
      actorId: principal.id,
      requestId: request.id,
      payload: {
        id: revoked.id
      }
    });

    return {
      revoked: true,
      identity: revoked
    };
  });
}