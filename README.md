# AI-DevOps Nexus

AI-DevOps Nexus turns messy internal engineering signal into something a team can actually ship against.

It is a self-hostable incident-intelligence layer for teams that need more than alert spam, screenshots, and hand-written bug tickets. Nexus captures browser and observability evidence, stores a canonical report, replays the failure path, drafts the issue, and prepares an agent-ready execution bundle.

The goal is simple: stop losing context between the moment something breaks and the moment someone is finally ready to fix it.

## Why This Exists

Most teams already have the raw ingredients for fast debugging. They just do not have a reliable handoff.

A report arrives from a browser session. Sentry lights up. A HAR file gets attached somewhere. A draft issue appears later with half the evidence missing. Nexus is designed to keep the report, artifacts, replay evidence, draft output, and agent handoff connected as one system instead of five disconnected tools.

## What Exists Today

The repository now covers the full Phase 0 and Phase 1 baseline, the full Phase 2 through Phase 8 delivery line, and the first Phase 9 customer-onboarding slice from [roadmap.md](roadmap.md):

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
- Agent executions now expose an explicit closeout view with contract, validation, review, promotion, and merge gates.
- Human approval and explicit PR promotion for agent executions, so GitHub PR creation is blocked until review is recorded.
- A Phase 7 MCP stdio server now exposes active issue lookup, issue context, reproduction status, and observability context for IDE integrations.
- The active-issue lookup now supports persisted report indexing for services and repository file paths, and the MCP issue-context tool can inline previews for logs, storage snapshots, HARs, and execution JSON artifacts.
- Public learn-more pages are now hosted at `/learn` and `/learn/prd`, and `/learn` now keeps browser-persisted rollout checklist state plus operator notes across the five-step journey.
- A standalone operator onboarding static site now lives under `onboarding-site/` for Vercel-hosted product education and rollout handoff.
- Deterministic report embeddings persisted at ingestion time for later clustering and similarity workflows.
- First-class PR audit records and approval-gated merge attempts for agent executions.
- Ownership candidate inference from explicit report metadata, linked repository context, and nearest-neighbor reports.
- Similar-report linkage that combines nearest-neighbor embeddings with deterministic heuristics and issue references.
- Deterministic report classification and duplicate detection wired into triage and agent preparation.
- Extension capture now validates explicit screen recording and console-log artifacts with enforced inline upload budgets.
- Replay execution restores cookie and storage context and records restored-state evidence in replay output.
- Replay execution now prefers a full browser context with cookie, localStorage, and sessionStorage hydration, and falls back to request-context execution when browser binaries are unavailable.
- Committed end-to-end smoke automation with safe GitHub test-repository routing.
- Docker Compose topology for PostgreSQL, Redis, and optional MinIO.
- Workspace, project, GitHub installation, and repository-connection persistence is now live for project-scoped onboarding.
- Internal onboarding routes can now create workspaces, projects, repository connections, signed hosted-widget sessions, and GitHub App install links that land on a callback-backed installation sync flow.
- Runtime GitHub resolution is now project-aware for issue drafting, promotion, merge, and repository checkout.
- Project-scoped GitHub resolution now supports multiple active repo connections, explicit default reassignment, and strict hosted-feedback repository approval before downstream agent tasks can target GitHub.
- Public project feedback intake is now live at `/public/projects/:projectKey/feedback`, with both a project-hosted widget page at `/public/projects/:projectKey/widget`, an embeddable bootstrap script at `/public/projects/:projectKey/embed.js`, a session-scoped customer dashboard at `/public/projects/:projectKey/dashboard`, and a durable customer portal at `/public/projects/:projectKey/customer-portal` backed by project/customer-scoped grants.
- Hosted-feedback triage now stops at a persisted review queue, and GitHub issue creation requires an explicit internal approval step.
- The operator review console at `/learn/review-queue` now supports project rollups, queue search, assignee filters, server-side sorting, pagination, bulk assignment, bulk approve/reject actions, queue aging metrics, review activity history, full context loading, and single-report approve/reject actions.
- Workspace triage policy is now persisted per workspace, editable through `/internal/workspaces/:workspaceId/triage-policy`, and applied to ownership plus refined-impact scoring across worker triage, the review queue, and the public dashboard.
- The onboarding console at `/learn/onboarding` now exposes project-key lookup, repo-connection create and update controls, workspace triage policy editing, project support-readiness snapshots, widget handoff links, and service-identity list, create, rotate, and revoke controls.
- The dedicated support console at `/learn/support-ops` now resolves projects by key, loads the live support-readiness snapshot, exposes public widget and feedback routes, and links operators directly into review and onboarding follow-up paths.
- Onboarding, review, and support learn surfaces now expose consistent readiness and promotion guardrails, and the review queue blocks single-item approval until target, context, and operator rationale are all visible.
- Signed widget sessions remain the v1 hosted-intake access model, and operators can now issue durable customer portal grants that keep project/customer-scoped status visibility alive after the original widget session expires.
- Durable service identities now support explicit lifecycle management through internal routes instead of startup-only env seeding.
- The customer handoff path is now measured by a dedicated `npm run e2e:customer-handoff` smoke that validates project setup, widget minting, hosted feedback intake, review-queue visibility, and draft readiness against a stricter 30-second total budget plus stage-by-stage SLO thresholds.
- The replay browser-context smoke is now wired for CI environments that install Chromium before running `npm run e2e:replay-browser-context`.

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete
- Phase 5: complete
- Phase 6: complete
- Phase 7: complete
- Phase 8: complete
- Phase 9: complete
- Phase 10: complete

