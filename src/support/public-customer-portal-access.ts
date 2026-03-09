import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from './config.js';

export interface PublicCustomerPortalAccessClaims {
  version: 1;
  grantId: string;
  projectId: string;
  projectKey: string;
  customerEmail: string;
  expiresAt: string;
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

export function normalizeCustomerPortalEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function createPublicCustomerPortalAccessToken(
  config: AppConfig,
  input: {
    grantId: string;
    projectId: string;
    projectKey: string;
    customerEmail: string;
    expiresAt: string;
  }
): { token: string; claims: PublicCustomerPortalAccessClaims } {
  const claims: PublicCustomerPortalAccessClaims = {
    version: 1,
    grantId: input.grantId,
    projectId: input.projectId,
    projectKey: input.projectKey,
    customerEmail: normalizeCustomerPortalEmail(input.customerEmail),
    expiresAt: input.expiresAt
  };

  const payload = toBase64Url(JSON.stringify(claims));
  const signature = signPayload(config.PUBLIC_WIDGET_SIGNING_SECRET, payload);
  return {
    token: `${payload}.${signature}`,
    claims
  };
}

export function verifyPublicCustomerPortalAccessToken(config: AppConfig, token: string): PublicCustomerPortalAccessClaims {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new Error('invalid customer portal token');
  }

  const expectedSignature = signPayload(config.PUBLIC_WIDGET_SIGNING_SECRET, payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('customer portal token signature mismatch');
  }

  const claims = JSON.parse(fromBase64Url(payload)) as PublicCustomerPortalAccessClaims;
  if (claims.version !== 1) {
    throw new Error('unsupported customer portal token version');
  }

  if (Number.isNaN(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= Date.now()) {
    throw new Error('customer portal token expired');
  }

  claims.customerEmail = normalizeCustomerPortalEmail(claims.customerEmail);
  return claims;
}

export function requirePublicCustomerPortalToken(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  expectedProject: { id: string; projectKey: string }
): PublicCustomerPortalAccessClaims {
  const tokenFromHeader = request.headers['x-nexus-customer-portal-token'];
  const queryToken = (request.query as Record<string, unknown> | undefined)?.accessToken;
  const candidate = typeof tokenFromHeader === 'string'
    ? tokenFromHeader
    : typeof queryToken === 'string'
      ? queryToken
      : null;

  if (!candidate) {
    throw app.httpErrors.unauthorized('missing customer portal access token');
  }

  let claims: PublicCustomerPortalAccessClaims;
  try {
    claims = verifyPublicCustomerPortalAccessToken(app.config, candidate);
  } catch (error) {
    throw app.httpErrors.unauthorized(error instanceof Error ? error.message : 'invalid customer portal access token');
  }

  if (claims.projectId !== expectedProject.id || claims.projectKey !== expectedProject.projectKey) {
    throw app.httpErrors.forbidden('customer portal token project mismatch');
  }

  reply.header('x-nexus-customer-portal-grant-id', claims.grantId);
  reply.header('x-nexus-customer-portal-expires-at', claims.expiresAt);
  return claims;
}