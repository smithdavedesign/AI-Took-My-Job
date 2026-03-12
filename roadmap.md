# AI-DevOps Nexus Roadmap

## Goal

Build Nexus as a self-hostable control plane that helps a team connect a repo, collect feedback, and review or promote work without losing engineering context.

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
- [x] Plan Phase 9 customer onboarding and repository connection.
- [x] Define workspace, project, and repository-connection data model.
- [x] Refactor GitHub auth toward runtime project-scoped GitHub App resolution.
- [x] Ship the hosted feedback widget and embed bootstrap, and continue hardening the project-scoped submission flow.
- [x] Add broader operator workflows for repo-connection editing and support-oriented customer operations.
- [x] Promote the new replay browser-context smoke into regular CI coverage where Playwright browser binaries are available.
- [x] Time-box and validate the under-60-second customer handoff target end to end.
- [x] Keep signed-session hosted-feedback access as the v1 customer access model and defer broader customer auth.
- [x] Add a session-scoped customer dashboard for hosted feedback status, ownership hints, and prioritization visibility.
- [x] Publish a standalone Vercel-hosted operator onboarding site so rollout guidance can evolve separately from the runtime surfaces.
- [-] Validate the new worker-backed agent runtime in production so approved reports can move beyond handoff-only execution with the same review gates.

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

### [x] Phase 9: Customer Onboarding And Repository Connection

Objective: make Nexus easy for external teams to adopt by connecting a GitHub repository through a GitHub App and submitting high-signal feedback through a hosted surface.

Deliverables:

- [x] Workspace and project model with project-scoped report routing.
- [x] GitHub App-based repository connection flow.
- [x] Runtime repository-to-installation resolution for GitHub writes.
- [x] Hosted feedback widget, embed bootstrap, and public submission surface for lightweight user feedback.
- [x] Project-scoped review queue before GitHub issue creation or downstream agent actions, including operator-facing queue controls and assignment workflows.
- [x] Multi-repository project support with active/default repository resolution and strict hosted-feedback task targeting.
- [x] Operator-facing project operations and onboarding surface for installs, repo scope, widget handoff, and service identity lifecycle.
- [x] Replay execution now prefers full browser-context restoration with request-context fallback.
- [x] Session-scoped customer dashboard for hosted feedback visibility using the same signed widget session model.
- [x] Customer-visible ownership and refined impact hints for hosted feedback prioritization.

Recent Phase 9 progress:

- Signed project-scoped widget sessions now gate both `/public/projects/:projectKey/widget` and `/public/projects/:projectKey/embed.js`, and the public feedback submission path now requires the same short-lived token.
- Internal onboarding can now mint GitHub App install links via `POST /internal/workspaces/:workspaceId/github-app/install-link`, and `/github/app/install/callback` persists installation metadata plus project repo bindings when repository access matches.
- The operator review queue now exposes assignment health, queue aging metrics, and per-report review activity pulled from persisted audit events.
- The review queue now keeps reviewed history visible after approval, shows a condensed operator summary before raw JSON, gives approved reports an Agent Pipeline panel for task creation plus isolated-branch launch, and exposes execution closeout plus promotion review from the same surface.
- Render worker deployment now has a documented wrapper-script execution path plus an API-backed coding adapter that reads the Nexus contract and writes `.nexus/output.json` for downstream closeout.
- Project repo routing now supports multiple active connections, explicit default reassignment, project-operations summaries, and strict customer-review repository scoping before GitHub issue creation or agent-task execution.
- Service identities are now durable lifecycle-managed principals with list, create, rotate, and revoke routes, and the onboarding console exposes those flows directly for operators.
- A dedicated replay browser-context smoke now validates execution-mode selection when Playwright browser binaries are installed while preserving request-context fallback behavior elsewhere.
- The onboarding console now supports project-key lookup, repo-connection create and edit flows, and support-readiness snapshots that surface public widget paths, review-queue routing, and recent hosted feedback state from one operator page.
- The new `/learn/support-ops` page gives operators a dedicated long-lived support surface for project-key lookup, live readiness checks, public route verification, and queue follow-up.
- CI now installs Chromium before running the replay browser-context smoke, and `npm run e2e:customer-handoff` enforces a tighter 30-second total budget with stage-by-stage SLOs for bootstrap, widget readiness, feedback submission, queue visibility, and draft readiness.
- The hosted feedback public surface now includes `/public/projects/:projectKey/dashboard`, a session-scoped customer dashboard that reuses the signed widget token and exposes submission status, ownership hints, and refined impact bands without broadening access scope.
- The v1 customer access decision is now explicit: keep signed-session distribution and defer broader customer auth until multi-user customer identity becomes necessary.
- The repository now includes `onboarding-site/`, a standalone static onboarding experience intended to be deployed on Vercel as the operator-facing handoff and rollout guide.