## Operator Onboarding Site

The repository now includes a standalone static onboarding site in `onboarding-site/`.

The primary in-app guided entry point is `/learn`, which now walks operators through the same five-step runtime sequence, persists rollout checklist state and notes in-browser, and links into `/learn/onboarding`, `/learn/review-queue`, `/learn/support-ops`, and `/learn/prd` with shared readiness and promotion guardrails.

Use it when you want a lightweight public-facing walkthrough for operators, prospects, or internal rollout leads without exposing the Fastify app itself.

What it covers:

- Pilot: stand up a workspace, define the project, and frame the initial rollout.
- Connect: attach GitHub and repository scope with the right auth model.
- Launch: mint intake surfaces, validate handoff links, and confirm readiness.
- Operate: run the review queue and support surfaces as the daily control plane.
- Promote: move only approved, validation-safe work into GitHub and customer-visible access.

Deployment model:

- import this repository into Vercel
- set the project root directory to `onboarding-site`
- keep the framework preset as `Other`
- leave the build command empty
- leave the output directory empty

Current deployment:

- public site: `https://onboarding-site-eight.vercel.app`

Recommended usage:

- use `/learn` inside a running Nexus environment for the guided operator workflow
- use the Vercel-hosted static site for public-facing onboarding and rollout handoff

See `onboarding-site/README.md` for the deployment details.

## How It Works

### Processes

- Gateway: receives webhooks and internal API requests.
- Worker: consumes queued triage jobs, replay jobs, and agent-execution jobs.
- PostgreSQL: stores onboarding state, reports, drafts, jobs, review state, and audit logs.
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
    Widget[Hosted Feedback Widget]
  end

  subgraph Control[Nexus Control Plane]
    Gateway[Nexus Gateway\nFastify]
    Router[Project Router\nGitHub Resolver]
    Review[Review Queue\nHuman Approval]
    Worker[Nexus Worker\nTriage + Replay + Agent Execution]
  end

  Redis[(Redis / BullMQ)]
  Postgres[(PostgreSQL\nWorkspaces + Projects + Reports)]
  Artifacts[(Artifact Storage\nLocal or S3)]
  GitHubApp[GitHub App\nInstallations]
  GitHub[GitHub Issues + PRs]

  Slack --> Gateway
  Sentry --> Gateway
  Datadog --> Gateway
  NewRelic --> Gateway
  Extension --> Gateway
  Widget --> Gateway

  Gateway --> Postgres
  Gateway --> Router
  Gateway --> Redis
  Gateway --> Artifacts
  Redis --> Worker
  Worker --> Postgres
  Worker --> Review
  Review --> GitHub
  Router --> GitHubApp
  Router --> Postgres
  Worker --> GitHub
  Worker --> Artifacts
