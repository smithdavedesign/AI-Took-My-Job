import { request } from 'playwright-core';

import type { ReplayExecutionResult, ReplayExecutionStepResult, ReplayPlan } from '../../types/replay.js';

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
}): Promise<ReplayExecutionResult> {
  const client = await request.newContext({
    ignoreHTTPSErrors: true
  });

  const stepResults: ReplayExecutionStepResult[] = [];

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
      try {
        const response = await client.fetch(step.url, {
          method: step.method,
          headers: filterHeaders(step.headers),
          ...(step.bodyText ? { data: step.bodyText } : {}),
          failOnStatusCode: false
        });

        const actualStatus = response.status();
        stepResults.push({
          order: step.order,
          method: step.method,
          url: step.url,
          expectedStatus: step.expectedStatus,
          actualStatus,
          durationMs: Date.now() - startedAt,
          result: actualStatus === step.expectedStatus ? 'matched' : 'mismatched'
        });
      } catch (error) {
        stepResults.push({
          order: step.order,
          method: step.method,
          url: step.url,
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
    stepResults
  };
}