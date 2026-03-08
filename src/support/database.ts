import { Pool, type QueryResultRow } from 'pg';

export interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>;
  close(): Promise<void>;
}

export function createDatabaseClient(connectionString: string): DatabaseClient {
  const pool = new Pool({
    connectionString
  });

  return {
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
      const result = await pool.query<Row>(text, values);
      return {
        rows: result.rows
      };
    },
    async close() {
      await pool.end();
    }
  };
}