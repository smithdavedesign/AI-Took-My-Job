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

### Phase 0: Foundation

Objective: establish a self-hostable baseline and the contracts every later phase depends on.

Deliverables:

- TypeScript Fastify gateway with health checks and authenticated ingestion endpoints.
- Docker Compose topology for local and self-hosted development.
- Environment variable contract and startup validation.
- Initial database schema for reports, artifacts, jobs, issue links, and audit logs.
- Basic structured logging and audit event writing.

Exit criteria:

- A local operator can boot PostgreSQL, Redis, and the gateway with one command.
- The gateway accepts validated webhook payloads and emits audit/job events.

### Phase 1: Ingestion And Triage Backbone

Objective: accept reports from Slack, observability tools, and the future browser extension and normalize them into a canonical feedback model.

Deliverables:

- Slack reaction and event endpoint.
- Observability webhook endpoint for Sentry, Datadog, and New Relic style payloads.
- Canonical feedback schema and persistence model.
- Initial impact score model using source, severity, and frequency hints.
- Queue-backed triage job creation.

Exit criteria:

- A bug reaction or telemetry event becomes a stored report and queued triage job.

### Phase 2: Redaction, Classification, And Issue Creation

Objective: turn stored reports into safe, structured engineering issues.

Deliverables:

- Multi-layer secret and PII scrubbing.
- Intent classification and normalization pipeline.
- GitHub issue draft creation flow.
- Review gate before any GitHub write.
- Deduplication v1 using deterministic heuristics and full-text similarity.

Exit criteria:

- An internal report can be converted into a proposed GitHub issue without leaking sensitive data.

### Phase 3: Browser Extension MVP

Objective: capture the state developers need for deterministic reproduction.

Deliverables:

- Explicit screen recording capture.
- Console log capture.
- localStorage and sessionStorage snapshots.
- HAR and request metadata capture.
- Client-side first-pass redaction and bounded upload flow.

Exit criteria:

- QA or PO can submit a captured artifact bundle attached to a report.

### Phase 4: Reproduction Spike And Runner

Objective: prove that captured sessions can be replayed reliably enough to support verified fixes.

Deliverables:

- HAR normalization pipeline.
- Synthetic token and auth-refresh handling strategy.
- Isolated Playwright execution service.
- Repeated fail-before and pass-after validation policy.
- Artifact-based reproduction job model.

Exit criteria:

- Nexus can show consistent failure on a buggy build for at least one representative report class.

### Phase 5: Semantic Intelligence

Objective: reduce noise and improve code ownership mapping.

Deliverables:

- pgvector-backed semantic deduplication.
- Historical linkage to recent issues and closed PRs.
- Repository-aware code ownership mapping.
- Impact score refinement using recurrence and breadth.

Exit criteria:

- Similar reports cluster together and suggest likely owning code areas.

### Phase 6: Agentic PR Pipeline

Objective: generate fix proposals only when a trustworthy reproduction exists.

Deliverables:

- Draft PR generation integration.
- Fix validation against a failing reproduction.
- PR metadata and audit trail.
- Human approval workflow.

Exit criteria:

- Nexus can produce a draft PR with linked evidence and validation status.

### Phase 7: MCP Developer Context

Objective: surface active issue intelligence directly in the IDE.

Deliverables:

- MCP server with active issues by file or service.
- Issue context tool returning logs, artifacts, and triage summaries.
- Async reproduction status lookup.
- Linked observability context.

Exit criteria:

- Developers can query active issue context from the IDE without leaving their editor.

### Phase 8: Shadow Suite And Distribution

Objective: turn validated reproductions into durable regression coverage and make deployment portable.

Deliverables:

- Shadow test library management.
- Continuous replay against staging or preview environments.
- Supported Docker Compose distribution.
- Terraform packaging once runtime topology stabilizes.

Exit criteria:

- Teams can self-host Nexus and continuously run retained reproductions in shadow mode.

## Current Sprint

This repository will start with the Phase 0 foundation:

1. Create the roadmap and execution baseline.
2. Scaffold the gateway service.
3. Define environment and container contracts.
4. Add initial webhook routes and validation.
5. Add database bootstrap SQL for core entities.

## Open Questions

These do not block initial scaffolding, but they do affect later architecture:

1. Which GitHub integration model should v1 use: GitHub App, PAT-backed service, or both?
2. Which observability provider should be treated as the primary first-class integration?
3. Does the browser extension need Chrome-only support at first, or Chromium plus Firefox?
4. Should the first reproduction spike target a web frontend with stable staging auth, or a synthetic demo app?

## Success Metrics

- Gateway startup time under 10 seconds in local Compose.
- Webhook request validation failure rate visible in logs.
- Triage job creation latency under 500 ms from accepted ingestion.
- Zero known sensitive value leakage in redaction tests.
- First deterministic replay achieved before autonomous PR work begins.