Phase 9 architecture snapshot:

```mermaid
flowchart LR
	Admin[Workspace Admin] --> Onboarding[Internal Onboarding Routes]
	Onboarding --> Workspace[(Workspaces + Projects)]
	Onboarding --> Install[(GitHub Installations)]
	Onboarding --> Repo[(Repo Connections)]
	Reporter[Reporter or Customer] --> Embed[/public/projects/:projectKey/embed.js/]
	Embed --> Widget[/public/projects/:projectKey/widget/]
	Widget --> PublicRoute[/public/projects/:projectKey/feedback/]
	PublicRoute --> Router[Project Router + GitHub Resolver]
	Router --> Workspace
	Router --> Repo
	Router --> Install
	PublicRoute --> Reports[(Project-Scoped Reports)]
	Reports --> Queue[BullMQ]
	Queue --> Worker[Nexus Worker]
	Worker --> Review[Project Review Queue]
	Review --> Draft[Synced GitHub Draft Issue]
	Review --> AgentTask[Agent Pipeline Task]
	AgentTask --> Execution[Isolated Branch Execution]
	Execution --> WorkerAdapter[Worker Wrapper + API Adapter]
	WorkerAdapter --> Closeout[Execution Closeout + Human Review]
	Closeout --> Promotion[PR Promotion]
	Draft --> GitHub[GitHub Issues + PRs]
	Promotion --> GitHub
```

Exit criteria:

- [x] A new customer can connect a repository without creating a PAT.
- [x] A user can submit actionable feedback in under 60 seconds.
- [x] Nexus routes the report to the correct project and repository scope before any GitHub write.
- [x] Customer-originated issue and PR generation remain review-gated.

### [x] Phase 10: Customer Visibility And Triage Policy

Objective: make hosted feedback legible to customers and operators after submission while turning heuristic ownership and impact into clearer policy.

Deliverables:

- [x] Session-scoped customer dashboard for hosted feedback using the existing signed widget session model.
- [x] Explicit v1 access decision to keep signed-session distribution and defer broader customer auth.
- [x] Customer-visible ownership and refined-impact hints surfaced from existing triage services.
- [x] Workspace-configurable ownership and prioritization policy beyond heuristic inference.
- [x] Durable customer or account views that outlive a single signed widget session.

Exit criteria:

- [x] A customer can inspect the status of submissions from the current hosted-feedback session without seeing unrelated project data.
- [x] Ownership and prioritization policy become operator-configurable and auditable.
- [x] Project/customer-scoped durable portal grants now extend visibility beyond a single widget session without exposing unrelated project data.

### [x] Phase 11: Self-Serve Adoption And Operator Ergonomics

Objective: make Nexus feel like a coherent operator product rather than a collection of powerful but loosely connected surfaces.

Deliverables:

- [x] Rewrite onboarding around a single five-step narrative: Pilot, Connect, Launch, Operate, Promote.
- [x] Split the runtime learn surfaces into dedicated page-builder modules so onboarding, review, and support copy can evolve independently.
- [x] Add a step-aware learn landing page that makes the runtime surfaces feel like one guided workflow.
- [x] Add self-serve checklist state so operators can see rollout progress without maintaining an external runbook.
- [x] Add operator-facing readiness and promotion guardrails that are consistent across onboarding, review, and support surfaces.
- [x] Add reviewed-history and post-approval pipeline cues so the review queue behaves like a decision surface instead of a disappearing inbox.
- [x] Add a first-slice operator Agent Pipeline in `/learn/review-queue` for task setup and isolated-branch launch.

Exit criteria:

- [x] A new operator can understand where to start and what comes next without external explanation.
- [x] Runtime learn pages, static onboarding, and repo docs all describe the same workflow in the same order.
- [x] The most common rollout actions can be completed without switching to an external checklist or tribal knowledge.

### [x] Phase 12: Execution Closeout And Promotion UX

Objective: finish the operator path after isolated-branch launch so execution inspection, approval, and PR promotion are as legible as the review queue.

Deliverables:

- [x] Add an operator-facing execution detail surface that shows findings, changed files, validation evidence, branch metadata, and closeout blockers.
- [x] Add explicit human review controls for agent executions without requiring raw internal route calls.
- [x] Add promote-to-draft-PR and merge-state visibility in the runtime learn surfaces.
- [x] Keep execution closeout language aligned with the review queue so operators understand what is blocked and why.

