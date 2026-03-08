import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const optionalPositiveInt = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.number().int().positive().optional());

const optionalString = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().optional());

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SLACK_SIGNING_SECRET: z.string().min(1, 'SLACK_SIGNING_SECRET is required'),
  WEBHOOK_SHARED_SECRET: z.string().min(1, 'WEBHOOK_SHARED_SECRET is required'),
  DATABASE_URL: z.url({ protocol: /^postgres/ }),
  REDIS_URL: z.url({ protocol: /^redis/ }),
  GITHUB_DRAFT_SYNC_ENABLED: z.coerce.boolean().default(false),
  GITHUB_AUTH_MODE: z.enum(['pat', 'app']).default('pat'),
  GITHUB_OWNER: optionalString,
  GITHUB_REPO: optionalString,
  GITHUB_TOKEN: optionalString,
  GITHUB_APP_ID: optionalPositiveInt,
  GITHUB_APP_INSTALLATION_ID: optionalPositiveInt,
  GITHUB_APP_PRIVATE_KEY: optionalString
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  return configSchema.parse(process.env);
}