```

### Customer Onboarding Flow

```mermaid
sequenceDiagram
  participant Admin as Workspace Admin
  participant Nexus as Nexus Gateway
  participant Store as Postgres
  participant GitHubApp as GitHub App

  Admin->>Nexus: Create workspace
  Nexus->>Store: Persist workspace
  Admin->>Nexus: Create project
  Nexus->>Store: Persist project
  Admin->>Nexus: Request GitHub App install link
  Nexus-->>Admin: Signed install URL with workspace/project state
  Admin->>GitHubApp: Install app on repository or org
  GitHubApp->>Nexus: Redirect to install callback
  Nexus->>GitHubApp: Fetch installation + repository visibility
  Nexus->>Store: Upsert github_installation and repo connection binding
```

### Project Feedback Flow

```mermaid
sequenceDiagram
  participant Reporter as Reporter or Customer
  participant Embed as Embedded Script
  participant Widget as Hosted Widget Page
  participant Gateway as Nexus Gateway
  participant Router as Project Router
  participant Store as Postgres + Artifact Store
  participant Queue as BullMQ
  participant Worker as Nexus Worker
  participant Review as Review Queue
  participant GitHub as GitHub

  Reporter->>Gateway: Request signed widget session through internal control plane
  Reporter->>Embed: Launch embedded feedback surface
  Embed->>Widget: Render signed project-scoped iframe
  Reporter->>Widget: Open project feedback page
  Widget->>Gateway: POST hosted feedback payload with widget session token
  Reporter->>Gateway: Submit project feedback or webhook report
  Gateway->>Router: Resolve project and repository scope
  Router-->>Gateway: Project context + default repository
  Gateway->>Store: Persist project-scoped feedback report
  alt Inline artifacts included
    Gateway->>Store: Persist artifact files + metadata
  else Artifact flags only
    Gateway->>Store: Persist pending artifact metadata
  end
  Gateway->>Queue: Enqueue triage job
  Gateway->>Queue: Enqueue replay job when HAR exists
  Queue->>Worker: Deliver triage job
  Worker->>Store: Read report + artifacts
  Worker->>Worker: Build draft, similarity, and replay evidence
  opt Review-approved GitHub action
    Worker->>Review: Present project-scoped draft or PR candidate
    Review->>GitHub: Create issue or PR in connected repository
    GitHub-->>Review: Issue or PR URL + number
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

## Public Routes

- `GET /public/projects/:projectKey/embed.js`
- `GET /public/projects/:projectKey/widget`
- `GET /public/projects/:projectKey/dashboard`
- `GET /public/projects/:projectKey/dashboard/summary`
- `GET /public/projects/:projectKey/customer-portal`
- `GET /public/projects/:projectKey/customer-portal/summary`
- `POST /public/projects/:projectKey/feedback`
- `GET /github/app/install/callback`

## Internal Routes

