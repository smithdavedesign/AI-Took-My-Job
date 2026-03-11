import { readFile } from 'node:fs/promises';

import type { DatabaseClient } from './database.js';

const INITIAL_SCHEMA_URL = new URL('../../sql/init/001_initial.sql', import.meta.url);

let bootstrapSqlPromise: Promise<string> | null = null;

async function loadBootstrapSql(): Promise<string> {
  bootstrapSqlPromise ??= readFile(INITIAL_SCHEMA_URL, 'utf8');
  return await bootstrapSqlPromise;
}

export async function ensureInitialDatabaseSchema(database: DatabaseClient): Promise<void> {
  const sql = await loadBootstrapSql();
  await database.query(sql);
}