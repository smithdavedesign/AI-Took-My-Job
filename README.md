# AI-DevOps Nexus

AI-DevOps Nexus is a self-hostable internal engineering intelligence layer. It ingests high-signal internal reports from Slack, observability tooling, and a browser extension, stores them as canonical feedback records, and turns them into triaged issue drafts that can optionally sync to GitHub.

## Current Scope

The repository currently implements the Phase 0 and early Phase 1 foundation from [roadmap.md](roadmap.md):

- Fastify gateway with health checks and protected ingestion routes.
- PostgreSQL repositories for feedback reports, artifact metadata, triage jobs, audit events, and GitHub draft metadata.
- BullMQ queue publishing for triage jobs.
- Worker process that converts stored reports into persisted issue drafts.
- Configurable artifact storage with local-disk mode and S3-compatible object storage mode.
- HAR replay pipeline that normalizes stored HAR artifacts into persisted replay plans.
- Playwright-backed replay execution that verifies whether recorded failing steps still reproduce.
- Internal service-token auth for internal routes and artifact download URL minting.
- Optional GitHub sync using either a PAT-backed service account or a GitHub App.
- Docker Compose topology for PostgreSQL and Redis.

The verified reproduction loop, browser extension artifact uploads, and MCP server are still planned work.

## Architecture

### Processes

- Gateway: receives webhooks and internal API requests.
- Worker: consumes queued triage jobs and generates issue drafts.
- PostgreSQL: stores reports, drafts, jobs, and audit logs.
- Redis: backs the BullMQ queue.

### System Architecture

```mermaid
flowchart LR
  subgraph Inputs[Signal Sources]
    Slack[Slack]
    Sentry[Sentry]
    Datadog[Datadog]
    NewRelic[New Relic]
    Extension[Browser Extension]
  end

  Gateway[Nexus Gateway\nFastify]
  Redis[(Redis / BullMQ)]
  Worker[Nexus Worker\nTriage + Drafting]
  Postgres[(PostgreSQL)]
  Artifacts[(Artifact Storage\nLocal or S3)]
  GitHub[GitHub Issues]

  Slack --> Gateway
  Sentry --> Gateway
  Datadog --> Gateway
  NewRelic --> Gateway
  Extension --> Gateway

  Gateway --> Postgres
  Gateway --> Redis
  Gateway --> Artifacts
  Redis --> Worker
  Worker --> Postgres
  Worker --> GitHub
  Worker --> Artifacts
```

### Processing Flow

```mermaid
sequenceDiagram
  participant Source as Source System
  participant Gateway as Nexus Gateway
  participant Redactor as Redaction Layer
  participant Store as Postgres + Artifact Store
  participant Queue as BullMQ
  participant Worker as Nexus Worker
  participant Replay as HAR Replay Pipeline
  participant GitHub as GitHub

  Source->>Gateway: Send webhook or extension report
  Gateway->>Redactor: Normalize and redact payload
  Redactor-->>Gateway: Sanitized payload + redaction count
  Gateway->>Store: Persist feedback report
  alt Inline artifacts included
    Gateway->>Store: Persist artifact files + metadata
  else Artifact flags only
    Gateway->>Store: Persist pending artifact metadata
  end
  Gateway->>Queue: Enqueue triage job
  Gateway->>Queue: Enqueue replay job when HAR exists
  Queue->>Worker: Deliver triage job
  Worker->>Store: Read report + artifacts
  Worker->>Worker: Build deterministic issue draft
  Queue->>Replay: Deliver replay job
  Replay->>Store: Read HAR artifact
  Replay->>Replay: Normalize requests into replay plan
  Replay->>Store: Persist replay summary and steps
  opt GitHub sync enabled
    Worker->>GitHub: Create or update issue draft
    GitHub-->>Worker: Issue number + URL
  end
  Worker->>Store: Persist draft linkage and status
```

### Main Entry Points

- [src/index.ts](src/index.ts)
- [src/server.ts](src/server.ts)
- [src/worker.ts](src/worker.ts)

## Supported Ingestion Routes

- `POST /webhooks/slack/events`
- `POST /webhooks/observability`
- `POST /webhooks/sentry`
- `POST /webhooks/datadog`
- `POST /webhooks/newrelic`
- `POST /webhooks/extension/report`

## Internal Routes

- `POST /internal/github/issues/draft`
- `GET /internal/reports/:reportId/draft`
- `GET /internal/reports/:reportId/artifacts`
- `GET /internal/reports/:reportId/replay`
- `GET /internal/artifacts/:artifactId/download-url`
- `GET /artifacts/download/:artifactId`
- `GET /health`

## Environment

Copy [.env.example](.env.example) to `.env` and adjust the values.

Important variables:

