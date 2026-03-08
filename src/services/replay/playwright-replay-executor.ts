import { request } from 'playwright-core';
import { URL } from 'node:url';

import type { ReplayExecutionResult, ReplayExecutionStepResult, ReplayPlan } from '../../types/replay.js';

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
  const hasStorageState = resolvedOrigin && (Object.keys(cookieMap).length > 0 || Object.keys(localStorage).length > 0);
  const client = await request.newContext({
    ignoreHTTPSErrors: true,
    ...(hasStorageState ? {
      storageState: {
        cookies: Object.entries(cookieMap).map(([name, value]) => ({
          name,
          value: String(value),
          domain: new URL(resolvedOrigin).hostname,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const
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

  const stepResults: ReplayExecutionStepResult[] = [];
  let resolvedStateReferenceCount = 0;

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

  const verificationStatus = computeVerificationStatus(stepResults);

  return {
    executedAt: new Date().toISOString(),
    status: verificationStatus,
    isolatedThirdPartyRequests: stepResults.filter((step) => step.result === 'skipped-third-party').length,
    failingStepOrders: stepResults.filter((step) => step.expectedStatus >= 400).map((step) => step.order),
    matchedFailingStepOrders: stepResults
      .filter((step) => step.expectedStatus >= 400 && step.result === 'matched')
      .map((step) => step.order),
    resolvedStateReferenceCount,
    restoredCookieNames: Object.keys(cookieMap),
    restoredLocalStorageKeys: Object.keys(localStorage),
    restoredSessionStorageKeys: Object.keys(sessionStorage),
    stepResults
  };
}