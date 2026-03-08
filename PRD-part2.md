# PRD Part 2: Customer Onboarding And Repository Connection

## 1. Purpose

This document extends the existing internal-first Nexus product into a customer-connectable platform.

The current system already handles report ingestion, artifact capture, replay preparation, GitHub issue drafting, review-gated PR promotion, MCP developer context, and self-hosted packaging. The next phase is to make that system easy for an external team to adopt without weakening the current safety model.

The core shift is simple:

- users submit feedback into Nexus first
- Nexus owns evidence, routing, triage, and review
- GitHub remains a downstream system connected through a GitHub App

This phase should not turn Nexus into a generic public issue tracker. It should turn Nexus into a scalable engineering-intelligence clearinghouse that can safely accept user feedback and route it into the existing verified-fix pipeline.

## 2. Product Thesis

The best scalable model is not "give every user direct GitHub access" and not "ask every customer for a PAT." The best scalable model is:

1. a workspace connects one or more repositories through a GitHub App
2. a project inside that workspace owns a feedback intake surface
3. users submit feedback to Nexus through a hosted widget first
4. Nexus enriches, deduplicates, and routes the report before any GitHub write occurs
5. internal operators or automation decide when a report becomes a GitHub issue, agent task, or PR candidate

This keeps the current human-review model intact while making onboarding materially easier.

## 3. Goals

- Let a new customer connect a GitHub repository without generating or pasting a PAT.
- Let a user submit actionable feedback in under 60 seconds.
- Keep GitHub issue and PR generation review-gated.
- Reuse the current Nexus ingestion, redaction, replay, and agent-task foundations instead of creating a parallel product.
- Preserve self-hostability and explicit security boundaries.

## 4. Non-Goals

- Do not ship autonomous merges for customer-originated reports in this phase.
- Do not expose internal Nexus routes directly to end users.
- Do not build a full customer dashboard before intake, routing, and review are stable.
- Do not make the browser extension the only feedback surface in the first slice.
- Do not require hard multi-tenant infrastructure isolation in the first slice unless a target customer explicitly requires it.

## 5. Primary Users

### 5.1 Workspace Admin

- Connects GitHub through a GitHub App install
- Chooses which repositories Nexus can target
- Configures project-level feedback routing

### 5.2 Project Operator

- Reviews newly submitted reports
- Confirms repository routing when confidence is weak
- Approves GitHub issue creation and downstream agent workflows

### 5.3 End Reporter

- Encounters a bug or product problem
- Submits a lightweight report through a hosted widget
- Optionally includes screenshot, notes, and browser context

### 5.4 Developer

- Continues to consume Nexus through internal APIs, MCP tools, and review-gated PR workflows

## 6. Product Model

The product should evolve from a globally configured Nexus instance into a project-scoped routing model.

### 6.1 Workspace

The billing and administration boundary.

Examples:

- Acme Corp
- Internal Platform Team

### 6.2 Project

The logical product boundary that owns a feedback intake surface and one or more repository connections.

Examples:

- Checkout Web
- Mobile App
- Admin Portal

### 6.3 Repository Connection

The bridge between a project and a GitHub App installation plus a target repository.

It should store at least:

- workspace or project association
- repository owner and name
- default branch
- connection status
- allowed actions
- GitHub App installation metadata

## 7. User Experience

### 7.1 Admin Onboarding

The admin flow should be:

1. Create workspace
2. Create project
3. Click "Connect GitHub"
4. Install the Nexus GitHub App on one or more repositories
5. Select the target repository for the project
6. Receive a project-scoped hosted widget snippet or publishable identifier

The system should not require the admin to paste a PAT.

### 7.2 End-User Feedback Flow

The first public submission surface should be a hosted widget, not the browser extension.

Tier 1 capture should include:

- current page URL
- user note
- severity or impact selection
- screenshot
- browser and navigator metadata

Tier 2 capture can add:

- last N console logs
- performance timings
- optional environment hints

Tier 3 capture can later expand through a browser extension using the existing extension ingestion contract for:

