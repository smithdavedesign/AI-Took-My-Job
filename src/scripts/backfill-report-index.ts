import 'dotenv/config';

import { buildReportIndex, readPersistedReportIndex } from '../services/reports/report-index.js';
import { createDatabaseClient } from '../support/database.js';

interface FeedbackRow {
  id: string;
  title: string | null;
  reporter_identifier: string | null;
  payload: Record<string, unknown>;
}

interface ScriptOptions {
  batchSize: number;
  limit?: number;
  dryRun: boolean;
  force: boolean;
}

function parseOptions(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: 100,
    dryRun: false,
    force: false
  };

  for (const argument of argv) {
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--force') {
      options.force = true;
      continue;
    }

    if (argument.startsWith('--batch-size=')) {
      options.batchSize = Number(argument.slice('--batch-size='.length));
      continue;
    }

    if (argument.startsWith('--limit=')) {
      options.limit = Number(argument.slice('--limit='.length));
    }
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error('batch size must be a positive integer');
  }

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error('limit must be a positive integer');
  }

  return options;
}

function indexesEqual(left: ReturnType<typeof buildReportIndex>, right: ReturnType<typeof buildReportIndex>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const database = createDatabaseClient(databaseUrl);

  let offset = 0;
  let scanned = 0;
  let updated = 0;

  try {
    while (true) {
      const remainingLimit = options.limit === undefined ? options.batchSize : Math.min(options.batchSize, Math.max(options.limit - scanned, 0));
      if (remainingLimit <= 0) {
        break;
      }

      const result = await database.query<FeedbackRow>(
        `SELECT id, title, reporter_identifier, payload
         FROM feedback_reports
         ORDER BY updated_at ASC, created_at ASC, id ASC
         LIMIT $1 OFFSET $2`,
        [remainingLimit, offset]
      );

      if (result.rows.length === 0) {
        break;
      }

      for (const row of result.rows) {
        scanned += 1;

        const computedIndex = buildReportIndex({
          ...(row.title ? { title: row.title } : {}),
          ...(row.reporter_identifier ? { reporterIdentifier: row.reporter_identifier } : {}),
          payload: row.payload
        });
        const persistedIndex = readPersistedReportIndex(row.payload);

        if (!options.force && persistedIndex && indexesEqual(computedIndex, persistedIndex)) {
          continue;
        }

        if (!options.dryRun) {
          await database.query(
            `UPDATE feedback_reports
             SET payload = jsonb_set(payload, '{reportIndex}', $2::jsonb, true),
                 updated_at = NOW()
             WHERE id = $1`,
            [row.id, JSON.stringify(computedIndex)]
          );
        }

        updated += 1;
      }

      offset += result.rows.length;
    }
  } finally {
    await database.close();
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    force: options.force,
    batchSize: options.batchSize,
    limit: options.limit ?? null,
    scanned,
    updated
  }, null, 2));
}

void main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});