# Phase 9 First Slice Plan

## Purpose

This document turns the new customer-onboarding roadmap phase into an execution-ready first slice.

The goal of the first slice is not to ship the entire customer-facing product. The goal is to establish the minimum durable architecture required for:

1. project-scoped report intake
2. GitHub App-based repository connection
3. runtime repository auth resolution
4. a hosted feedback surface that feeds the existing Nexus pipeline

The existing internal workflows remain the system of record. This slice extends them rather than replacing them.

## First-Slice Goals

- Add project-scoped tenancy without hard multi-tenant infrastructure.
- Decouple GitHub auth from a single global repository configuration.
- Introduce a hosted feedback intake path that reuses current ingestion logic.
- Keep GitHub writes and agent workflows review-gated.
- Preserve current local and CI validation paths.

## Explicit Non-Goals

- No autonomous merges.
- No full customer dashboard.
- No browser extension rebuild in this slice.
- No multi-repository routing heuristics beyond a simple default repository connection.
- No migration away from PAT-backed local development and smoke coverage yet.

## Existing Constraints

Today the system is globally configured around a single GitHub integration instance created at startup in [src/integrations/github/client.ts](src/integrations/github/client.ts) and attached once in [src/server.ts](src/server.ts).

The primary persistence schema in [sql/init/001_initial.sql](sql/init/001_initial.sql) stores reports, artifacts, issue links, replay records, and agent tasks without any workspace or project boundary.

Webhook registration in [src/routes/webhooks/index.ts](src/routes/webhooks/index.ts) is source-based, not project-based. The extension ingestion route in [src/routes/webhooks/extension.ts](src/routes/webhooks/extension.ts) already contains the validation, artifact, redaction, embedding, and queueing logic that the new public intake path should reuse.

## Proposed First-Slice Architecture

### 1. Project Scoping

Add three new core concepts:

- `workspaces`: administrative boundary
- `projects`: feedback-routing boundary
- `repo_connections`: mapping between a project and a GitHub App installation plus target repository

The first slice should support one default repository connection per project, even if the schema allows future expansion.

### 2. Runtime GitHub Resolution

Refactor GitHub writes so that the system resolves credentials at request time:

1. request or task carries project context
2. project resolves to repo connection
3. repo connection resolves to GitHub App installation metadata
4. a request-scoped Octokit client is created for that installation

This replaces the assumption that one process equals one GitHub repository.

### 3. Hosted Feedback Intake

Add a public submission path for a hosted widget or simple form:

- `POST /public/projects/:projectKey/feedback`

This route should accept a minimal payload and reuse the current extension-style enrichment pipeline wherever practical.

### 4. Review Gate Preservation

The first slice should not allow direct report-to-GitHub issue creation from public traffic.

Instead:

1. report is accepted and stored under a project
2. triage runs as usual
3. internal operator reviews routing and quality
4. internal GitHub issue creation happens only after approval

## Proposed Schema Changes

The current tables in [sql/init/001_initial.sql](sql/init/001_initial.sql) should be extended through a new migration.

### New Tables

#### `workspaces`

- `id UUID PRIMARY KEY`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL UNIQUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### `projects`

