import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBranchCleanupPlan } from '../../src/services/agent-tasks/branch-cleanup.js';

const now = new Date('2026-10-05T12:00:00.000Z');

test('computeBranchCleanupPlan builds scaffold candidates with bounded count', () => {
  const plan = computeBranchCleanupPlan({
    now,
    ttlHours: 72,
    maxItems: 1,
    candidates: [
      {
        executionId: 'exec-1',
        agentTaskId: 'task-1',
        targetRepository: 'octo/test',
        branchName: 'feature/bot/task-1-exec-1',
        baseBranch: 'integration/agent',
        status: 'completed',
        completedAt: '2026-10-01T12:00:00.000Z'
      },
      {
        executionId: 'exec-2',
        agentTaskId: 'task-2',
        targetRepository: 'octo/test',
        branchName: 'feature/bot/task-2-exec-2',
        baseBranch: 'integration/agent',
        status: 'failed',
        completedAt: '2026-10-02T12:00:00.000Z'
      }
    ]
  });

  assert.equal(plan.scaffoldOnly, true);
  assert.equal(plan.ttlHours, 72);
  assert.equal(plan.maxItems, 1);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]?.executionId, 'exec-1');
  assert.match(plan.candidates[0]?.reason ?? '', /older than 72h TTL/);
});

test('computeBranchCleanupPlan computes ageHours from completion time', () => {
  const plan = computeBranchCleanupPlan({
    now,
    ttlHours: 24,
    maxItems: 10,
    candidates: [
      {
        executionId: 'exec-3',
        agentTaskId: 'task-3',
        targetRepository: 'octo/test',
        branchName: 'feature/bot/task-3-exec-3',
        baseBranch: 'integration/agent',
        status: 'cancelled',
        completedAt: '2026-10-05T00:00:00.000Z'
      }
    ]
  });

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]?.ageHours, 12);
});
