# PRD Part 2: Simplified Onboarding And Operating Model
## 1. Purpose

This document defines how Nexus should feel for a new team adopting the product.
The system already contains the foundations for project-scoped GitHub routing, hosted feedback intake, review-gated GitHub writes, replay preparation, and internal operator tooling. The next step is to make the adoption path feel smaller and clearer.

## 2. Product Thesis
Nexus should not present three different products at once.

The default experience should be one flow:
1. Connect repo
2. Collect feedback
3. Review and promote work

Everything else should support that flow from behind an advanced or operator-only boundary.
## 3. Default Experience

### Step 1: Connect Repo
The operator creates or finds a project, runs GitHub setup, and confirms the default repository.

Default UI should answer only these questions:
- Which project am I working in?
- Is GitHub connected?
- Which repo will approved work target?

### Step 2: Collect Feedback
The operator mints a hosted widget session and uses it to test or share the reporting flow.

Default UI should answer only these questions:
- Can I open the widget?
- Can a user submit a report?
- Did that report arrive in Nexus?

### Step 3: Review And Promote
Default UI should answer only these questions:

- What needs my decision now?
- Do I have enough context?
- Is promotion blocked or unblocked?

## 4. Information Architecture
### `/learn`

Purpose:
- quick-start front door
- product story in plain language
- links into the exact next surface

### `/learn/onboarding`
Purpose:

- advanced setup and troubleshooting
- project, repo, install, widget, policy, and access operations

This page should still exist, but it should no longer carry the burden of explaining the whole product.
### `/learn/review-queue`

Purpose:

- operator review workflow
- approval and rejection decisions
- project-scoped queue triage

This page should lead with decisions, not diagnostics.
## 5. Default Versus Advanced

### Default Path

- project lookup
- GitHub setup status
- default repository confirmation
- widget handoff
- queue review
- approve or reject decision

### Advanced Path
- installation transfer
- repo connection editing beyond the common path
- triage policy JSON
- service identities
- durable customer portal grants
- replay and promotion diagnostics
- MCP, shadow, and agent-task internals

## 6. Functional Expectations
### Setup Expectations

- The system should reuse project-scoped GitHub installation state when available.
- The product should clearly show whether promotion is ready or blocked.
- PAT-backed flows remain available for development validation only.

### Feedback Expectations
- Hosted widget submission remains the default intake surface.
- The form should be easy to test locally and in a live environment.
- Widget access should remain scoped and auditable.

### Review Expectations
- Queue language should describe reports, evidence, and decisions plainly.
- Approval should require a repository target, evidence, and rationale.
- Rejection should require rationale.

## 7. Success Criteria
- A first-time operator can understand the product from `/learn` without reading the full PRD.
- A first-time operator can reach a working widget session from the setup flow without learning advanced terminology.
- A reviewer can tell what action is blocked or available from the review queue at a glance.

## 8. Delivery Priority
1. Simplify the docs.
2. Simplify the learn landing page.
3. Simplify review queue language and emphasis.
4. Leave advanced controls in place, but stop making them the default story.