- `id UUID PRIMARY KEY`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'active'`
- `public_key TEXT NOT NULL UNIQUE`
- `default_environment TEXT`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Unique constraint recommendation:

- `(workspace_id, slug)`

#### `github_installations`

- `id UUID PRIMARY KEY`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
- `github_installation_id BIGINT NOT NULL UNIQUE`
- `account_login TEXT NOT NULL`
- `target_type TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'active'`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### `repo_connections`

- `id UUID PRIMARY KEY`
- `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
- `github_installation_row_id UUID NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE`
- `repository_full_name TEXT NOT NULL`
- `repository_owner TEXT NOT NULL`
- `repository_name TEXT NOT NULL`
- `default_branch TEXT NOT NULL DEFAULT 'main'`
- `is_default BOOLEAN NOT NULL DEFAULT true`
- `status TEXT NOT NULL DEFAULT 'active'`
- `allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Unique constraint recommendations:

- `(project_id, repository_full_name)`
- partial uniqueness on `(project_id)` where `is_default = true`

### Existing Tables To Extend

The first slice should add `project_id` to at least:

- `feedback_reports`
- `artifact_bundles`
- `triage_jobs`
- `github_issue_links`
- `replay_runs`
- `shadow_suites`
- `shadow_suite_runs`
- `agent_tasks`
- `agent_task_executions`
- `agent_task_execution_pull_requests`

The first migration can prioritize the tables required for the public intake path and GitHub routing, then backfill the rest immediately after.

## Route Plan

### New Public Route

Add a new route module, likely:

- `src/routes/public/feedback.ts`

First route:

- `POST /public/projects/:projectKey/feedback`

Suggested payload for the first slice:

```json
{
  "title": "Checkout button stalls after promo code",
  "description": "I click submit and nothing happens for several seconds.",
  "severity": "high",
  "pageUrl": "https://staging.example.com/checkout",
  "environment": "staging",
  "screenshotBase64": "...optional...",
  "consoleLogs": ["...optional..."],
  "reporter": {
    "displayName": "QA User",
    "email": "qa@example.com"
  }
}
```

Return shape:

```json
{
  "accepted": true,
  "reportId": "<uuid>",
  "status": "received"
}
```

### Internal Review Route Additions

The first slice should extend internal routes rather than invent a separate review subsystem.

Needed capabilities:

- list reports by project and status
- inspect project-scoped report context
- confirm repository connection for a report when needed
- create issue draft after review

Those additions likely belong under the existing internal routes rather than a new UI-first API.

## Service Refactor Plan

### GitHub Integration

Refactor [src/integrations/github/client.ts](src/integrations/github/client.ts) into two layers:

1. low-level GitHub client factory
2. project-aware resolver

Suggested split:

- `createPatClient()` remains for local dev and smoke
- add a new app-installation client factory that accepts app credentials plus installation id at runtime
- introduce a repository or service that resolves the correct repo connection for a project

The key change is that GitHub auth must no longer be bound once at startup in [src/server.ts](src/server.ts).

### Config Contract

[src/support/config.ts](src/support/config.ts) should keep PAT and app config for operator-owned local instances, but the customer-facing path should stop depending on a single `GITHUB_OWNER`, `GITHUB_REPO`, or `GITHUB_APP_INSTALLATION_ID`.

The first slice should preserve:

- current PAT mode for local development
- current GitHub App mode for single-install test paths

while introducing a runtime project-scoped resolution path for the new onboarding flow.

## Reuse Strategy

Do not create a second report pipeline.

The public submission route should reuse these existing concerns from [src/routes/webhooks/extension.ts](src/routes/webhooks/extension.ts):

- request validation patterns
- artifact upload budget checks
- redaction
- impact scoring
- embedding generation
- report persistence
- job enqueueing
- audit event writing

The public route can start with a lighter payload than the extension route, but it should still end in the same canonical `feedback_reports` and `triage_jobs` model.

## Suggested File Changes

### New Files

- `src/routes/public/feedback.ts`
- `src/routes/public/index.ts`
- `src/repositories/workspace-repository.ts`
- `src/repositories/project-repository.ts`
- `src/repositories/github-installation-repository.ts`
- `src/repositories/repo-connection-repository.ts`
- `sql/init/002_phase9_customer_onboarding.sql`

### Existing Files To Change

- `src/server.ts`
- `src/support/config.ts`
- `src/integrations/github/client.ts`
- `src/routes/internal/github.ts`
- `src/routes/internal/index.ts`
- `src/routes/webhooks/extension.ts`

## Rollout Order

### Step 1

Add schema and repositories for workspaces, projects, GitHub installations, and repo connections.

### Step 2

Add `project_id` support to report creation and triage enqueueing.

### Step 3

Refactor GitHub auth to support runtime repo-connection resolution while preserving existing PAT test paths.

### Step 4

Add the public feedback route and minimal payload.

### Step 5

Add internal review helpers for project-scoped report inspection and issue creation.

### Step 6

Only after the above is stable, add a hosted widget wrapper around the public feedback route.

## Validation Plan

1. Existing internal E2E and smoke checks must still pass.
2. A report created through the new public route must persist under the correct project.
3. Project-scoped report lookup must not leak across projects.
4. GitHub issue creation must resolve the correct repo connection at runtime.
5. When no valid repo connection exists, the report must remain reviewable without causing a GitHub write.
6. Public submission must still redact sensitive fields before persistence.

## Recommended Immediate Next Task

Implement Step 1 and Step 2 first:

- new schema migration
- repository layer for workspaces, projects, GitHub installations, and repo connections
- project-aware report creation path

That is the smallest durable change that unlocks every later Phase 9 feature.