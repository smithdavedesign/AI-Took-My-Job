# Shadow Suite And Distribution

Phase 8 retains replayable reports as reusable shadow-suite entries so staging or preview environments can be checked continuously against known failures or expected non-failures.

## Internal Routes

- `GET /internal/shadow-suites`
- `POST /internal/shadow-suites`
- `GET /internal/shadow-suites/:suiteId`
- `POST /internal/shadow-suites/:suiteId/status`
- `GET /internal/shadow-suites/:suiteId/runs`
- `POST /internal/shadow-suites/:suiteId/run`
- `POST /internal/shadow-suites/run-due`

## Retain A Replay

Create a retained suite from an existing report with replay evidence:

```json
{
  "reportId": "<report-id>",
  "name": "Checkout regression suite",
  "environment": "staging",
  "targetOrigin": "https://staging.example.test",
  "cadenceSeconds": 3600,
  "expectedOutcome": "not-reproduced",
  "retentionReason": "Guard checkout against regressions after the payment fix."
}
```

## Run Due Suites

The scheduler entrypoint is:

```bash
npm run shadow-suite:tick
```

It calls `POST /internal/shadow-suites/run-due` against the running gateway using the configured service token. This is intended to be triggered by cron, a platform scheduler, or a container sidecar in a deployed environment.

Helpful environment variables:

- `SHADOW_SUITE_ENVIRONMENT`
- `SHADOW_SUITE_LIMIT`

## Distribution

`docker-compose.yml` now includes both the gateway and a dedicated worker container so a single Compose stack runs ingestion, replay, MCP support, and retained shadow-suite execution together.

Terraform packaging is available under `infra/terraform` using the Docker provider. It provisions:

- PostgreSQL with pgvector
- Redis
- MinIO plus bucket bootstrap
- Nexus app container
- Nexus worker container

This is a packaging scaffold for self-hosted Docker targets rather than a cloud-provider-specific deployment module.