- HAR
- localStorage and sessionStorage snapshots
- screen recording
- replay-oriented evidence

### 7.3 Operator Review Flow

The first slice does not need a large dashboard, but it does need an operator-facing review queue.

Operators must be able to:

- inspect incoming reports by project
- confirm or adjust repository routing
- approve GitHub issue creation
- trigger downstream agent tasks when appropriate

## 8. Functional Requirements

### 8.1 Project-Scoped Routing

- Every submitted report must belong to a project.
- Every project must route to zero or more repository connections.
- If routing confidence is weak, the report must land in review rather than write to GitHub automatically.

### 8.2 GitHub App Connection

- GitHub integration must resolve credentials at runtime per project and repository.
- The system must support multiple installations and multiple repositories across customers.
- The system must preserve PAT-backed development and smoke paths for local validation only.

### 8.3 Hosted Feedback Widget

- Provide a hosted widget or embeddable script for project-scoped feedback submission.
- The widget must be faster to adopt than a browser extension.
- The widget must use a project-scoped publishable identifier or similarly constrained embed token.
- The server must apply rate limiting and server-side validation.

### 8.4 Report Processing

Customer-originated reports must flow through the same core pipeline that already exists:

- validation
- redaction
- persistence
- artifact handling
- embedding generation
- triage queueing
- replay preparation when richer artifacts exist

### 8.5 Review-Gated GitHub Writes

- Customer-originated feedback must not create GitHub issues or PRs without an explicit review gate.
- Agent task creation, PR promotion, and merge flows remain behind human approval in v1.

## 9. Architecture Direction

### 9.1 Current Limitation

Today, GitHub auth is effectively global and startup-bound. That is acceptable for a single internal target repository, but it does not scale to customer onboarding.

### 9.2 Required Shift

GitHub auth must become runtime-scoped:

1. report arrives with project context
2. project resolves to a repository connection
3. repository connection resolves to a GitHub App installation
4. Nexus creates a request-scoped client for that installation
5. GitHub writes occur only after routing and review checks pass

### 9.3 Recommended Persistence Direction

The system should add first-class entities for:

- workspaces
- projects
- GitHub installations
- repository connections

Existing report, artifact, issue-link, and agent-task data should become project-scoped.

## 10. Security And Safety

- Redaction remains mandatory before persistence and before any LLM or GitHub boundary.
- Public submission routes must be rate-limited and audited.
- Project scoping must be enforced on all report reads, artifact access, and GitHub writes.
- GitHub App permissions should stay as narrow as possible.
- Review gates remain mandatory for issue creation, PR promotion, and merge.

## 11. Implementation Slices

### Slice 1: Foundations

- Add workspace, project, GitHub installation, and repository-connection persistence
- Make existing report and GitHub data project-aware
- Refactor GitHub auth to runtime project-scoped resolution

### Slice 2: Onboarding

- Add GitHub App install and repository selection flow
- Add project-scoped configuration needed to power public intake

### Slice 3: Hosted Feedback

- Add public project-scoped report submission route
- Add hosted widget for screenshot-plus-note submission
- Add minimal acknowledgement/status response

### Slice 4: Review And Routing

- Add a lightweight operator review queue
- Add explicit repository confirmation when routing confidence is weak

### Slice 5: Rich Capture Expansion

- Reuse the extension ingestion contract for richer browser-state capture once the lighter intake path is stable

## 12. Success Metrics

- New repository connection completed without a PAT in under 5 minutes
- User feedback submitted through the widget in under 60 seconds
- Project-to-repository routing accuracy high enough that most reports avoid manual rerouting
- Zero known cross-project write leakage
- Existing internal Nexus flows continue to validate after the project-scoping refactor

## 13. Open Questions

1. Should the first customer-facing slice support one repository per project only, or multiple repositories from the start?
2. Should the first public surface be a hosted widget only, or a simple hosted form plus widget embed?
3. What minimum operator review UI is sufficient before a broader dashboard becomes necessary?
4. What additional signals should participate in routing confidence beyond explicit project mapping and repository defaults?