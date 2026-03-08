import { URL } from 'node:url';

import type { ReplayPlan, ReplayStep } from '../../types/replay.js';

interface HarHeader {
  name?: string;
  value?: string;
}

interface HarPostData {
  text?: string;
}

interface HarEntry {
  pageref?: string;
  startedDateTime?: string;
  request: {
    method?: string;
    url?: string;
    headers?: HarHeader[];
    postData?: HarPostData;
  };
  response: {
    status?: number;
    headers?: HarHeader[];
    content?: {
      mimeType?: string;
      size?: number;
      text?: string;
    };
  };
}

interface HarLog {
  pages?: Array<{ id?: string; title?: string }>;
  entries?: HarEntry[];
}

interface HarDocument {
  log?: HarLog;
}

export interface ReplayExecutionSourceStep {
  order: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  expectedStatus: number;
  isThirdParty: boolean;
}

export interface BuiltReplayArtifacts {
  plan: ReplayPlan;
  executionSteps: ReplayExecutionSourceStep[];
}

function extractCookieNames(headers: HarHeader[]): string[] {
  const cookieHeader = headers.find((header) => header.name?.toLowerCase() === 'cookie')?.value;
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter((value): value is string => Boolean(value));
}

function toHeaderMap(headers: HarHeader[]): Record<string, string> {
  return Object.fromEntries(
    headers
      .filter((header) => header.name && typeof header.value === 'string')
      .map((header) => [header.name!.toLowerCase(), header.value!])
  );
}

function extractBodyDependencies(bodyText?: string): string[] {
  if (!bodyText) {
    return [];
  }

  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    return Object.keys(parsed).filter((key) => /(id|cart|checkout|session|order|user)/i.test(key));
  } catch {
    return [];
  }
}

function maskUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  for (const key of ['token', 'auth', 'key', 'apikey', 'api_key', 'access_token']) {
    if (parsed.searchParams.has(key)) {
      parsed.searchParams.set(key, `[${key.toUpperCase()}]`);
    }
  }
  return parsed.toString();
}

function pickDataDependencies(pathname: string, queryKeys: string[]): string[] {
  const detected = new Set<string>();
  for (const segment of pathname.split('/')) {
    if (segment.startsWith(':')) {
      detected.add(segment.slice(1));
    }
  }

  for (const key of queryKeys) {
    if (/(id|cart|checkout|session|order|user)/i.test(key)) {
      detected.add(key);
    }
  }

  return [...detected];
}

function summarizeStep(entry: HarEntry, order: number, primaryHostname: string | null): { planStep: ReplayStep; executionStep: ReplayExecutionSourceStep } | null {
  const urlValue = entry.request.url;
  if (!urlValue) {
    return null;
  }

  const parsed = new URL(urlValue);
  const queryKeys = [...parsed.searchParams.keys()];
  const headers = entry.request.headers ?? [];
  const requestHeaderKeys = headers.map((header) => header.name?.toLowerCase() ?? '').filter(Boolean);
  const cookieNames = extractCookieNames(headers);
  const isThirdParty = primaryHostname !== null && parsed.hostname !== primaryHostname;
  const authRefreshCandidate = /(refresh|renew|token|session)/i.test(parsed.pathname);
  const bodyText = entry.request.postData?.text;

  return {
    planStep: {
      order,
      ...(entry.startedDateTime ? { startedAt: entry.startedDateTime } : {}),
      method: entry.request.method ?? 'GET',
      url: maskUrl(urlValue),
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      queryKeys,
      requestHeaderKeys,
      cookieNames,
      isThirdParty,
      authRefreshCandidate,
      responseStatus: entry.response.status ?? 0,
      ...(entry.response.content?.mimeType ? { responseMimeType: entry.response.content.mimeType } : {}),
      ...(bodyText ? { requestBodySize: bodyText.length } : {}),
      ...(typeof entry.response.content?.size === 'number' ? { responseBodySize: entry.response.content.size } : {})
    },
    executionStep: {
      order,
      method: entry.request.method ?? 'GET',
      url: urlValue,
      headers: toHeaderMap(headers),
      ...(bodyText ? { bodyText } : {}),
      expectedStatus: entry.response.status ?? 0,
      isThirdParty
    }
  };
}

export function buildReplayArtifacts(harText: string, storageState?: ReplayPlan['storageState']): BuiltReplayArtifacts {
  const document = JSON.parse(harText) as HarDocument;
  const log = document.log;
  if (!log) {
    throw new Error('HAR is missing log object');
  }

  const pages = log.pages ?? [];
  const entries = log.entries ?? [];
  const primaryHostname = entries[0]?.request.url ? new URL(entries[0].request.url).hostname : null;
  const builtSteps = entries
    .map((entry, index) => summarizeStep(entry, index + 1, primaryHostname))
    .filter((step): step is NonNullable<typeof step> => step !== null);
  const steps = builtSteps.map((step) => step.planStep);
  const executionSteps = builtSteps.map((step) => step.executionStep);

  const distinctHostnames = [...new Set(steps.map((step) => step.hostname))];
  const thirdPartyHostnames = [...new Set(steps.filter((step) => step.isThirdParty).map((step) => step.hostname))];
  const authSignals = [...new Set(steps.flatMap((step) => step.requestHeaderKeys.filter((key) => /(authorization|cookie|x-csrf-token|x-auth-token)/i.test(key))))];
  const authRefreshPaths = [...new Set(steps.filter((step) => step.authRefreshCandidate).map((step) => step.pathname))];
  const dataDependencies = [...new Set(builtSteps.flatMap((step) => [
    ...pickDataDependencies(step.planStep.pathname, step.planStep.queryKeys),
    ...extractBodyDependencies(step.executionStep.bodyText)
  ]))];
  const cookieNames = [...new Set(steps.flatMap((step) => step.cookieNames))];

  return {
    plan: {
      ...(steps[0] ? { entryUrl: steps[0].url } : {}),
      pageRefs: pages.map((page) => page.id ?? page.title ?? 'unknown-page'),
      requestCount: steps.length,
      distinctHostnames,
      thirdPartyHostnames,
      steps,
      authSignals,
      authRefreshPaths,
      dataDependencies,
      storageState: {
        localStorageKeys: storageState?.localStorageKeys ?? [],
        sessionStorageKeys: storageState?.sessionStorageKeys ?? [],
        cookieNames
      }
    },
    executionSteps
  };
}

export function summarizeReplayPlan(plan: ReplayPlan): Record<string, unknown> {
  return {
    requestCount: plan.requestCount,
    distinctHostnames: plan.distinctHostnames,
    thirdPartyHostnames: plan.thirdPartyHostnames,
    authSignals: plan.authSignals,
    authRefreshPaths: plan.authRefreshPaths,
    dataDependencies: plan.dataDependencies,
    storageState: plan.storageState,
    ...(plan.execution ? {
      execution: {
        status: plan.execution.status,
        isolatedThirdPartyRequests: plan.execution.isolatedThirdPartyRequests,
        matchedFailingStepOrders: plan.execution.matchedFailingStepOrders
      }
    } : {}),
    replayable: plan.requestCount > 0
  };
}