- `POST /internal/workspaces`
- `GET /internal/workspaces/:workspaceId`
- `GET /internal/workspaces/:workspaceId/projects`
- `GET /internal/workspaces/:workspaceId/github-installations`
- `POST /internal/workspaces/:workspaceId/github-app/install-link`
- `POST /internal/workspaces/:workspaceId/github-app/reconcile`
- `POST /internal/workspaces/:workspaceId/github-app/transfer-installation`
- `POST /internal/projects`
- `GET /internal/projects/:projectId`
- `GET /internal/projects/:projectId/operations`
- `GET /internal/projects/key/:projectKey`
- `GET /internal/github-app/installations/:installationId`
- `POST /internal/github/installations`
- `POST /internal/repo-connections`
- `PATCH /internal/repo-connections/:repoConnectionId`
- `GET /internal/projects/:projectId/repo-connections`
- `POST /internal/projects/:projectId/widget-session`
- `GET /internal/projects/:projectId/customer-portal-grants`
- `POST /internal/projects/:projectId/customer-portal-grants`
- `POST /internal/projects/:projectId/customer-portal-grants/:customerPortalGrantId/revoke`
- `GET /internal/service-identity/self`
- `GET /internal/service-identities`
- `POST /internal/service-identities`
- `POST /internal/service-identities/:identityId/rotate`
- `POST /internal/service-identities/:identityId/revoke`
- `POST /internal/github/issues/draft`
- `POST /internal/agent-tasks`
- `GET /internal/agent-tasks/:taskId`
- `POST /internal/agent-tasks/:taskId/execute`
- `GET /internal/agent-tasks/:taskId/executions`
- `GET /internal/agent-task-executions/:executionId`
- `GET /internal/agent-task-executions/:executionId/artifacts`
- `GET /internal/agent-task-executions/:executionId/closeout`
- `GET /internal/agent-task-executions/:executionId/replay-validation`
- `GET /internal/agent-task-executions/:executionId/validation-policy`
- `GET /internal/agent-task-executions/:executionId/review`
- `POST /internal/agent-task-executions/:executionId/review`
- `GET /internal/agent-task-executions/:executionId/pull-request`
- `POST /internal/agent-task-executions/:executionId/promote`
- `POST /internal/agent-task-executions/:executionId/merge`
- `GET /internal/reports/:reportId/draft`
- `GET /internal/reports/:reportId/agent-tasks`
- `GET /internal/reports/active-issues`
- `GET /internal/reports/:reportId/artifacts`
- `GET /internal/reports/:reportId/classification`
- `GET /internal/reports/:reportId/context`
- `GET /internal/reports/:reportId/duplicates`
- `GET /internal/reports/:reportId/embedding`
- `GET /internal/reports/:reportId/history`
- `GET /internal/reports/:reportId/impact`
- `GET /internal/reports/:reportId/developer-summary`
- `GET /internal/reports/:reportId/ownership`
- `GET /internal/reports/review-queue`
- `POST /internal/reports/review-queue/actions`
- `GET /internal/reports/:reportId/review`
- `POST /internal/reports/:reportId/review`
- `GET /internal/reports/:reportId/similar`
- `GET /internal/reports/:reportId/replay`
- `GET /internal/shadow-suites`
- `POST /internal/shadow-suites`
- `GET /internal/shadow-suites/:suiteId`
- `POST /internal/shadow-suites/:suiteId/status`
- `GET /internal/shadow-suites/:suiteId/runs`
- `POST /internal/shadow-suites/:suiteId/run`
- `POST /internal/shadow-suites/run-due`
- `GET /internal/artifacts/:artifactId/download-url`
- `GET /artifacts/download/:artifactId`
- `GET /learn`
- `GET /learn/prd`
- `GET /learn/review-queue`
- `GET /health`

## Validation Notes

- `npm run e2e:hosted-feedback-review` now verifies signed widget access, the embeddable bootstrap route, queue assignment filters, queue activity history, the paged review-queue API, rejection gating, approval flow, and post-approval agent-task creation.
- `npm run e2e:replay-browser-context` now verifies replay reproduction with storage hydration and asserts `browser-context` execution mode when Playwright browser binaries are installed.

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
- `GITHUB_APP_SLUG`
- `GITHUB_APP_STATE_SECRET`
- `PUBLIC_WIDGET_SIGNING_SECRET`
- `PUBLIC_WIDGET_SESSION_TTL_SECONDS`
- `AGENT_EXECUTION_COMMAND`
- `AGENT_EXECUTION_ARGS`
- `AGENT_EXECUTION_TIMEOUT_SECONDS`
- `AGENT_EXECUTION_AUTO_CREATE_PR`
- `EXTENSION_MAX_INLINE_ARTIFACT_BYTES`
- `EXTENSION_MAX_TOTAL_INLINE_ARTIFACT_BYTES`

## MCP Developer Context

The first Phase 7 slice is available as a stdio MCP server:

```bash
npm run mcp:dev
```

It uses Nexus internal APIs to expose:

- active issue lookup by service or file-path heuristic
- aggregated issue context with artifacts, ownership, impact, history, replay, and agent-task summaries
- replay-backed reproduction status lookup
- linked observability context for normalized reports

The issue-context tool can also inline compact previews for previewable artifacts such as `console-logs`, `local-storage`, `session-storage`, `har`, and JSON execution artifacts.

Triage now persists a lightweight `reportIndex` into report payloads so service and repository file-path searches can reuse stable metadata instead of relying only on ad hoc text scans.

For older reports, run `npm run backfill:report-index` to persist the same index onto already-triaged data. Use `--dry-run`, `--limit=<n>`, or `--force` as needed.

Detailed setup, examples, and a VS Code MCP configuration snippet are documented in [docs/mcp-developer-context.md](docs/mcp-developer-context.md).

