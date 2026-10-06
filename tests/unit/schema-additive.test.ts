import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { addedColumns, createTableColumns, missingColumnMigrations } from '../../src/support/schema-additive.js';

const v1 = `CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  PRIMARY KEY (id)
);`;

test('reads columns per CREATE TABLE block, ignoring constraints', () => {
  assert.deepEqual([...createTableColumns(v1).get('runs')!], ['id', 'status']);
});

test('a column added inside an existing CREATE TABLE without ALTER is reported', () => {
  const v2 = v1.replace('status TEXT NOT NULL,', 'status TEXT NOT NULL,\n  correlation_id TEXT,');
  assert.deepEqual(missingColumnMigrations(v1, v2), ['runs.correlation_id']);
});

test('an ADD COLUMN IF NOT EXISTS (single or multi-column ALTER) satisfies it', () => {
  const v2 = `${v1.replace('status TEXT NOT NULL,', 'status TEXT NOT NULL,\n  correlation_id TEXT,\n  telemetry JSONB,')}
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS telemetry JSONB;`;
  assert.deepEqual(missingColumnMigrations(v1, v2), []);
  assert.ok(addedColumns(v2).has('runs.telemetry'));
});

test('brand-new tables need no ALTER', () => {
  assert.deepEqual(missingColumnMigrations(v1, `${v1}\nCREATE TABLE IF NOT EXISTS jobs (\n  id UUID,\n  name TEXT\n);`), []);
});

test('the shipped schema migrates the agent_task_executions columns added in fca7f20', () => {
  const sql = readFileSync('sql/init/001_initial.sql', 'utf8');
  for (const col of ['correlation_id', 'telemetry', 'execution_timeline']) {
    assert.ok(addedColumns(sql).has(`agent_task_executions.${col}`), col);
  }
});
