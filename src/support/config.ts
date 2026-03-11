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

const booleanFromEnv = (defaultValue: boolean) => z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().default(defaultValue));

const optionalNonEmptyString = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const internalServiceTokenSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(12),
  scopes: z.array(z.string().min(1)).min(1)
});

const internalServiceTokensSchema = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}, z.array(internalServiceTokenSchema).default([]));

const optionalStringArraySchema = z.preprocess((value) => {
  if (value === '' || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}, z.array(z.string().min(1)).optional());

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_BASE_URL: optionalString,
  TRUST_PROXY: booleanFromEnv(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ARTIFACT_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  ARTIFACT_STORAGE_PATH: z.string().default('./var/artifacts'),
  ARTIFACT_DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ENDPOINT: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanFromEnv(true),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('nexus-artifacts'),
  INTERNAL_SERVICE_TOKENS: internalServiceTokensSchema,
  SLACK_SIGNING_SECRET: z.string().min(1, 'SLACK_SIGNING_SECRET is required'),
  WEBHOOK_SHARED_SECRET: z.string().min(1, 'WEBHOOK_SHARED_SECRET is required'),
  DATABASE_URL: z.url({ protocol: /^postgres/ }),
  REDIS_URL: z.url({ protocol: /^redis/ }),
  GITHUB_DRAFT_SYNC_ENABLED: booleanFromEnv(false),
  GITHUB_AUTH_MODE: z.enum(['pat', 'app']).default('pat'),
  GITHUB_USE_TEST_REPO: booleanFromEnv(false),
  GITHUB_OWNER: optionalString,
  GITHUB_REPO: optionalString,
  GITHUB_TEST_OWNER: optionalString,
  GITHUB_TEST_REPO: optionalString,
  GITHUB_TOKEN: optionalString,
  GITHUB_APP_ID: optionalPositiveInt,
  GITHUB_APP_INSTALLATION_ID: optionalPositiveInt,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_APP_SLUG: optionalString,
  GITHUB_APP_STATE_SECRET: z.string().min(16).default('local-github-app-state-secret'),
  PUBLIC_WIDGET_SIGNING_SECRET: z.string().min(16).default('local-public-widget-signing-secret'),
  PUBLIC_WIDGET_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  OPERATOR_UI_USERNAME: optionalNonEmptyString,
  OPERATOR_UI_PASSWORD: optionalNonEmptyString,
  OPERATOR_SESSION_SECRET: z.string().min(16).default('local-operator-session-secret'),
  OPERATOR_SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(7 * 24 * 60 * 60).default(12 * 60 * 60),
  PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  PUBLIC_ROUTE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(5000).default(120),
  PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  PUBLIC_FEEDBACK_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1000).default(20),
  AGENT_EXECUTION_COMMAND: optionalString,
  AGENT_EXECUTION_ARGS: optionalStringArraySchema,
  AGENT_EXECUTION_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(3600).default(600),
  AGENT_EXECUTION_AUTO_CREATE_PR: booleanFromEnv(false),
  OPENAI_API_KEY: optionalString,
  OPENAI_BASE_URL: optionalString,
  OPENAI_MODEL: optionalString,
  EXTENSION_MAX_INLINE_ARTIFACT_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(1024 * 1024),
  EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(5 * 1024 * 1024)
}).superRefine((config, context) => {
  if (config.ARTIFACT_STORAGE_PROVIDER === 's3') {
    const requiredS3Fields: Array<keyof Pick<typeof config, 'S3_REGION' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY'>> = [
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY'
    ];

    for (const field of requiredS3Fields) {
      if (!config[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when ARTIFACT_STORAGE_PROVIDER=s3`
        });
      }
    }
  }

  if (config.GITHUB_USE_TEST_REPO) {
    if (!config.GITHUB_TEST_OWNER) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GITHUB_TEST_OWNER'],
        message: 'GITHUB_TEST_OWNER is required when GITHUB_USE_TEST_REPO=true'
      });
    }

    if (!config.GITHUB_TEST_REPO) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GITHUB_TEST_REPO'],
        message: 'GITHUB_TEST_REPO is required when GITHUB_USE_TEST_REPO=true'
      });
    }
  }

  if (config.NODE_ENV === 'production' && config.PUBLIC_WIDGET_SIGNING_SECRET === 'local-public-widget-signing-secret') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['PUBLIC_WIDGET_SIGNING_SECRET'],
      message: 'PUBLIC_WIDGET_SIGNING_SECRET must be set explicitly in production'
    });
  }

  if (config.NODE_ENV === 'production' && config.GITHUB_APP_STATE_SECRET === 'local-github-app-state-secret') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GITHUB_APP_STATE_SECRET'],
      message: 'GITHUB_APP_STATE_SECRET must be set explicitly in production'
    });
  }

  if (Boolean(config.OPERATOR_UI_USERNAME) !== Boolean(config.OPERATOR_UI_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPERATOR_UI_USERNAME'],
      message: 'OPERATOR_UI_USERNAME and OPERATOR_UI_PASSWORD must either both be set or both be empty'
    });
  }

  if (config.NODE_ENV === 'production' && config.OPERATOR_UI_USERNAME && config.OPERATOR_SESSION_SECRET === 'local-operator-session-secret') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OPERATOR_SESSION_SECRET'],
      message: 'OPERATOR_SESSION_SECRET must be set explicitly in production when operator auth is enabled'
    });
  }
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  return configSchema.parse(process.env);
}