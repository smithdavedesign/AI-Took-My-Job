import { Readable } from 'node:stream';

import type { ArtifactBundleRepository } from '../../repositories/artifact-bundle-repository.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import type { ReplayRunRepository } from '../../repositories/replay-run-repository.js';
import { buildReplayArtifacts } from '../replay/har-replay-plan.js';
import { executeReplayPlan } from '../replay/playwright-replay-executor.js';

async function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonArtifact(storage: ArtifactStore, storageKey: string): Promise<Record<string, unknown>> {
  const stream = await storage.readArtifact(storageKey);
  const text = await readStreamToString(stream);
  return JSON.parse(text) as Record<string, unknown>;
}

export async function runReplayValidation(input: {
  reportId: string;
  artifactStore: ArtifactStore;
  artifacts: ArtifactBundleRepository;
  replayRuns: ReplayRunRepository;
  baseUrl?: string;
  expectation: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
}): Promise<{
  passed: boolean;
  replayRunId: string;
  baselineStatus: string | null;
  actualStatus: 'reproduced' | 'not-reproduced' | 'partial' | 'execution-failed';
  baselineSummary: Record<string, unknown>;
  policy: {
    policyName: string;
    status: 'passed' | 'failed';
    baselineRequirement: string;
    outcomeRequirement: string;
    baselineRequirementMet: boolean;
    outcomeRequirementMet: boolean;
  };
  summary: Record<string, unknown>;
}> {
  const replayRun = await input.replayRuns.findLatestByReportId(input.reportId);
  if (!replayRun) {
    throw new Error(`no replay run is available for report ${input.reportId}`);
  }

  const artifacts = await input.artifacts.findByReportId(input.reportId);
  const harArtifact = artifacts.find((artifact) => artifact.artifactType === 'har');
  if (!harArtifact) {
    throw new Error(`no HAR artifact is available for report ${input.reportId}`);
  }

  const localStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'local-storage');
  const sessionStorageArtifact = artifacts.find((artifact) => artifact.artifactType === 'session-storage');
  const harText = await readStreamToString(await input.artifactStore.readArtifact(harArtifact.storageKey));
  const storageState = {
    localStorageKeys: localStorageArtifact ? Object.keys(await readJsonArtifact(input.artifactStore, localStorageArtifact.storageKey)) : [],
    sessionStorageKeys: sessionStorageArtifact ? Object.keys(await readJsonArtifact(input.artifactStore, sessionStorageArtifact.storageKey)) : []
  };
  const builtReplay = buildReplayArtifacts(harText, storageState);
  const execution = await executeReplayPlan({
    plan: builtReplay.plan,
    steps: builtReplay.executionSteps,
    ...(input.baseUrl ? { targetOrigin: input.baseUrl } : {})
  });

  const baselineStatus = replayRun.replayPlan?.execution?.status ?? null;
  const baselineRequirement = 'baseline must reproduce before promotion';
  const outcomeRequirement = `post-change replay must equal ${input.expectation}`;
  const baselineRequirementMet = baselineStatus === 'reproduced';
  const outcomeRequirementMet = execution.status === input.expectation;

  return {
    passed: baselineRequirementMet && outcomeRequirementMet,
    replayRunId: replayRun.id,
    baselineStatus,
    actualStatus: execution.status,
    policy: {
      policyName: 'fail-before-pass-after',
      status: baselineRequirementMet && outcomeRequirementMet ? 'passed' : 'failed',
      baselineRequirement,
      outcomeRequirement,
      baselineRequirementMet,
      outcomeRequirementMet
    },
    baselineSummary: replayRun.replayPlan?.execution
      ? {
        status: replayRun.replayPlan.execution.status,
        matchedFailingStepOrders: replayRun.replayPlan.execution.matchedFailingStepOrders,
        failingStepOrders: replayRun.replayPlan.execution.failingStepOrders,
        isolatedThirdPartyRequests: replayRun.replayPlan.execution.isolatedThirdPartyRequests,
        stepResults: replayRun.replayPlan.execution.stepResults
      }
      : {},
    summary: {
      expectedStatus: input.expectation,
      actualStatus: execution.status,
      baselineStatus,
      baselineRequirement,
      baselineRequirementMet,
      outcomeRequirement,
      outcomeRequirementMet,
      targetOrigin: input.baseUrl ?? null,
      matchedFailingStepOrders: execution.matchedFailingStepOrders,
      failingStepOrders: execution.failingStepOrders,
      isolatedThirdPartyRequests: execution.isolatedThirdPartyRequests,
      stepResults: execution.stepResults
    }
  };
}