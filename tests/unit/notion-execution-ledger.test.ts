import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNotionExecutionProperties } from '../../src/services/notion/execution-ledger.js';

test('buildNotionExecutionProperties maps core execution fields', () => {
  const properties = buildNotionExecutionProperties({
    executionId: 'exec-123',
    taskId: 'task-123',
    repository: 'octo/repo',
    branchName: 'feature/bot/task-123-exec-123',
    baseBranch: 'integration/agent',
    source: 'repohq-auto-dispatch',
    skillName: 'ship',
    objective: 'Ship fix',
    status: 'pr-opened',
    summary: 'PR created',
    pullRequestUrl: 'https://github.com/octo/repo/pull/1',
    retries: 1,
    terminalState: 'in-review'
  });

  const executionIdProp = properties['Execution ID'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const taskIdProp = properties['Task ID'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const prUrlProp = properties['PR URL'] as { url?: string | null };
  const retriesProp = properties['Retries'] as { number?: number };

  assert.equal(executionIdProp.rich_text?.[0]?.text?.content, 'exec-123');
  assert.equal(taskIdProp.rich_text?.[0]?.text?.content, 'task-123');
  assert.equal(prUrlProp.url, 'https://github.com/octo/repo/pull/1');
  assert.equal(retriesProp.number, 1);
});

test('buildNotionExecutionProperties handles optional fields', () => {
  const properties = buildNotionExecutionProperties({
    executionId: 'exec-456',
    taskId: 'task-456',
    repository: 'octo/repo',
    status: 'failed'
  });

  const branchProp = properties['Branch'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const baseProp = properties['Base Branch'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const prUrlProp = properties['PR URL'] as { url?: string | null };

  assert.equal(branchProp.rich_text?.[0]?.text?.content, '');
  assert.equal(baseProp.rich_text?.[0]?.text?.content, '');
  assert.equal(prUrlProp.url, null);
});

test('buildNotionExecutionProperties includes richer run metadata when supplied', () => {
  const properties = buildNotionExecutionProperties({
    executionId: 'exec-789',
    taskId: 'task-789',
    repository: 'octo/repo',
    trigger: 'repohq-auto-dispatch',
    outcome: 'merged',
    outcomeDelta: 18,
    status: 'completed',
    correlationId: 'corr-789',
    modelTier: 'local-claude',
    promptTokens: 1300,
    completionTokens: 600,
    totalTokens: 1900,
    costUsd: 0.024,
    durationMs: 8421,
    chainDepth: 2,
    executionTimeline: [
      { stage: 'queued', at: '2026-01-02T00:00:00.000Z' },
      { stage: 'running', at: '2026-01-02T00:00:09.000Z' },
      { stage: 'pr-opened', at: '2026-01-02T00:00:22.000Z' }
    ],
    escalationReason: 'manual-intervention-needed'
  });

  const triggerProp = properties['Trigger'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const outcomeProp = properties['Outcome'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const outcomeDeltaProp = properties['Outcome Delta'] as { number?: number };
  const correlationIdProp = properties['Correlation ID'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const modelTierProp = properties['Model Tier'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const timelineProp = properties['Execution Timeline'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const escalationProp = properties['Escalation Reason'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const tokensProp = properties['Token Usage'] as { rich_text?: Array<{ text?: { content?: string } }> };
  const durationProp = properties['Duration (ms)'] as { number?: number };

  assert.equal(triggerProp.rich_text?.[0]?.text?.content, 'repohq-auto-dispatch');
  assert.equal(outcomeProp.rich_text?.[0]?.text?.content, 'merged');
  assert.equal(outcomeDeltaProp.number, 18);
  assert.equal(correlationIdProp.rich_text?.[0]?.text?.content, 'corr-789');
  assert.equal(modelTierProp.rich_text?.[0]?.text?.content, 'local-claude');
  assert.equal(tokensProp.rich_text?.[0]?.text?.content, '1900 total (1300 in / 600 out)');
  assert.equal(durationProp.number, 8421);
  assert.match(timelineProp.rich_text?.[0]?.text?.content ?? '', /queued.*running.*pr-opened/);
  assert.equal(escalationProp.rich_text?.[0]?.text?.content, 'manual-intervention-needed');
});