Exit criteria:

- [x] An operator can move from approved report to reviewed execution and draft PR without leaving the product surfaces.
- [x] Closeout blockers are visible without inspecting raw execution JSON.
- [x] Agent-task execution review and PR promotion stay explicitly human-gated.

### [-] Phase 13: Production Agent Runtime Enablement

Objective: move hosted production runs beyond handoff-only bundle creation and into a real worker-backed coding path without giving up the existing review gates.

Deliverables:

- [x] Clarify review-queue language so operators see an internal agent pipeline instead of a misleading issue-assignment metaphor.
- [x] Publish Render worker configuration guidance for execution command, timeout, and worker-only secrets.
- [x] Add a stable worker wrapper entrypoint and an API-backed coding adapter that reads the Nexus contract and writes `.nexus/output.json`.
- [ ] Validate a full production execution after deploy using the configured worker secrets and runtime command.

Exit criteria:

- [ ] Production agent executions can move past handoff-only status and produce either code changes, a no-change result, or a blocked contract through the worker adapter.
- [x] Worker runtime configuration is documented in repo docs and blueprint defaults without overwriting existing dashboard-managed secrets.
- [x] The operator review queue still requires explicit human review before PR promotion.

## Current Sprint

Current focus has moved beyond the original foundation sprint. The initial sprint items are complete:

1. [x] Create the roadmap and execution baseline.
2. [x] Scaffold the gateway service.
3. [x] Define environment and container contracts.
4. [x] Add initial webhook routes and validation.
5. [x] Add database bootstrap SQL for core entities.

Current execution emphasis:

1. [x] Mark Phase 10 complete and shift the active workstream toward self-serve adoption.
2. [x] Rewrite onboarding and rollout guidance around Pilot, Connect, Launch, Operate, and Promote.
3. [x] Break the runtime learn surfaces into dedicated modules so each stage can evolve cleanly.
4. [x] Add a guided runtime learn landing page that ties onboarding, review, and support into one sequence.
5. [x] Add step-aware rollout state and readiness guidance for operators.
6. [x] Keep customer visibility, policy, and promotion guardrails aligned with the new self-serve story.
7. [x] Finish the execution closeout slice so the review queue has a complete operator continuation after branch launch.
8. [-] Validate the new production worker adapter path after deploy so hosted runs can move beyond handoff-only status.

## Open Questions

These do not block initial scaffolding, but they do affect later architecture:

1. GitHub auth model for v1 has been answered as both PAT-backed service and GitHub App support.
2. Observability ingestion now supports Sentry, Datadog, and New Relic; durable customer visibility is now handled through project/customer-scoped portal grants while broader account identity remains deferred.
3. Does the browser extension need Chrome-only support at first, or Chromium plus Firefox?
4. Should the first reproduction spike target a web frontend with stable staging auth, or a synthetic demo app?
5. Should Phase 9 start with one repository per project, or support multiple repositories from the first slice?
6. When does the session-scoped customer dashboard stop being sufficient and require durable customer or account access?
7. What operator-configurable ownership and prioritization rules should outrank the current heuristic inference model?
8. How much checklist and rollout state should Nexus persist directly instead of leaving it in external runbooks?
9. What is the smallest guided learn landing page that makes the five runtime surfaces feel like one product?

## Success Metrics

- Gateway startup time under 10 seconds in local Compose.
- Webhook request validation failure rate visible in logs.
- Triage job creation latency under 500 ms from accepted ingestion.
- Zero known sensitive value leakage in redaction tests.
- [x] First deterministic replay achieved before autonomous PR work begins.
- [x] Initial Phase 9 slice validated locally: onboarding records plus a project-scoped hosted-feedback report persisted with `project_id` on 2026-03-08.
- [x] Hosted feedback now queues for internal review before GitHub issue creation, with dedicated review endpoints and agent-task gating.
- [x] Operator review is now exercised by `e2e:hosted-feedback-review`, with queue assignment actions, and stronger review surfaces are available at `/learn/review-queue`, `/learn/onboarding`, and `/learn/support-ops`.
- [x] New customer repository connection can now start from a GitHub App install link and callback, with broader operator-facing onboarding and support workflows available in the learn surfaces.
- [x] Customer feedback submission completed in under 60 seconds through the hosted intake surface, with `npm run e2e:customer-handoff` currently enforcing a stricter 30-second total budget plus stage SLOs.
- [x] Customers can now inspect session-scoped hosted-feedback status through `/public/projects/:projectKey/dashboard`, including current review state, refined impact, and ownership hints.
- [x] Runtime learn pages, static onboarding, and repo docs now share the same five-step narrative for operator rollout.
- [x] Approved reports now stay inspectable in reviewed history and can move directly into agent-task setup, execution closeout, and promotion review from `/learn/review-queue`.
- [x] The Render blueprint and ops docs now describe a worker-backed API adapter for production agent execution, with the remaining gap being live post-deploy validation.

