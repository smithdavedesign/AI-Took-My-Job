# AI-DevOps Nexus

AI-DevOps Nexus turns messy internal engineering signal into something a team can actually ship against.

It is a self-hostable incident-intelligence layer for teams that need more than alert spam, screenshots, and hand-written bug tickets. Nexus captures browser and observability evidence, stores a canonical report, replays the failure path, drafts the issue, and prepares an agent-ready execution bundle.

The goal is simple: stop losing context between the moment something breaks and the moment someone is finally ready to fix it.

## Why This Exists

Most teams already have the raw ingredients for fast debugging. They just do not have a reliable handoff.

A report arrives from a browser session. Sentry lights up. A HAR file gets attached somewhere. A draft issue appears later with half the evidence missing. Nexus is designed to keep the report, artifacts, replay evidence, draft output, and agent handoff connected as one system instead of five disconnected tools.

## What Exists Today

The repository now covers the full Phase 0 and Phase 1 baseline, plus meaningful parts of Phases 2 through 6 from [roadmap.md](roadmap.md):

- Fastify gateway with health checks and protected ingestion routes.
- PostgreSQL repositories for feedback reports, artifact metadata, triage jobs, audit events, and GitHub draft metadata.
- BullMQ queue publishing for triage jobs.
- Worker process that converts stored reports into persisted issue drafts and replay records.
- Configurable artifact storage with local-disk mode and S3-compatible object storage mode.
- HAR replay pipeline that normalizes stored HAR artifacts into persisted replay plans.
- Playwright-backed replay execution that verifies whether recorded failing steps still reproduce.
- Internal service-token auth for internal routes and artifact download URL minting.
- Optional GitHub sync using either a PAT-backed service account or a GitHub App.
- Agent-task intake, isolated execution worktrees, persisted execution artifacts, and replay-backed validation routes.
- Human approval and explicit PR promotion for agent executions, so GitHub PR creation is blocked until review is recorded.
- Deterministic report embeddings persisted at ingestion time for later clustering and similarity workflows.
- First-class PR audit records and approval-gated merge attempts for agent executions.
- Ownership candidate inference from explicit report metadata, linked repository context, and nearest-neighbor reports.
- Similar-report linkage that combines nearest-neighbor embeddings with deterministic heuristics and issue references.
- Committed end-to-end smoke automation with safe GitHub test-repository routing.
- Docker Compose topology for PostgreSQL, Redis, and optional MinIO.

Still planned: richer browser automation, clustering and deduplication, agentic PR workflows, and MCP developer context.

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: partial
- Phase 3: partial
- Phase 4: partial
- Phase 5: partial
- Phase 6: partial
- Phases 7 to 8: not started

