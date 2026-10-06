import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAutonomousPromotionBranchPolicy,
  AUTONOMOUS_BRANCH_PREFIX,
  buildAutonomousBranchName,
  isAutonomousTaskContext,
  parseTaskContextNotes,
  resolveAutonomousBaseBranch
} from '../../src/support/agent-branch-policy.js';

test('parseTaskContextNotes returns defaults on invalid JSON', () => {
  const parsed = parseTaskContextNotes('{invalid-json');
  assert.deepEqual(parsed, { autoExecute: false });
});

test('isAutonomousTaskContext detects autonomous source', () => {
  const parsed = parseTaskContextNotes(JSON.stringify({ source: 'repohq-auto-dispatch' }));
  assert.equal(isAutonomousTaskContext(parsed), true);
});

test('isAutonomousTaskContext detects autoExecute=true', () => {
  const parsed = parseTaskContextNotes(JSON.stringify({ autoExecute: true }));
  assert.equal(isAutonomousTaskContext(parsed), true);
});

test('buildAutonomousBranchName uses feature/bot prefix', () => {
  const branchName = buildAutonomousBranchName('12345678-aaaa-bbbb-cccc-123456789012', '87654321-dddd-eeee-ffff-210987654321');
  assert.equal(branchName.startsWith(`${AUTONOMOUS_BRANCH_PREFIX}/`), true);
  assert.equal(branchName.includes(' '), false);
});

test('resolveAutonomousBaseBranch returns default when blank', () => {
  assert.equal(resolveAutonomousBaseBranch(''), 'integration/agent');
});

test('assertAutonomousPromotionBranchPolicy rejects autonomous promotion to main', () => {
  assert.throws(() => {
    assertAutonomousPromotionBranchPolicy({
      isAutonomous: true,
      baseBranch: 'main',
      integrationBaseBranch: 'integration/agent'
    });
  }, /autonomous promotion policy violation/i);
});

test('assertAutonomousPromotionBranchPolicy allows non-main autonomous promotions', () => {
  assert.doesNotThrow(() => {
    assertAutonomousPromotionBranchPolicy({
      isAutonomous: true,
      baseBranch: 'integration/agent',
      integrationBaseBranch: 'integration/agent'
    });
  });
});
