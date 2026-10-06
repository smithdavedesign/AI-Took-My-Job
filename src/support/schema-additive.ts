/**
 * The API and worker apply sql/init/001_initial.sql at every startup (database-bootstrap.ts).
 * `CREATE TABLE IF NOT EXISTS` skips a table that already exists, so a column added inside an
 * existing CREATE TABLE never reaches a live database: the worker then fails with
 * `column "…" does not exist` (correlation_id, 2026-10-06). Every column added to a table that
 * already existed must also have `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
 */

const CREATE = /^\s*CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(/i
const COLUMN = /^\s*([a-z_][a-z0-9_]*)\s+[A-Z]/
const NOT_COLUMNS = new Set(['primary', 'unique', 'foreign', 'constraint', 'check', 'exclude'])

/** Columns declared inside each CREATE TABLE block. */
export function createTableColumns(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>()
  let current: Set<string> | null = null
  for (const line of sql.split('\n')) {
    const create = CREATE.exec(line)
    if (create) {
      current = new Set()
      tables.set(create[1]!.toLowerCase(), current)
      continue
    }
    if (!current) continue
    if (/^\s*\);/.test(line)) { current = null; continue }
    const col = COLUMN.exec(line)
    const name = col?.[1]?.toLowerCase()
    if (name && !NOT_COLUMNS.has(name)) current.add(name)
  }
  return tables
}

/** `table.column` pairs that have an `ADD COLUMN IF NOT EXISTS`. */
export function addedColumns(sql: string): Set<string> {
  const out = new Set<string>()
  for (const stmt of sql.matchAll(/ALTER TABLE\s+(\w+)([\s\S]*?);/gi)) {
    const table = stmt[1]!.toLowerCase()
    for (const col of (stmt[2] ?? '').matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/gi)) out.add(`${table}.${col[1]!.toLowerCase()}`)
  }
  return out
}

/** Columns added to a table that existed in `before` without an ADD COLUMN IF NOT EXISTS in `after`. */
export function missingColumnMigrations(before: string, after: string): string[] {
  const old = createTableColumns(before)
  const now = createTableColumns(after)
  const migrated = addedColumns(after)
  const missing: string[] = []
  for (const [table, cols] of now) {
    const prev = old.get(table)
    if (!prev) continue
    for (const col of cols) if (!prev.has(col) && !migrated.has(`${table}.${col}`)) missing.push(`${table}.${col}`)
  }
  return missing.sort()
}
