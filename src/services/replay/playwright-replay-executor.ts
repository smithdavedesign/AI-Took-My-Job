import { chromium, request } from 'playwright-core';
import { URL } from 'node:url';

import type { ReplayCookieRecord, ReplayExecutionResult, ReplayExecutionStepResult, ReplayPlan } from '../../types/replay.js';

function parseCookieHeader(value: string): Record<string, string> {
  return Object.fromEntries(
    value.split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return separator >= 0
          ? [part.slice(0, separator), part.slice(separator + 1)]
          : [part, ''];
      })
  );
}

function replaceStatePlaceholders(value: string, state: {
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}): { value: string; replacements: number } {
  let replacements = 0;
  const resolved = value.replace(/\{\{(cookies|localStorage|sessionStorage)\.([a-zA-Z0-9_-]+)\}\}/g, (_match, scope: 'cookies' | 'localStorage' | 'sessionStorage', key: string) => {
    const source = state[scope];
    if (!(key in source)) {
      return _match;
    }

    replacements += 1;
    return source[key] ?? '';
  });

  return {
    value: resolved,
    replacements
  };
}

export interface ReplayExecutionInputStep {
  order: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  expectedStatus: number;
  isThirdParty: boolean;
}

function filterHeaders(headers: Record<string, string>): Record<string, string> {
  const blocked = new Set(['host', 'content-length', 'connection', 'accept-encoding']);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase()))
  );
}

function toCookieExpiry(expiresAt?: string | null): number {
  if (!expiresAt) {
    return -1;
  }

  const unixSeconds = Math.floor(new Date(expiresAt).getTime() / 1000);
  return Number.isFinite(unixSeconds) ? unixSeconds : -1;
}

function buildRestoredCookies(input: {
  plan: ReplayPlan;
  resolvedOrigin?: string | undefined;
  cookieMap: Record<string, string>;
}): ReplayCookieRecord[] {
  const baseDomain = input.resolvedOrigin ? new URL(input.resolvedOrigin).hostname : undefined;
  const plannedCookies = input.plan.storageState.cookies ?? [];
  const restored = new Map<string, ReplayCookieRecord>();

  for (const cookie of plannedCookies) {
    const value = cookie.value ?? input.cookieMap[cookie.name];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    const restoredCookie: ReplayCookieRecord = {
      ...cookie,
      value,
      path: cookie.path ?? '/'
    };
    const resolvedDomain = cookie.domain ?? baseDomain;
    if (typeof resolvedDomain === 'string' && resolvedDomain.length > 0) {
      restoredCookie.domain = resolvedDomain;
    }

    restored.set(`${cookie.name}|${cookie.domain ?? ''}|${cookie.path ?? '/'}`, {
      ...restoredCookie
    });
  }

  for (const [name, value] of Object.entries(input.cookieMap)) {
    const key = `${name}|${baseDomain ?? ''}|/`;
    if (!restored.has(key)) {
      const restoredCookie: ReplayCookieRecord = {
        name,
        value,
        path: '/',
        sameSite: 'Lax'
      };
      if (baseDomain) {
        restoredCookie.domain = baseDomain;
      }

      restored.set(key, restoredCookie);
    }
  }

  return [...restored.values()];
}

function computeVerificationStatus(stepResults: ReplayExecutionStepResult[]): ReplayExecutionResult['status'] {
  const relevant = stepResults.filter((step) => step.result !== 'skipped-third-party');
  const failingExpected = relevant.filter((step) => step.expectedStatus >= 400);

  if (relevant.some((step) => step.result === 'network-error')) {
    return 'execution-failed';
  }

  if (failingExpected.length === 0) {
    return relevant.every((step) => step.result === 'matched') ? 'not-reproduced' : 'partial';
  }

  const matchedFailing = failingExpected.filter((step) => step.result === 'matched');
  if (matchedFailing.length === failingExpected.length) {
    return 'reproduced';
  }

  if (matchedFailing.length > 0) {
    return 'partial';
  }

  return 'not-reproduced';
}

