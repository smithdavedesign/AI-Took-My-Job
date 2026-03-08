# AI-DevOps Nexus Roadmap

## Goal

Build Nexus as a self-hostable internal engineering intelligence platform that ingests high-signal internal reports, normalizes context, and progressively automates issue creation, reproduction, and verified fixes.

## Guiding Principles

- Ship the ingestion backbone before the autonomous fix pipeline.
- Treat deterministic reproduction as the main technical risk.
- Keep security boundaries explicit from day one.
- Require human review for all AI-generated GitHub artifacts in v1.
- Prefer simple, observable service boundaries over early optimization.

## Delivery Phases

Status legend:

- `[x]` complete
- `[-]` in progress or partially complete
- `[ ]` not started

## Milestone Board

### Done

- [x] Phase 0 foundation baseline is operational.
- [x] Phase 1 ingestion and triage backbone is operational.
- [x] GitHub draft sync supports both PAT and GitHub App auth models.
- [x] Secret and PII redaction is in place before persistence and drafting.
- [x] HAR replay normalization, replay jobs, and Playwright request-context execution are live.
- [x] Signed artifact downloads and service-token protected internal routes are live.
- [x] Committed end-to-end smoke automation is live, including safe GitHub test-repo routing.

### Next

- [x] Continue Phase 7 MCP developer context.
- [x] Publish dedicated MCP setup docs and learn-more hosting routes.
- [x] Add a report-index backfill path and CI smoke coverage for developer context.
- [x] Start Phase 8 shadow-suite retention and distribution.
- [x] Add a review gate before GitHub writes are treated as production-ready workflow.

### Blocked

- [x] Agentic PR generation now requires approved replay-backed validation before promotion when replay evidence exists.
- [x] MCP developer context now exposes compact ownership, clustering, and reproduction summaries plus SDK-backed smoke coverage.
- [x] Shadow-suite distribution now has retained replay routes, scheduler entrypoint, worker execution, Compose worker support, and Terraform packaging.

### [x] Phase 0: Foundation

Objective: establish a self-hostable baseline and the contracts every later phase depends on.

Deliverables:

- [x] TypeScript Fastify gateway with health checks and authenticated ingestion endpoints.
- [x] Docker Compose topology for local and self-hosted development.
- [x] Environment variable contract and startup validation.
- [x] Initial database schema for reports, artifacts, jobs, issue links, and audit logs.
- [x] Basic structured logging and audit event writing.

Exit criteria:

- [x] A local operator can boot PostgreSQL, Redis, and the gateway with one command.
- [x] The gateway accepts validated webhook payloads and emits audit/job events.

### [x] Phase 1: Ingestion And Triage Backbone

Objective: accept reports from Slack, observability tools, and the future browser extension and normalize them into a canonical feedback model.

Deliverables:

- [x] Slack reaction and event endpoint.
- [x] Observability webhook endpoint for Sentry, Datadog, and New Relic style payloads.
- [x] Canonical feedback schema and persistence model.
- [x] Initial impact score model using source, severity, and frequency hints.
- [x] Queue-backed triage job creation.

Exit criteria:

- [x] A bug reaction or telemetry event becomes a stored report and queued triage job.

### [x] Phase 2: Redaction, Classification, And Issue Creation

Objective: turn stored reports into safe, structured engineering issues.

Deliverables:

- [x] Multi-layer secret and PII scrubbing.
- [x] Intent classification and normalization pipeline.
- [x] GitHub issue draft creation flow.
- [x] Review gate before any GitHub write.
- [x] Deduplication v1 using deterministic heuristics and full-text similarity.

Exit criteria:

- [x] An internal report can be converted into a proposed GitHub issue without leaking sensitive data.

### [x] Phase 3: Browser Extension MVP

Objective: capture the state developers need for deterministic reproduction.

Deliverables:

- [x] Explicit screen recording capture.
- [x] Console log capture.
- [x] localStorage and sessionStorage snapshots.
- [x] HAR and request metadata capture.
- [x] Client-side first-pass redaction and bounded upload flow.

Exit criteria:

- [x] QA or PO can submit a captured artifact bundle attached to a report.

### [x] Phase 4: Reproduction Spike And Runner

