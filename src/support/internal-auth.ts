import type { FastifyInstance, FastifyRequest } from 'fastify';

import { hashServiceToken } from '../repositories/service-identity-repository.js';
import { getOperatorSessionPrincipal } from './operator-session.js';

export interface AuthenticatedServicePrincipal {
  id: string;
  scopes: string[];
  source?: 'env' | 'manual';
  metadata?: Record<string, unknown>;
}

function parseBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(headerValue);
  return match?.[1] ?? null;
}

export function requireInternalServiceAuth(
  app: FastifyInstance,
  request: FastifyRequest,
  requiredScopes: string[]
): AuthenticatedServicePrincipal {
  const token = parseBearerToken(request.headers.authorization);

  if (!token) {
    const operatorPrincipal = getOperatorSessionPrincipal(request, app.config);
    if (!operatorPrincipal) {
      throw app.httpErrors.unauthorized('missing bearer token');
    }

    for (const scope of requiredScopes) {
      if (!operatorPrincipal.scopes.includes(scope)) {
        throw app.httpErrors.forbidden(`missing required scope: ${scope}`);
      }
    }

    return {
      id: operatorPrincipal.id,
      scopes: operatorPrincipal.scopes,
      source: 'manual',
      metadata: {
        authType: 'operator-session',
        username: operatorPrincipal.username
      }
    };
  }

  const tokenHash = hashServiceToken(token);
  const principal = app.servicePrincipals.find((entry) => entry.tokenHash === tokenHash);
  if (!principal) {
    throw app.httpErrors.unauthorized('invalid service token');
  }

  for (const scope of requiredScopes) {
    if (!principal.scopes.includes(scope)) {
      throw app.httpErrors.forbidden(`missing required scope: ${scope}`);
    }
  }

  return {
    id: principal.id,
    scopes: principal.scopes,
    ...(principal.source ? { source: principal.source } : {}),
    ...(Object.keys(principal.metadata).length > 0 ? { metadata: principal.metadata } : {})
  };
}