## How It Works

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
- `POST /internal/agent-tasks`
- `GET /internal/agent-tasks/:taskId`
- `POST /internal/agent-tasks/:taskId/execute`
- `GET /internal/agent-tasks/:taskId/executions`
- `GET /internal/agent-task-executions/:executionId`
- `GET /internal/agent-task-executions/:executionId/artifacts`
- `GET /internal/agent-task-executions/:executionId/replay-validation`
- `GET /internal/agent-task-executions/:executionId/validation-policy`
- `GET /internal/agent-task-executions/:executionId/review`
- `POST /internal/agent-task-executions/:executionId/review`
- `GET /internal/agent-task-executions/:executionId/pull-request`
- `POST /internal/agent-task-executions/:executionId/promote`
- `POST /internal/agent-task-executions/:executionId/merge`
- `GET /internal/reports/:reportId/draft`
- `GET /internal/reports/:reportId/agent-tasks`
- `GET /internal/reports/:reportId/artifacts`
- `GET /internal/reports/:reportId/embedding`
- `GET /internal/reports/:reportId/history`
- `GET /internal/reports/:reportId/impact`
- `GET /internal/reports/:reportId/ownership`
- `GET /internal/reports/:reportId/similar`
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
- `GITHUB_USE_TEST_REPO`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_TEST_OWNER`
- `GITHUB_TEST_REPO`
- `GITHUB_TOKEN`
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `AGENT_EXECUTION_COMMAND`
- `AGENT_EXECUTION_ARGS`
- `AGENT_EXECUTION_TIMEOUT_SECONDS`
- `AGENT_EXECUTION_AUTO_CREATE_PR`
- `EXTENSION_MAX_INLINE_ARTIFACT_BYTES`
- `EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES`

## GitHub Auth Modes

Two GitHub auth models are supported:

- PAT mode for a service account with a fine-grained token.
- GitHub App mode for stronger repository scoping and auditability.

For automated end-to-end runs, GitHub sync can be redirected to a disposable test repository:

- Set `GITHUB_USE_TEST_REPO=true`
- Set `GITHUB_TEST_OWNER` and `GITHUB_TEST_REPO`

When this is enabled, all draft sync during smoke tests goes to the test repository instead of the primary `GITHUB_OWNER` and `GITHUB_REPO` target.

Detailed setup notes are in [docs/github-auth.md](docs/github-auth.md).

Agent-task submission and execution flow is documented in [docs/agent-task-flow.md](docs/agent-task-flow.md).

If `AGENT_EXECUTION_COMMAND` is configured, the worker will invoke it inside each prepared execution worktree and expect the command to read `.nexus/task.md` and `.nexus/context.json`, then write structured output to `.nexus/output.json`. When an execution produces promotable changes, Nexus stops at a reviewed execution state and requires explicit approval plus `POST /internal/agent-task-executions/:executionId/promote` before it will push the branch and open a PR. PR metadata is now persisted as a first-class execution record, and `POST /internal/agent-task-executions/:executionId/merge` refuses to merge unless the latest human review is still approved.

The `.nexus/output.json` contract can also request replay-backed validation by including a `replayValidation` block with a target `baseUrl` and an expected replay outcome such as `not-reproduced`.

Each stored report now also gets a deterministic `deterministic-hash-v1` embedding at ingestion time, exposed through `GET /internal/reports/:reportId/embedding` so clustering and similarity features can build on live data instead of empty schema scaffolding.

Ownership hooks are now exposed through `GET /internal/reports/:reportId/ownership` and are also attached to prepared agent-task context. Current candidates come from explicit owner metadata in the report payload, linked repository owner, and similar stored reports.

Similarity hooks are now exposed through `GET /internal/reports/:reportId/similar` and are also attached to prepared agent-task context. Current ranking blends embedding distance with deterministic heuristics such as title overlap, source match, severity match, and matching external identifiers.

Historical linkage is now exposed through `GET /internal/reports/:reportId/history` and is also attached to prepared agent-task context. It aggregates prior GitHub issue drafts/issues and agent-execution PR records from the current report plus semantically related reports so operators and agents can see recent related remediation history.

Refined impact is now exposed through `GET /internal/reports/:reportId/impact` and is also attached to prepared agent-task context. The score blends the original ingestion-time score with recurrence from similar reports, breadth across sources and reporters, ownership spread, and related issue or PR history.

For execution-route verification, start the worker with the built-in fixture command and then run `npm run e2e:agent-routes`:

```bash
AGENT_EXECUTION_COMMAND=tsx \
AGENT_EXECUTION_ARGS="[\"$PWD/src/scripts/e2e/agent-execution-fixture.ts\"]" \
E2E_AGENT_FIXTURE_BASE_URL=http://127.0.0.1:4000 \
npm run worker
```

For a reusable README-focused downstream agent command, point the worker at the built-in script:

```bash
AGENT_EXECUTION_COMMAND=tsx \
AGENT_EXECUTION_ARGS="[\"$PWD/src/scripts/agents/creative-readme-agent.ts\"]" \
npm run worker
```

For promotion and ownership verification against the GitHub test repository, run the worker with the promotable fixture and then execute `npm run e2e:promotion-ownership`:

```bash
AGENT_EXECUTION_COMMAND=tsx \
AGENT_EXECUTION_ARGS="[\"$PWD/src/scripts/e2e/agent-execution-promotable-fixture.ts\"]" \
npm run worker
```

GitHub merge attempts require a token or app installation with pull-request merge permission. Nexus persists both successful merges and merge failures in the PR audit record so operators can distinguish policy or credential problems from a completed closeout.

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

### 6. Run the committed E2E smoke test

```bash
npm run e2e:smoke
```

The committed smoke runner validates:

- gateway health
- browser-extension ingestion
- replay completion and exact execution assertions
- artifact persistence and signed download
- internal bearer-auth routes
- direct GitHub draft creation
- Sentry, Datadog, and New Relic ingestion through persisted drafts

If GitHub sync is enabled, the smoke runner refuses to hit the primary repository unless one of these is true:

- `GITHUB_USE_TEST_REPO=true` with `GITHUB_TEST_OWNER` and `GITHUB_TEST_REPO` configured
- `E2E_ALLOW_PRIMARY_GITHUB_REPO=true` is set intentionally

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

### Submit an Agent Task For A Report

```bash
curl -X POST http://127.0.0.1:4000/internal/agent-tasks \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer nexus-local-dev-token' \
  --data '{
    "reportId": "<report-id>",
    "objective": "Investigate the replay evidence and prepare a fix task.",
    "executionMode": "fix",
    "acceptanceCriteria": [
      "Use the replay evidence as the starting context.",
      "Link the likely failure path.",
      "Prepare the task for a future code agent runtime."
    ]
  }'
```

This currently prepares a persisted context bundle for a future coding agent. It does not yet execute code changes or open a PR.

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
- A committed `npm run e2e:smoke` runner now validates the full local stack end to end.
- GitHub sync for smoke testing can now be redirected to a disposable test repository instead of the primary target.
- Internal operators can now submit report-linked agent tasks that prepare a structured execution bundle for future coding agents.

## Current Limitations

- Slack signature verification currently uses parsed request bodies and should be upgraded to raw-body verification before production use.
- Replay execution currently uses Playwright request contexts, not full browser-context restoration with cookies, storage hydration, and pass-after fix validation.
- Artifact downloads are signed and time-limited, but there is not yet a durable user or service identity model beyond env-defined service tokens.
- Full runtime validation requires Docker because PostgreSQL and Redis are expected to run through Compose.
- GitHub sync is optional and disabled by default.
- Intent classification, deduplication, ownership mapping, and semantic clustering are not implemented yet.
- Agent tasks currently stop at prepared context; there is no live code-agent execution, branch orchestration, or PR generation yet.

## Next Recommended Work

1. Restore replay into a full browser context with cookie and storage hydration, then validate fail-before and pass-after behavior.
2. Replace env-defined service tokens with a durable service identity and audit model.
3. Add semantic clustering, deterministic deduplication, and ownership mapping.
4. Start the agentic PR pipeline only after reproduction is stable enough to trust.