## Tech Debt Reduction Plan

Objective: improve maintainability and delivery confidence without changing the product contract shipped through Phase 11.

### Immediate Blocker

- [ ] Restore green push workflows first. Treat `.github/workflows/agent-and-deployment-smoke.yml` and `.github/workflows/developer-context-smoke.yml` as the first debt-reduction target, identify the exact failing job or smoke path, and keep CI stabilization ahead of broader refactors.

### Focus Areas

- [ ] Reduce CI brittleness and make failing push diagnostics faster to understand.
- [-] Break up oversized route files and embedded HTML or view builders.
- [ ] Add fast automated coverage beneath the existing smoke suite.
- [ ] Reduce high-churn query and hydration overhead in internal report routes.
- [ ] Improve worker and job observability for replay and agent execution.

### Planned Workstreams

#### Phase A: CI Stabilization

Deliverables:

- [ ] Identify and fix the currently failing push workflow path before broader refactor work begins.
- [ ] Reduce smoke flake and improve failure output for push-triggered workflow runs.
- [ ] Keep `npm run check`, `npm run e2e:customer-handoff`, and `npm run e2e:hosted-feedback-review` aligned with the CI validation surface.

Exit criteria:

- [ ] Push workflows pass reliably on `main`.
- [ ] Failing workflow steps point clearly to the broken smoke or runtime path.

#### Phase B: Route And View Decomposition

Deliverables:

- [x] Split the largest learn page builders out of `src/routes/learn-pages.ts` into dedicated adjacent modules.
- [ ] Extract public customer-facing page builders from `src/routes/public/projects.ts` into smaller adjacent modules.
- [ ] Keep route registration focused on HTTP concerns rather than HTML construction and client-page state.

Exit criteria:

- [-] The largest route or page-builder files are being broken into smaller modules with clearer ownership boundaries.
- [ ] Existing onboarding, support, review, and public dashboard behavior remains unchanged.

#### Phase C: Fast Test Coverage

Deliverables:

- [ ] Add a lightweight unit or integration test layer beside the existing smoke scripts.
- [ ] Cover high-risk logic such as policy evaluation, impact scoring, duplicate detection, and public token validation.
- [ ] Preserve the existing smoke suite as end-to-end validation rather than replacing it.

Exit criteria:

- [ ] At least one fast non-smoke test layer exists in the repo.
- [ ] High-risk pure logic no longer depends solely on smoke coverage to catch regressions.

#### Phase D: Report Route Performance Cleanup

Deliverables:

- [ ] Reduce repeated per-report hydration work in `src/routes/internal/reports.ts`.
- [ ] Consolidate high-volume report lookups where recent-report loops trigger multiple repository reads per item.
- [ ] Preserve the current report context and active-issue contracts while lowering query pressure.

Exit criteria:

- [ ] Worst-path internal report routes perform fewer repository round-trips per request.
- [ ] Review queue and active-issue contexts remain functionally unchanged.

#### Phase E: Worker Observability

Deliverables:

- [ ] Replace ad hoc lifecycle logging in `src/worker.ts` with clearer structured job logs.
- [ ] Improve replay, agent-task, and GitHub-sync failure breadcrumbs for production debugging.
- [ ] Keep request and job correlation easier to trace across API and worker boundaries.

Exit criteria:

- [ ] Worker failures are easier to diagnose from logs without replaying the full scenario locally.
- [ ] Replay and agent-task lifecycle transitions emit consistent structured output.

### Secondary Cleanup

- [ ] Keep repository-abstraction cleanup as a later track. The repository layer is repetitive, but it should follow CI repair, route decomposition, test coverage, and internal report performance work.

### Success Criteria

- [ ] Push workflows are green together with the local validation surface.
- [ ] The current customer handoff and hosted-feedback review flows stay green throughout refactor work.
- [ ] The largest route and page-builder files are smaller and easier to evolve.
- [ ] The repo has fast automated coverage in addition to smoke tests.
- [ ] Internal report routes are less query-heavy in their worst paths.