# AI-DevOps Nexus

AI-DevOps Nexus is a self-hostable feedback-to-engineering control plane.

The product should feel simple from the outside:

- Connect a repo
- Collect feedback
- Review and promote work

Everything else exists to support those three jobs, not compete with them.

## Product Story

Nexus sits between a live product and the engineering systems that need clean, actionable context.

Customers or internal testers submit feedback through a hosted widget. Nexus stores the report, attaches evidence, runs routing and triage, and holds the result in a review queue. GitHub remains downstream and review-gated.

That means teams do not need to give every reporter GitHub access, teach every operator a complex setup model, or translate loose customer notes into engineering-ready work by hand.

## Default Path

The default operator path is intentionally small.

### 1. Connect Repo

- Create or load a workspace and project.
- Connect GitHub through the GitHub App.
- Confirm the default repository target.

### 2. Collect Feedback

- Mint a hosted widget session.
- Let a customer or tester submit a report.
- Keep the evidence, routing, and intake inside Nexus.

### 3. Review And Promote

- Review the queued report with its evidence.
- Approve or reject the downstream action.
- Promote only reviewed work into GitHub.

## What Exists Today

- Fastify gateway and worker runtime.
- PostgreSQL persistence for workspaces, projects, reports, review state, and GitHub linkage.
- Redis-backed queueing for triage, replay, and agent execution work.
- Project-scoped GitHub App resolution and repository connections.
- Hosted feedback widget, embed bootstrap, dashboard, and customer portal surfaces.
- Review-gated issue and PR promotion flows.
- Replay and agent-execution foundations for richer internal workflows.
- MCP developer context and self-hostable packaging.

## Runtime Surfaces

- `/learn`: simplified front door for the product story and quick-start flow.
- `/learn/onboarding`: advanced setup console for workspace, project, repo, widget, and access configuration.
- `/learn/review-queue`: operator review surface for approvals and routing decisions.
- `/learn/support-ops`: readiness and support-oriented follow-up surface.
- `/learn/prd`: product reference.

## Local Development

Requirements:

- Node.js 22+
- PostgreSQL
- Redis

Useful commands:

```bash
npm install
npm run dev
npm run worker
npm run build
npm run check
```

Selected validation flows:

```bash
npm run e2e:config-guardrails
npm run e2e:widget-browser-submit
npm run e2e:review-dashboard-promotion
npm run e2e:promotion-ownership
```

## Design Direction

The current repository still contains advanced capabilities that matter for operators and internal engineering teams:

- service identities
- customer portal grants
- replay evidence and shadow execution
- MCP developer context
- agent execution and PR promotion diagnostics

Those capabilities remain in the product, but they should live behind explicit operator or advanced setup affordances. The default experience should stay centered on the three core jobs.

## Reference Docs

- `PRD.md`: simplified top-level product requirements.
- `PRD-part2.md`: customer onboarding and operating model for the simplified path.
- `roadmap.md`: phase history plus current simplification direction.
- `docs/simplified-vnext/`: working simplification specs and gap analysis.