async function executeInBrowserContext(input: {
  steps: ReplayExecutionInputStep[];
  resolvedOrigin: string;
  restoredCookies: ReplayCookieRecord[];
  restoredState: {
    cookies: Record<string, string>;
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  };
  targetOrigin?: string;
}): Promise<{ stepResults: ReplayExecutionStepResult[]; resolvedStateReferenceCount: number }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: {
      cookies: input.restoredCookies.map((cookie) => ({
        name: cookie.name,
        value: String(cookie.value ?? ''),
        domain: cookie.domain ?? new URL(input.resolvedOrigin).hostname,
        path: cookie.path ?? '/',
        expires: toCookieExpiry(cookie.expiresAt),
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? false,
        sameSite: cookie.sameSite ?? 'Lax'
      })),
      origins: Object.keys(input.restoredState.localStorage).length > 0
        ? [{
          origin: input.resolvedOrigin,
          localStorage: Object.entries(input.restoredState.localStorage).map(([name, value]) => ({ name, value }))
        }]
        : []
    }
  });
  const page = await context.newPage();
  const stepResults: ReplayExecutionStepResult[] = [];
  let resolvedStateReferenceCount = 0;

  try {
    await page.goto(input.resolvedOrigin, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(() => undefined);

    if (Object.keys(input.restoredState.sessionStorage).length > 0) {
      await page.evaluate((sessionEntries) => {
        for (const [key, value] of sessionEntries) {
          window.sessionStorage.setItem(key, value);
        }
      }, Object.entries(input.restoredState.sessionStorage));
    }

    for (const step of input.steps) {
      if (step.isThirdParty) {
        stepResults.push({
          order: step.order,
          method: step.method,
          url: step.url,
          expectedStatus: step.expectedStatus,
          result: 'skipped-third-party'
        });
        continue;
      }

      const startedAt = Date.now();
      const restoredUrl = replaceStatePlaceholders(step.url, input.restoredState);
      resolvedStateReferenceCount += restoredUrl.replacements;
      const requestUrl = input.targetOrigin
        ? (() => {
          const original = new URL(restoredUrl.value);
          const target = new URL(input.targetOrigin);
          target.pathname = original.pathname;
          target.search = original.search;
          return target.toString();
        })()
        : restoredUrl.value;
      const resolvedHeaders = Object.fromEntries(Object.entries(filterHeaders(step.headers)).map(([key, value]) => {
        const resolved = replaceStatePlaceholders(value, input.restoredState);
        resolvedStateReferenceCount += resolved.replacements;
        return [key, resolved.value];
      }));
      const resolvedBody = step.bodyText
        ? replaceStatePlaceholders(step.bodyText, input.restoredState)
        : null;
      if (resolvedBody) {
        resolvedStateReferenceCount += resolvedBody.replacements;
      }

      try {
        const response = await page.evaluate(async (requestInput) => {
          const init: RequestInit = {
            method: requestInput.method,
            headers: requestInput.headers,
            credentials: 'include'
          };
          if (requestInput.body !== null) {
            init.body = requestInput.body;
          }

          const response = await fetch(requestInput.url, init);

          return {
            status: response.status
          };
        }, {
          url: requestUrl,
          method: step.method,
          headers: resolvedHeaders,
          body: resolvedBody?.value ?? null
        });

        stepResults.push({
          order: step.order,
          method: step.method,
          url: requestUrl,
          expectedStatus: step.expectedStatus,
          actualStatus: response.status,
          durationMs: Date.now() - startedAt,
          result: response.status === step.expectedStatus ? 'matched' : 'mismatched'
        });
      } catch (error) {
        stepResults.push({
          order: step.order,
          method: step.method,
          url: requestUrl,
          expectedStatus: step.expectedStatus,
          durationMs: Date.now() - startedAt,
          result: 'network-error',
          errorMessage: error instanceof Error ? error.message : 'unknown browser context error'
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return {
    stepResults,
    resolvedStateReferenceCount
  };
}

export async function executeReplayPlan(input: {
  plan: ReplayPlan;
  steps: ReplayExecutionInputStep[];
  targetOrigin?: string;
  storageSnapshot?: {
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  };
}): Promise<ReplayExecutionResult> {
  const firstPartyStep = input.steps.find((step) => !step.isThirdParty);
  const resolvedOrigin = input.targetOrigin
    ? new URL(input.targetOrigin).origin
    : firstPartyStep ? new URL(firstPartyStep.url).origin : undefined;
  const cookieMap = Object.assign({}, ...input.steps
    .filter((step) => !step.isThirdParty)
    .map((step) => step.headers.cookie)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => parseCookieHeader(value)));
  const localStorage = Object.fromEntries(
    Object.entries(input.storageSnapshot?.localStorage ?? {}).map(([key, value]) => [key, String(value)])
  );
  const sessionStorage = Object.fromEntries(
    Object.entries(input.storageSnapshot?.sessionStorage ?? {}).map(([key, value]) => [key, String(value)])
  );
  const restoredState = {
    cookies: cookieMap,
    localStorage,
    sessionStorage
  };
  const restoredCookies = buildRestoredCookies({
    plan: input.plan,
    resolvedOrigin,
    cookieMap
  });
  let stepResults: ReplayExecutionStepResult[] = [];
  let resolvedStateReferenceCount = 0;
  let executionMode: ReplayExecutionResult['executionMode'] = 'request-context';

  if (resolvedOrigin) {
    try {
      const browserExecution = await executeInBrowserContext({
        steps: input.steps,
        resolvedOrigin,
        restoredCookies,
        restoredState,
        ...(input.targetOrigin ? { targetOrigin: input.targetOrigin } : {})
      });
      stepResults = browserExecution.stepResults;
      resolvedStateReferenceCount = browserExecution.resolvedStateReferenceCount;
      executionMode = 'browser-context';
    } catch {
      executionMode = 'request-context';
    }
  }

  if (stepResults.length === 0) {
    const hasStorageState = resolvedOrigin && (Object.keys(cookieMap).length > 0 || Object.keys(localStorage).length > 0);
    const client = await request.newContext({
      ignoreHTTPSErrors: true,
      ...(hasStorageState ? {
        storageState: {
          cookies: restoredCookies.map((cookie) => ({
            name: cookie.name,
            value: String(cookie.value ?? ''),
            domain: cookie.domain ?? new URL(resolvedOrigin).hostname,
            path: cookie.path ?? '/',
            expires: toCookieExpiry(cookie.expiresAt),
            httpOnly: cookie.httpOnly ?? false,
            secure: cookie.secure ?? false,
            sameSite: cookie.sameSite ?? 'Lax'
          })),
          origins: Object.keys(localStorage).length > 0
            ? [{
              origin: resolvedOrigin,
              localStorage: Object.entries(localStorage).map(([name, value]) => ({ name, value }))
            }]
            : []
        }
      } : {})
    });

    try {
      for (const step of input.steps) {
        if (step.isThirdParty) {
          stepResults.push({
            order: step.order,
            method: step.method,
            url: step.url,
            expectedStatus: step.expectedStatus,
            result: 'skipped-third-party'
          });
          continue;
        }

        const startedAt = Date.now();
        const restoredUrl = replaceStatePlaceholders(step.url, restoredState);
        resolvedStateReferenceCount += restoredUrl.replacements;
        const requestUrl = input.targetOrigin
          ? (() => {
            const original = new URL(restoredUrl.value);
            const target = new URL(input.targetOrigin);
            target.pathname = original.pathname;
            target.search = original.search;
            return target.toString();
          })()
          : restoredUrl.value;
        const resolvedHeaders = Object.fromEntries(Object.entries(filterHeaders(step.headers)).map(([key, value]) => {
          const resolved = replaceStatePlaceholders(value, restoredState);
          resolvedStateReferenceCount += resolved.replacements;
          return [key, resolved.value];
        }));
        const resolvedBody = step.bodyText
          ? replaceStatePlaceholders(step.bodyText, restoredState)
          : null;
        if (resolvedBody) {
          resolvedStateReferenceCount += resolvedBody.replacements;
        }

        try {
          const response = await client.fetch(requestUrl, {
            method: step.method,
            headers: resolvedHeaders,
            ...(resolvedBody ? { data: resolvedBody.value } : {}),
            failOnStatusCode: false
          });

          const actualStatus = response.status();
          stepResults.push({
            order: step.order,
            method: step.method,
            url: requestUrl,
            expectedStatus: step.expectedStatus,
            actualStatus,
            durationMs: Date.now() - startedAt,
            result: actualStatus === step.expectedStatus ? 'matched' : 'mismatched'
          });
        } catch (error) {
          stepResults.push({
            order: step.order,
            method: step.method,
            url: requestUrl,
            expectedStatus: step.expectedStatus,
            durationMs: Date.now() - startedAt,
            result: 'network-error',
            errorMessage: error instanceof Error ? error.message : 'unknown network error'
          });
        }
      }
    } finally {
      await client.dispose();
    }
  }

  const verificationStatus = computeVerificationStatus(stepResults);

  return {
    executedAt: new Date().toISOString(),
    status: verificationStatus,
    executionMode,
    isolatedThirdPartyRequests: stepResults.filter((step) => step.result === 'skipped-third-party').length,
    failingStepOrders: stepResults.filter((step) => step.expectedStatus >= 400).map((step) => step.order),
    matchedFailingStepOrders: stepResults
      .filter((step) => step.expectedStatus >= 400 && step.result === 'matched')
      .map((step) => step.order),
    resolvedStateReferenceCount,
    restoredCookieNames: restoredCookies.map((cookie) => cookie.name),
    restoredCookies: restoredCookies.map((cookie) => {
      const result: ReplayCookieRecord = {
        name: cookie.name,
        ...(cookie.path ? { path: cookie.path } : {}),
        ...(cookie.expiresAt ? { expiresAt: cookie.expiresAt } : { expiresAt: null })
      };

      if (cookie.domain) {
        result.domain = cookie.domain;
      }
      if (typeof cookie.secure === 'boolean') {
        result.secure = cookie.secure;
      }
      if (typeof cookie.httpOnly === 'boolean') {
        result.httpOnly = cookie.httpOnly;
      }
      if (cookie.sameSite) {
        result.sameSite = cookie.sameSite;
      }

      return result;
    }),
    restoredLocalStorageKeys: Object.keys(localStorage),
    restoredSessionStorageKeys: Object.keys(sessionStorage),
    stepResults
  };
}