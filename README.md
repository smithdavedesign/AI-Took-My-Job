# AI-DevOps Nexus

AI-DevOps Nexus is a self-hostable internal engineering intelligence layer. It ingests high-signal internal reports from Slack, observability tooling, and a browser extension, stores them as canonical feedback records, and turns them into triaged issue drafts that can optionally sync to GitHub.

## Current Scope

The repository currently implements the Phase 0 and early Phase 1 foundation from [roadmap.md](roadmap.md):

- Fastify gateway with health checks and protected ingestion routes.
- PostgreSQL repositories for feedback reports, triage jobs, audit events, and GitHub draft metadata.
- BullMQ queue publishing for triage jobs.
- Worker process that converts stored reports into persisted issue drafts.
- Optional GitHub sync using either a PAT-backed service account or a GitHub App.
- Docker Compose topology for PostgreSQL and Redis.

The verified reproduction loop, browser extension artifact uploads, and MCP server are still planned work.

## Architecture

### Processes

- Gateway: receives webhooks and internal API requests.
- Worker: consumes queued triage jobs and generates issue drafts.
- PostgreSQL: stores reports, drafts, jobs, and audit logs.
- Redis: backs the BullMQ queue.

### Main Entry Points

- [src/index.ts](src/index.ts)
- [src/server.ts](src/server.ts)
- [src/worker.ts](src/worker.ts)

## Supported Ingestion Routes

- `POST /webhooks/slack/events`
- `POST /webhooks/observability`
- `POST /webhooks/extension/report`

## Internal Routes

- `POST /internal/github/issues/draft`
- `GET /internal/reports/:reportId/draft`
- `GET /health`

## Environment

Copy [.env.example](.env.example) to `.env` and adjust the values.

Important variables:

- `DATABASE_URL`
- `REDIS_URL`
- `WEBHOOK_SHARED_SECRET`
- `SLACK_SIGNING_SECRET`
- `GITHUB_DRAFT_SYNC_ENABLED`
- `GITHUB_AUTH_MODE`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TOKEN`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`

## GitHub Auth Modes

Two GitHub auth models are supported:

- PAT mode for a service account with a fine-grained token.
- GitHub App mode for stronger repository scoping and auditability.

Detailed setup notes are in [docs/github-auth.md](docs/github-auth.md).

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start backing services

```bash
docker compose up -d postgres redis
```

Docker must be running locally for this step to work.

### 3. Start the gateway

```bash
npm run dev
```

### 4. Start the worker

```bash
npm run worker
```

### 5. Typecheck

```bash
npm run check
```

## Example Requests

### Health

```bash
curl http://127.0.0.1:4000/health
```

### Browser Extension Report

```bash
curl -X POST http://127.0.0.1:4000/webhooks/extension/report \
  -H 'content-type: application/json' \
  -H 'x-nexus-shared-secret: replace-me' \
  --data '{
    "sessionId": "sess_123",
    "title": "Checkout button stalls",
    "pageUrl": "https://staging.example.com/checkout",
    "environment": "staging",
    "reporter": {"id": "qa-42", "role": "qa"},
    "severity": "high",
    "signals": {"consoleErrorCount": 3, "networkErrorCount": 1, "stakeholderCount": 2},
    "artifacts": {"hasScreenRecording": true, "hasHar": true, "hasLocalStorageSnapshot": true, "hasSessionStorageSnapshot": true}
  }'
```

### Create a GitHub Draft Issue Directly

```bash
curl -X POST http://127.0.0.1:4000/internal/github/issues/draft \
  -H 'content-type: application/json' \
  -H 'x-nexus-shared-secret: replace-me' \
  --data '{
    "title": "Checkout stalls in staging",
    "body": "Observed by QA after discount application.",
    "labels": ["bug", "staging"]
  }'
```

## Current Limitations

- Slack signature verification currently uses parsed request bodies and should be upgraded to raw-body verification before production use.
- The worker generates deterministic issue drafts, but it does not yet perform redaction, LLM classification, or reproduction generation.
- Full runtime validation requires Docker because PostgreSQL and Redis are expected to run through Compose.
- GitHub sync is optional and disabled by default.

## Next Recommended Work

1. Add redaction and normalization ahead of draft generation.
2. Add Sentry-specific payload mapping and impact enrichment.
3. Implement artifact persistence for HAR, storage snapshots, and recordings.
4. Add the verified reproduction loop with Playwright and isolated execution.