Objective: prove that captured sessions can be replayed reliably enough to support verified fixes.

Deliverables:

- [x] HAR normalization pipeline.
- [x] Synthetic token and auth-refresh handling strategy.
- [x] Isolated Playwright execution service.
- [x] Repeated fail-before and pass-after validation policy.
- [x] Artifact-based reproduction job model.

Exit criteria:

- [x] Nexus can show consistent failure on a buggy build for at least one representative report class.

### [x] Phase 5: Semantic Intelligence

Objective: reduce noise and improve code ownership mapping.

Deliverables:

- [x] pgvector-backed semantic deduplication.
- [x] pgvector-backed embedding schema, nearest-neighbor repository scaffold, and ingestion-time embedding persistence.
- [x] Historical linkage to recent issues and closed PRs via report history routes and prepared agent context.
- [x] Repository-aware code ownership mapping.
- [x] Impact score refinement using recurrence and breadth.

Exit criteria:

- [x] Similar reports cluster together and suggest likely owning code areas.

### [x] Phase 6: Agentic PR Pipeline

Objective: generate fix proposals only when a trustworthy reproduction exists.

Deliverables:

- [x] Agent-task intake, execution records, repository worktree preparation, pluggable agent command handoff, stronger agent output contracts, and execution inspection routes are live.
- [x] Draft PR generation integration is live for configured repositories, and PR opening is blocked pending approval and explicit promotion.
- [x] Fix validation now includes replay-backed verification against stored HAR evidence, a dedicated persisted replay-comparison model, execution read routes, a persisted validation policy record, and explicit execution closeout gating.
- [x] PR metadata and audit trail.
- [x] Human approval workflow.

Exit criteria:

- [x] Nexus can produce a draft PR with linked evidence and validation status.

### [x] Phase 7: MCP Developer Context

Objective: surface active issue intelligence directly in the IDE.

Deliverables:

- [x] MCP server with active issues by file or service, including persisted repository file-path and service indexing.
- [x] Issue context tool returning logs, artifacts, triage summaries, and inline previewable artifact context.
- [x] Async reproduction status lookup.
- [x] Linked observability context.
- [x] Hosted learn-more pages for the PRD and developer workbench preview.
- [x] Backfill utility and CI smoke coverage for persisted developer-context indexing.
- [x] Compact engineering summary for ownership, clustering, and reproduction context plus MCP smoke coverage.

Exit criteria:

- [x] Developers can query active issue context from the IDE without leaving their editor.

### [x] Phase 8: Shadow Suite And Distribution

Objective: turn validated reproductions into durable regression coverage and make deployment portable.

Deliverables:

- [x] Shadow test library management.
- [x] Continuous replay against staging or preview environments.
- [x] Supported Docker Compose distribution.
- [x] Terraform packaging once runtime topology stabilizes.

Exit criteria:

- [x] Teams can self-host Nexus and continuously run retained reproductions in shadow mode.

## Current Sprint

Current focus has moved beyond the original foundation sprint. The initial sprint items are complete:

1. [x] Create the roadmap and execution baseline.
2. [x] Scaffold the gateway service.
3. [x] Define environment and container contracts.
4. [x] Add initial webhook routes and validation.
5. [x] Add database bootstrap SQL for core entities.

Current execution emphasis:

1. [x] Continue Phase 7 MCP developer context.
2. [x] Start Phase 8 retained replay and distribution work.

## Open Questions

These do not block initial scaffolding, but they do affect later architecture:

1. GitHub auth model for v1 has been answered as both PAT-backed service and GitHub App support.
2. Observability ingestion now supports Sentry, Datadog, and New Relic, but ownership mapping and prioritization policy are still open.
3. Does the browser extension need Chrome-only support at first, or Chromium plus Firefox?
4. Should the first reproduction spike target a web frontend with stable staging auth, or a synthetic demo app?

## Success Metrics

- Gateway startup time under 10 seconds in local Compose.
- Webhook request validation failure rate visible in logs.
- Triage job creation latency under 500 ms from accepted ingestion.
- Zero known sensitive value leakage in redaction tests.
- [x] First deterministic replay achieved before autonomous PR work begins.