A dedicated smoke path now exists as `npm run e2e:developer-context`, and GitHub Actions runs it through [.github/workflows/developer-context-smoke.yml](.github/workflows/developer-context-smoke.yml).

`npm run e2e:mcp-developer-context` now validates the stdio MCP server itself with the SDK client, including the compact engineering summary tool.

The broader packaging and agent-runtime smoke now runs through [.github/workflows/agent-and-deployment-smoke.yml](.github/workflows/agent-and-deployment-smoke.yml). That workflow always executes policy-review, Compose, and Terraform validation. Promotion ownership only runs when the repository secrets `E2E_GITHUB_TOKEN`, `E2E_GITHUB_TEST_OWNER`, and `E2E_GITHUB_TEST_REPO` are configured.

## Shadow Suite And Distribution

Phase 8 now includes retained shadow-suite management and queued replay execution for staging or preview environments. Use `npm run e2e:shadow-suite` to validate the retained replay flow locally, and `npm run shadow-suite:tick` to enqueue due suites from a scheduler.

Distribution support now includes a dedicated `worker` service in [docker-compose.yml](docker-compose.yml) and a Terraform Docker-provider scaffold under [infra/terraform/main.tf](infra/terraform/main.tf). The full Phase 8 operator notes are in [docs/shadow-suite.md](docs/shadow-suite.md).

## GitHub Auth Modes

Two GitHub auth models are supported:

- PAT mode for a service account with a fine-grained token.
- GitHub App mode for stronger repository scoping and auditability.

For automated end-to-end runs, GitHub sync can be redirected to a disposable test repository:

- Set `GITHUB_USE_TEST_REPO=true`
- Set `GITHUB_TEST_OWNER` and `GITHUB_TEST_REPO`

For GitHub Actions promotion smoke, add these repository secrets so [.github/workflows/agent-and-deployment-smoke.yml](.github/workflows/agent-and-deployment-smoke.yml) can exercise the full promotion path instead of reporting a skipped job:

- `E2E_GITHUB_TOKEN`
- `E2E_GITHUB_TEST_OWNER`
- `E2E_GITHUB_TEST_REPO`

When this is enabled, all draft sync during smoke tests goes to the test repository instead of the primary `GITHUB_OWNER` and `GITHUB_REPO` target.

Detailed setup notes are in [docs/github-auth.md](docs/github-auth.md).

## Phase 9 Onboarding Slice

The Phase 9 customer-onboarding flow is now live behind internal routes and project-scoped public feedback surfaces.

- Workspace admins can create a workspace and project, mint a GitHub App install link, let GitHub call back into Nexus to persist the installation, and connect or update the project repository binding without a PAT.
- Operators can inspect project operations, active/default repository scope, and service-identity lifecycle directly from `/learn/onboarding` instead of stitching together raw internal API calls.
- Public feedback can now be submitted to `POST /public/projects/:projectKey/feedback` through a signed widget session and is persisted with `project_id` before triage begins.
- Customers can open `/public/projects/:projectKey/dashboard` with the same signed widget session to track only the submissions made through that session, including review state, policy-aware refined impact, and policy-aware ownership hints.
- Runtime GitHub resolution now uses project repo connections first, supports multiple active repositories with explicit default selection, and only falls back to global env configuration when a project-scoped connection does not exist.
- Hosted feedback now lands in `/internal/reports/review-queue`, and `POST /internal/reports/:reportId/review` is the approval gate for GitHub issue creation.
- The operator review queue now exposes queue aging metrics, policy-backed owner hints, report-level review activity history sourced from persisted audit events, and the set of allowed project repositories for review approval.
- V1 keeps signed-session distribution instead of broader customer auth so adoption stays lightweight while the customer-facing dashboard remains scoped to the active session only.

Live local validation on 2026-03-08 created a workspace, project, signed widget session, and hosted-feedback reports, confirmed review-gated processing end to end, and verified the stored report rows carried the correct `project_id`.

The review gate is now live end to end: `npm run e2e:hosted-feedback-review` validates queue listing, policy-backed ownership visibility, rejection, approval, hosted-feedback agent-task gating, project operations loading, and service-identity lifecycle coverage in the same smoke path.

