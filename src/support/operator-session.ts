import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from './config.js';

const OPERATOR_SESSION_COOKIE = 'nexus_operator_session';
const OPERATOR_SESSION_SCOPES = ['internal:read', 'github:draft', 'artifacts:download-url'] as const;

interface StoredOperatorSession {
  username: string;
  expiresAt: number;
}

export interface OperatorSessionPrincipal {
  id: string;
  username: string;
  scopes: string[];
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signValue(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookieHeader(headerValue: unknown): Record<string, string> {
  if (typeof headerValue !== 'string' || headerValue.trim().length === 0) {
    return {};
  }

  return Object.fromEntries(
    headerValue
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return [part, ''];
        }

        const key = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();
        return [key, decodeURIComponent(value)];
      })
  );
}

function serializeCookie(config: AppConfig, value: string, maxAgeSeconds: number): string {
  const parts = [
    `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];

  if (config.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function clearCookie(config: AppConfig): string {
  const parts = [
    `${OPERATOR_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0'
  ];

  if (config.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseNextPath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '/learn';
  }

  return input.startsWith('/') ? input : '/learn';
}

export function isOperatorAuthEnabled(config: AppConfig): boolean {
  return Boolean(config.OPERATOR_UI_USERNAME && config.OPERATOR_UI_PASSWORD);
}

export function getOperatorSessionPrincipal(request: FastifyRequest, config: AppConfig): OperatorSessionPrincipal | null {
  if (!isOperatorAuthEnabled(config)) {
    return null;
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const encodedCookie = cookies[OPERATOR_SESSION_COOKIE];
  if (!encodedCookie) {
    return null;
  }

  const separatorIndex = encodedCookie.lastIndexOf('.');
  if (separatorIndex <= 0) {
    return null;
  }

  const payload = encodedCookie.slice(0, separatorIndex);
  const signature = encodedCookie.slice(separatorIndex + 1);
  const expectedSignature = signValue(config.OPERATOR_SESSION_SECRET, payload);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as StoredOperatorSession;
    if (parsed.username !== config.OPERATOR_UI_USERNAME) {
      return null;
    }

    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now()) {
      return null;
    }

    return {
      id: `operator:${parsed.username}`,
      username: parsed.username,
      scopes: [...OPERATOR_SESSION_SCOPES]
    };
  } catch {
    return null;
  }
}

export function requireOperatorUiAccess(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isOperatorAuthEnabled(app.config)) {
    return true;
  }

  const principal = getOperatorSessionPrincipal(request, app.config);
  if (principal) {
    return true;
  }

  const nextPath = parseNextPath(request.raw.url ?? '/learn');
  void reply.redirect(`/operator/login?next=${encodeURIComponent(nextPath)}`);
  return false;
}

export function setOperatorSessionCookie(reply: FastifyReply, config: AppConfig, username: string): void {
  const payload = toBase64Url(JSON.stringify({
    username,
    expiresAt: Date.now() + (config.OPERATOR_SESSION_TTL_SECONDS * 1000)
  } satisfies StoredOperatorSession));
  const signedValue = `${payload}.${signValue(config.OPERATOR_SESSION_SECRET, payload)}`;
  reply.header('set-cookie', serializeCookie(config, signedValue, config.OPERATOR_SESSION_TTL_SECONDS));
}

export function clearOperatorSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.header('set-cookie', clearCookie(config));
}

export function authenticateOperatorCredentials(config: AppConfig, username: string, password: string): boolean {
  if (!isOperatorAuthEnabled(config)) {
    return false;
  }

  return safeEqual(username, config.OPERATOR_UI_USERNAME ?? '')
    && safeEqual(password, config.OPERATOR_UI_PASSWORD ?? '');
}

export function getOperatorSessionStatus(request: FastifyRequest, config: AppConfig): { enabled: boolean; authenticated: boolean; username: string | null } {
  const principal = getOperatorSessionPrincipal(request, config);
  return {
    enabled: isOperatorAuthEnabled(config),
    authenticated: Boolean(principal),
    username: principal?.username ?? null
  };
}

export function sanitizeNextPath(input: unknown): string {
  return parseNextPath(input);
}