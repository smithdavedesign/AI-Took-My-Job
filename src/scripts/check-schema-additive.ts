/**
 * CI guard: compare sql/init/001_initial.sql with its version on SCHEMA_BASE_REF (default
 * origin/main). A column added to an existing table without ADD COLUMN IF NOT EXISTS fails.
 *   npm run check:schema
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { missingColumnMigrations } from '../support/schema-additive.js';

const FILE = 'sql/init/001_initial.sql';
const base = process.env.SCHEMA_BASE_REF ?? 'origin/main';

let before: string;
try {
  before = execFileSync('git', ['show', `${base}:${FILE}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  console.warn(`check:schema: ${base} not available (fetch it first); skipped`);
  process.exit(0);
}

const missing = missingColumnMigrations(before, readFileSync(FILE, 'utf8'));
if (missing.length > 0) {
  console.error(`Columns added to existing tables without ALTER TABLE … ADD COLUMN IF NOT EXISTS (live databases would never get them):\n${missing.map((m) => `  - ${m}`).join('\n')}`);
  process.exit(1);
}
console.log(`check:schema: OK against ${base}`);
