import type { StoredAgentTaskExecutionTelemetry, StoredAgentTaskExecutionTimelineEvent } from '../../types/agent-tasks.js';

export interface BuildExecutionTelemetryPayloadInput {
  modelTier?: string | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
  costUsd?: number | undefined;
  durationMs?: number | undefined;
  retryCount?: number | undefined;
  chainDepth?: number | undefined;
  correlationId?: string | undefined;
  executionTimeline?: StoredAgentTaskExecutionTimelineEvent[] | undefined;
  escalationReason?: string | undefined;
}

export interface BuiltExecutionTelemetryPayload {
  telemetry?: StoredAgentTaskExecutionTelemetry | undefined;
  correlationId?: string | undefined;
  executionTimeline?: StoredAgentTaskExecutionTimelineEvent[] | undefined;
}

export function buildExecutionTelemetryPayload(input: BuildExecutionTelemetryPayloadInput): BuiltExecutionTelemetryPayload {
  const telemetry: StoredAgentTaskExecutionTelemetry = {};

  if (input.modelTier) telemetry.modelTier = input.modelTier;
  if (typeof input.promptTokens === 'number') telemetry.promptTokens = input.promptTokens;
  if (typeof input.completionTokens === 'number') telemetry.completionTokens = input.completionTokens;
  if (typeof input.totalTokens === 'number') telemetry.totalTokens = input.totalTokens;
  if (typeof input.costUsd === 'number') telemetry.costUsd = input.costUsd;
  if (typeof input.durationMs === 'number') telemetry.durationMs = input.durationMs;
  if (typeof input.retryCount === 'number') telemetry.retryCount = input.retryCount;
  if (typeof input.chainDepth === 'number') telemetry.chainDepth = input.chainDepth;
  if (input.correlationId) telemetry.correlationId = input.correlationId;
  if (input.escalationReason) telemetry.escalationReason = input.escalationReason;

  const executionTimeline = Array.isArray(input.executionTimeline)
    ? input.executionTimeline.filter((entry) => entry && typeof entry.stage === 'string' && typeof entry.at === 'string')
    : undefined;

  return {
    telemetry: Object.keys(telemetry).length > 0 ? telemetry : undefined,
    correlationId: input.correlationId,
    executionTimeline: executionTimeline && executionTimeline.length > 0 ? executionTimeline : undefined
  };
}