Agent-task submission and execution flow is documented in [docs/agent-task-flow.md](docs/agent-task-flow.md).

If `AGENT_EXECUTION_COMMAND` is configured, the worker will invoke it inside each prepared execution worktree and expect the command to read `.nexus/task.md` and `.nexus/context.json`, then write structured output to `.nexus/output.json`. When an execution produces promotable changes, Nexus stops at a reviewed execution state and requires explicit approval plus `POST /internal/agent-task-executions/:executionId/promote` before it will push the branch and open a PR. PR metadata is now persisted as a first-class execution record, and `POST /internal/agent-task-executions/:executionId/merge` refuses to merge unless the latest human review is still approved.

The `.nexus/output.json` contract can also request replay-backed validation by including a `replayValidation` block with a target `baseUrl` and an expected replay outcome such as `not-reproduced`.

Each stored report now also gets a deterministic `deterministic-hash-v1` embedding at ingestion time, exposed through `GET /internal/reports/:reportId/embedding` so clustering and similarity features can build on live data instead of empty schema scaffolding.

Ownership hooks are now exposed through `GET /internal/reports/:reportId/ownership` and are also attached to prepared agent-task context. Current candidates come from explicit owner metadata in the report payload, linked repository owner, and similar stored reports.

Similarity hooks are now exposed through `GET /internal/reports/:reportId/similar` and are also attached to prepared agent-task context. Current ranking blends embedding distance with deterministic heuristics such as title overlap, source match, severity match, and matching external identifiers.

Historical linkage is now exposed through `GET /internal/reports/:reportId/history` and is also attached to prepared agent-task context. It aggregates prior GitHub issue drafts/issues and agent-execution PR records from the current report plus semantically related reports so operators and agents can see recent related remediation history.

Refined impact is now exposed through `GET /internal/reports/:reportId/impact` and is also attached to prepared agent-task context. The score blends the original ingestion-time score with recurrence from similar reports, breadth across sources and reporters, ownership spread, and related issue or PR history.

Classification is now exposed through `GET /internal/reports/:reportId/classification`, and duplicate candidates are exposed through `GET /internal/reports/:reportId/duplicates`. Triage persists both into report payloads and agent-task prepared context, and high-confidence duplicates can reuse an existing synced GitHub issue instead of creating another one.

The committed full-stack E2E now validates explicit screen-recording and console-log artifact capture, plus bounded inline upload rejection. Replay execution also restores cookie and storage context, prefers browser-context execution when available, and persists restored-state evidence such as cookie names, storage keys, and placeholder-resolution counts.

Promoted PRs now include execution evidence references, validation status, refined impact, and ownership hints in the PR body. When `APP_BASE_URL` is configured, those evidence references become fully qualified links back into Nexus internal routes.

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

To run the full packaged stack, including MinIO bucket bootstrap and the dedicated worker container:

```bash
docker compose up -d --build
```

The Compose packaging now overrides `DATABASE_URL`, `REDIS_URL`, and `S3_ENDPOINT` with in-network service addresses so the containers do not inherit host-local values like `127.0.0.1` from `.env`.

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

The dedicated replay execution-mode smoke runs separately as `npm run e2e:replay-browser-context`.

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
- Replay execution now has browser-context restoration, but the dedicated browser smoke is not yet promoted into CI environments that do not ship Playwright browser binaries.
- Service identities are now durable and auditable, but the operator surface is still centered on onboarding rather than a broader admin console.
- Full runtime validation requires Docker because PostgreSQL and Redis are expected to run through Compose.
- GitHub sync is optional and disabled by default.
- Intent classification, deduplication, ownership mapping, and semantic clustering are not implemented yet.
- Agent tasks currently stop at prepared context; there is no live code-agent execution, branch orchestration, or PR generation yet.

## Next Recommended Work

1. Promote the replay browser-context smoke into CI environments with browser binaries so the preferred execution mode stays enforced.
2. Broaden the operator surface beyond onboarding into repo-connection editing and customer support workflows.
3. Add semantic clustering, deterministic deduplication, and ownership mapping where gaps remain.
4. Continue strengthening the agentic PR pipeline only where replay-backed validation remains trustworthy.

## UI Snapshot

Current support operations console:

![Support operations console](docs/images/support-ops-ui.png)