# Render Deployment And Ops

This repo is ready for a two-process Render deployment:

- one Node web service for the Fastify app
- one Node worker service for BullMQ jobs
- one Render Postgres database
- one Render Key Value Redis instance

The blueprint is in [render.yaml](render.yaml).

## Required Environment

Web and worker:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_BASE_URL`
- `GITHUB_AUTH_MODE=app`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_SLUG`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_STATE_SECRET`
- `PUBLIC_WIDGET_SIGNING_SECRET`
- `INTERNAL_SERVICE_TOKENS`
- `SLACK_SIGNING_SECRET`
- `WEBHOOK_SHARED_SECRET`

Web only:

- `TRUST_PROXY=true`
- `OPERATOR_UI_USERNAME`
- `OPERATOR_UI_PASSWORD`
- `OPERATOR_SESSION_SECRET`

Optional tuning:

- `PUBLIC_ROUTE_RATE_LIMIT_WINDOW_SECONDS`
- `PUBLIC_ROUTE_RATE_LIMIT_MAX`
- `PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_SECONDS`
- `PUBLIC_FEEDBACK_RATE_LIMIT_MAX`
- `OPERATOR_SESSION_TTL_SECONDS`

## Operator Auth Story

Hosted operator pages now use a signed cookie session instead of assuming every human operator will paste a bearer token into the UI.

- `/operator/login` issues the operator session cookie.
- `/learn`, `/learn/onboarding`, `/learn/review-queue`, and `/learn/support-ops` require that session when operator auth is configured.
- Existing bearer tokens still work for scripts and direct API calls against `/internal/*`.
- Internal routes also accept the operator session, so the learn pages can keep using the existing internal API surface without special-case client logic.

The session implementation is in [src/support/operator-session.ts](src/support/operator-session.ts).

## GitHub App Callback

Set the GitHub App callback URL to:

- `${APP_BASE_URL}/github/app/install/callback`

For Render staging, that means using the public Render hostname for the web service. Do not register `localhost` or an internal Render address for hosted installs.

The callback path is handled in [src/routes/internal/onboarding.ts](src/routes/internal/onboarding.ts#L1632).

## Public Route Hardening

Public widget and dashboard routes now have explicit Redis-backed request throttling.

- general public routes default to `120` requests per minute per `IP + projectKey`
- feedback submission defaults to `20` requests per minute per `IP + projectKey`
- responses also return `X-RateLimit-*` headers and `Retry-After` on rejection
- hosted HTML and summary responses now send `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`

The limiter lives in [src/support/request-rate-limit.ts](src/support/request-rate-limit.ts) and is applied from [src/routes/public/projects.ts](src/routes/public/projects.ts).

## Logging And Monitoring

App process:

- Fastify already emits structured logs in production.
- Render log streams can be filtered by request id and severity.
- Keep `LOG_LEVEL=info` in staging and production unless investigating an incident.

Worker process:

- worker lifecycle and job completion/failure paths now emit structured JSON log entries
- this makes Render log search usable for replay, agent, triage, and shadow-suite jobs without mixed plain-text error output

Agent execution runtime:

- `AGENT_EXECUTION_COMMAND` is required on the worker if you want production agent executions to do real code-changing work.
- without `AGENT_EXECUTION_COMMAND`, Nexus only prepares the isolated worktree and handoff bundle, then stops in handoff-only mode
- optional companion settings are `AGENT_EXECUTION_ARGS`, `AGENT_EXECUTION_TIMEOUT_SECONDS`, and `AGENT_EXECUTION_AUTO_CREATE_PR`

Recommended wrapper-script values for Render worker:

- `AGENT_EXECUTION_COMMAND=sh`
- `AGENT_EXECUTION_ARGS=["/opt/render/project/src/scripts/run-agent.sh"]`
- `AGENT_EXECUTION_TIMEOUT_SECONDS=900`
- `AGENT_EXECUTION_AUTO_CREATE_PR=false`

API-backed agent settings:

- `OPENAI_API_KEY` = required worker secret for the API-backed coding adapter
- `OPENAI_MODEL` = optional model name; defaults to `gpt-5.4`
- `OPENAI_BASE_URL` = optional base URL; defaults to `https://api.openai.com/v1`

Example worker configuration using the wrapper:

```text
AGENT_EXECUTION_COMMAND=sh
AGENT_EXECUTION_ARGS=["/opt/render/project/src/scripts/run-agent.sh"]
AGENT_EXECUTION_TIMEOUT_SECONDS=900
AGENT_EXECUTION_AUTO_CREATE_PR=false
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-5.4
OPENAI_BASE_URL=https://api.openai.com/v1
```

The wrapper script lives at [scripts/run-agent.sh](scripts/run-agent.sh) and dispatches to [src/scripts/agents/render-coding-agent.ts](src/scripts/agents/render-coding-agent.ts).

Recommended Render alerts:

- web service restart alert
- worker restart alert
- Postgres storage alert
- Redis memory alert
- response latency or error-rate alert on the web service

## Postgres Backups

Use two layers:

1. Render managed backups and point-in-time recovery on the production database plan.
2. A periodic logical dump using [scripts/postgres-backup.sh](scripts/postgres-backup.sh).

The logical dump script requires `pg_dump` and `DATABASE_URL`:

```sh
npm run ops:postgres-backup
```

Recommended backup policy:

- daily Render snapshot retention
- weekly logical dump stored outside Render
- run a restore test at least once per quarter

## Release Procedure

Use this order for staging and production:

1. Run `npm run ops:release-check` locally or in CI.
2. Merge the release branch.
3. Trigger a manual Render deploy for the web and worker from the same commit.
4. Verify `/health` and one operator login on the hosted site.
5. Run a hosted smoke against the widget or onboarding path.

You can also pass a deployed base URL to the release check script:

```sh
npm run ops:release-check -- https://nexus-staging.onrender.com
```

## First Render Bring-Up

1. Create the Postgres database and Key Value instance from [render.yaml](render.yaml).
2. Create the web and worker services from the same blueprint.
3. Set all non-synced secrets.
4. Set the GitHub App callback URL to `${APP_BASE_URL}/github/app/install/callback`.
5. Log into `/operator/login` and confirm the learn pages load without pasted tokens.
6. Run the existing hosted browser smoke against the Render URL.