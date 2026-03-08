import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from './config.js';

export interface PublicWidgetSessionClaims {
  version: 1;
  sessionId: string;
  projectId: string;
  projectKey: string;
  mode: 'widget' | 'embed';
  origin?: string;
  expiresAt: string;
}

interface CreatePublicWidgetSessionInput {
  projectId: string;
  projectKey: string;
  mode?: 'widget' | 'embed';
  origin?: string;
  ttlSeconds?: number;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  return url.origin;
}

function resolveRequestOrigin(request: FastifyRequest): string | null {
  const headerOrigin = request.headers.origin;
  if (typeof headerOrigin === 'string' && headerOrigin.length > 0) {
    try {
      return normalizeOrigin(headerOrigin);
    } catch {
      return null;
    }
  }

  const referer = request.headers.referer;
  if (typeof referer === 'string' && referer.length > 0) {
    try {
      return normalizeOrigin(referer);
    } catch {
      return null;
    }
  }

  return null;
}

export function createPublicWidgetSessionToken(
  config: AppConfig,
  input: CreatePublicWidgetSessionInput
): { token: string; claims: PublicWidgetSessionClaims } {
  const expiresAt = new Date(Date.now() + 1000 * (input.ttlSeconds ?? config.PUBLIC_WIDGET_SESSION_TTL_SECONDS));
  const claims: PublicWidgetSessionClaims = {
    version: 1,
    sessionId: randomUUID(),
    projectId: input.projectId,
    projectKey: input.projectKey,
    mode: input.mode ?? 'embed',
    expiresAt: expiresAt.toISOString(),
    ...(input.origin ? { origin: normalizeOrigin(input.origin) } : {})
  };

  const payload = toBase64Url(JSON.stringify(claims));
  const signature = signPayload(config.PUBLIC_WIDGET_SIGNING_SECRET, payload);
  return {
    token: `${payload}.${signature}`,
    claims
  };
}

export function verifyPublicWidgetSessionToken(config: AppConfig, token: string): PublicWidgetSessionClaims {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new Error('invalid widget session token');
  }

  const expectedSignature = signPayload(config.PUBLIC_WIDGET_SIGNING_SECRET, payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('widget session token signature mismatch');
  }

  const claims = JSON.parse(fromBase64Url(payload)) as PublicWidgetSessionClaims;
  if (claims.version !== 1) {
    throw new Error('unsupported widget session token version');
  }

  if (Number.isNaN(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= Date.now()) {
    throw new Error('widget session token expired');
  }

  if (claims.origin) {
    claims.origin = normalizeOrigin(claims.origin);
  }

  return claims;
}

export function requirePublicWidgetSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  expectedProject: { id: string; projectKey: string }
): PublicWidgetSessionClaims {
  const tokenFromHeader = request.headers['x-nexus-widget-token'];
  const queryToken = (request.query as Record<string, unknown> | undefined)?.accessToken;
  const candidate = typeof tokenFromHeader === 'string'
    ? tokenFromHeader
    : typeof queryToken === 'string'
      ? queryToken
      : null;

  if (!candidate) {
    throw app.httpErrors.unauthorized('missing widget access token');
  }

  let claims: PublicWidgetSessionClaims;
  try {
    claims = verifyPublicWidgetSessionToken(app.config, candidate);
  } catch (error) {
    throw app.httpErrors.unauthorized(error instanceof Error ? error.message : 'invalid widget access token');
  }

  if (claims.projectId !== expectedProject.id || claims.projectKey !== expectedProject.projectKey) {
    throw app.httpErrors.forbidden('widget access token project mismatch');
  }

  if (claims.origin) {
    const requestOrigin = resolveRequestOrigin(request);
    if (requestOrigin && requestOrigin !== claims.origin) {
      throw app.httpErrors.forbidden('widget access token origin mismatch');
    }
  }

  reply.header('x-nexus-widget-session-id', claims.sessionId);
  reply.header('x-nexus-widget-session-expires-at', claims.expiresAt);
  return claims;
}