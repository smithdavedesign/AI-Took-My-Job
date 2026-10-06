import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExecutionTelemetryPayload } from '../../src/services/agent-tasks/execution-telemetry.js';

test('buildExecutionTelemetryPayload persists runtime metrics to the execution summary payload', () => {
  const payload = buildExecutionTelemetryPayload({
    modelTier: 'local-agent',
    promptTokens: 1200,
    completionTokens: 800,
    totalTokens: 2000,
    costUsd: 0.014,
    durationMs: 8421,
    chainDepth: 2,
    correlationId: 'corr-900',
    executionTimeline: [
      { stage: 'queued', at: '2026-01-02T00:00:00.000Z' },
      { stage: 'running', at: '2026-01-02T00:00:08.000Z' },
      { stage: 'completed', at: '2026-01-02T00:00:22.000Z' }
    ],
    escalationReason: 'manual-review'
  });

  assert.equal(payload.telemetry?.modelTier, 'local-agent');
  assert.equal(payload.telemetry?.totalTokens, 2000);
  assert.equal(payload.telemetry?.costUsd, 0.014);
  assert.equal(payload.telemetry?.durationMs, 8421);
  assert.equal(payload.correlationId, 'corr-900');
  assert.equal(payload.executionTimeline?.length, 3);
  assert.equal(payload.executionTimeline?.[0]?.stage, 'queued');
  assert.equal(payload.telemetry?.escalationReason, 'manual-review');
});