- `DATABASE_URL`
- `REDIS_URL`
- `ARTIFACT_STORAGE_PROVIDER`
- `ARTIFACT_STORAGE_PATH`
- `ARTIFACT_DOWNLOAD_URL_TTL_SECONDS`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`
- `MINIO_BUCKET`
- `INTERNAL_SERVICE_TOKENS`
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

## Internal Route Auth

Internal routes now use bearer service tokens instead of the webhook shared secret.

Example header:

```bash
Authorization: Bearer nexus-local-dev-token
```

`INTERNAL_SERVICE_TOKENS` is a JSON array of service principals. Each principal has:

- `id`: audit/log identity
- `token`: bearer token value
- `scopes`: allowed capabilities such as `internal:read`, `artifacts:download-url`, and `github:draft`

## Artifact Storage Modes

- `local`: stores artifacts under `ARTIFACT_STORAGE_PATH` on the gateway host.
- `s3`: stores artifacts in an S3-compatible bucket using the `S3_*` variables.

Example S3-compatible configuration:

```bash
ARTIFACT_STORAGE_PROVIDER=s3
S3_REGION=us-east-1
S3_BUCKET=ai-devops-nexus-artifacts
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=false
```

For MinIO or other self-hosted S3-compatible services, keep `S3_FORCE_PATH_STYLE=true` and set `S3_ENDPOINT` to the service URL.

### MinIO For Free Local S3-Compatible Storage

The Docker Compose stack now includes an optional MinIO service and a bucket bootstrap job. To use it locally without AWS costs:

```bash
docker compose up -d minio minio-create-bucket
```

Then set your environment like this:

```bash
ARTIFACT_STORAGE_PROVIDER=s3
S3_REGION=us-east-1
S3_BUCKET=nexus-artifacts
S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

MinIO console:

```bash
http://127.0.0.1:9001
```

Default credentials come from `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.

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
      "artifacts": {
        "hasScreenRecording": true,
        "hasHar": true,
        "hasLocalStorageSnapshot": true,
        "hasSessionStorageSnapshot": false,
        "uploads": {
          "har": {
            "fileName": "checkout.har",
            "mimeType": "application/json",
            "contentBase64": "eyJsb2ciOnsicGFnZXMiOltdLCJlbnRyaWVzIjpbXX19"
          },
          "localStorage": {
            "fileName": "local-storage.json",
            "mimeType": "application/json",
            "contentBase64": "eyJjYXJ0SWQiOiJhYmMtMTIzIn0="
          }
        }
      }
  }'
```

### Sentry Webhook

```bash
curl -X POST http://127.0.0.1:4000/webhooks/sentry \
  -H 'content-type: application/json' \
  -H 'x-nexus-shared-secret: replace-me' \
  --data '{
    "action": "resolved",
    "data": {
      "issue": {
        "id": "123456",
        "shortId": "OPEN-12",
        "title": "Checkout request failed",
        "culprit": "checkout-service",
        "level": "error",
        "count": "27",
        "permalink": "https://sentry.example/issues/123456"
      }
    }
  }'
```

### Datadog Webhook

```bash
curl -X POST http://127.0.0.1:4000/webhooks/datadog \
  -H 'content-type: application/json' \
  -H 'x-nexus-shared-secret: replace-me' \
  --data '{
    "id": 987654,
    "title": "Checkout latency regression",
    "text": "p95 latency crossed threshold",
    "alert_type": "error",
    "event_type": "monitor_alert",
    "date_happened": 1731000000,
    "tags": ["service:web", "env:staging"],
    "url": "https://app.datadoghq.com/event/event?id=987654"
  }'
```

### New Relic Webhook

```bash
curl -X POST http://127.0.0.1:4000/webhooks/newrelic \
  -H 'content-type: application/json' \
  -H 'x-nexus-shared-secret: replace-me' \
  --data '{
    "incident_id": 4321,
    "event": "INCIDENT_OPEN",
    "severity": "critical",
    "condition_name": "Checkout error rate",
    "policy_name": "Staging API",
    "incident_url": "https://one.newrelic.com/redirect/entity/example",
    "timestamp": 1731000000000
  }'
```

### Create a GitHub Draft Issue Directly

```bash
curl -X POST http://127.0.0.1:4000/internal/github/issues/draft \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer nexus-local-dev-token' \
  --data '{
    "title": "Checkout stalls in staging",
    "body": "Observed by QA after discount application.",
    "labels": ["bug", "staging"]
  }'
```

### Create an Authenticated Artifact Download URL

```bash
curl "http://127.0.0.1:4000/internal/artifacts/<artifact-id>/download-url" \
  -H 'Authorization: Bearer nexus-local-dev-token'
```

The response returns a short-lived signed path that can be used to download the artifact without sending the shared secret again.

### Inspect the Latest Replay Plan

```bash
curl http://127.0.0.1:4000/internal/reports/<report-id>/replay \
  -H 'Authorization: Bearer nexus-local-dev-token'
```

The replay payload includes normalized steps, detected cookie names, auth-refresh candidates, storage-state keys, third-party host isolation, and a Playwright execution verdict.

## Latest Achievements

- Browser-extension artifacts now persist to MinIO-backed S3-compatible storage locally with signed download URLs.
- Internal routes are protected by scoped bearer service tokens instead of the webhook shared secret.
- HAR uploads now produce replay plans with auth, cookie, storage-state, and third-party metadata.
- Replay jobs now execute through Playwright request contexts and record whether the failing steps were reproduced.

## Current Limitations

- Slack signature verification currently uses parsed request bodies and should be upgraded to raw-body verification before production use.
- The worker now drafts from redacted payloads, and the replay pipeline normalizes HARs, but it does not yet execute browser automation or deterministic pass/fail verification.
- Artifact downloads are now signed and time-limited, but there is not yet a user/session identity model beyond shared-secret internal access.
- Full runtime validation requires Docker because PostgreSQL and Redis are expected to run through Compose.
- GitHub sync is optional and disabled by default.

## Next Recommended Work

1. Add the verified reproduction loop with Playwright and isolated execution.
2. Extend replay normalization to cookies, storage state, auth refresh, and third-party request isolation.
3. Replace shared-secret internal auth with a real user or service identity model.
4. Layer in LLM-backed clustering, duplicate detection, and draft refinement.