import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface AuthenticatedServicePrincipal {
  id: string;
  scopes: string[];
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
    throw app.httpErrors.unauthorized('missing bearer token');
  }

  const principal = app.config.INTERNAL_SERVICE_TOKENS.find((entry) => entry.token === token);
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
    scopes: principal.scopes
  };
}