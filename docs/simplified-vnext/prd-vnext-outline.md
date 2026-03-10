# Simplified vNext PRD Outline

## Purpose

Nexus should be easy to explain, easy to set up, and easy to try on a real product.

The current system is powerful, but the product story is overloaded. New users are asked to understand internal engineering intelligence, GitHub setup, project routing, hosted feedback, review queue semantics, and promotion mechanics all at once.

This vNext outline compresses the story into one beginner-friendly product:

**Connect a repo, collect feedback from a live product, review what matters, and promote approved work into GitHub.**

Everything else remains valuable, but secondary.

## Product Thesis

Nexus is a self-hosted feedback-to-action control plane for software teams.

It gives a team one safe path from customer or operator feedback to reviewed GitHub work:

1. Connect a repository with GitHub App auth.
2. Launch a hosted widget on a real product.
3. Capture feedback with enough context to act on it.
4. Review incoming reports in one queue.
5. Promote approved work into GitHub only after human review.

## Core User Stories

### 1. Admin Setup

As a workspace admin, I want to connect one GitHub repository to one project quickly so that my team can start collecting live feedback without learning the entire system.

Success criteria:
- I can create a project.
- I can connect GitHub App auth.
- I can see one clear readiness state.
- I can mint a working widget link.

### 2. Reporter Feedback

As a reporter, I want to open a simple feedback widget on a live product and submit a useful report in under a minute.

Success criteria:
- The widget opens reliably.
- The form is short and understandable.
- Submission confirms where the report went.
- Optional artifacts do not block the basic flow.

### 3. Operator Review

As an operator, I want to review new reports, decide what deserves action, and route approved work into GitHub safely.

Success criteria:
- I can understand what the report is.
- I can approve or reject quickly.
- I can see the repository target.
- GitHub writes stay review-gated.

## Non-Goals For The Beginner Path

The following remain supported but should not be part of the default story:

- Multi-repository project routing
- Manual installation transfer workflows
- Service identity lifecycle management
- Customer portal grant administration
- Raw triage-policy JSON editing
- MCP and IDE context surfaces
- Shadow suite and replay authoring details
- Agent-task closeout internals

## Default Product Model

The default user-facing model should be taught as:

- **Workspace**: a team space
- **Project**: one product or app
- **Repository**: where approved work lands
- **Widget**: where feedback comes from
- **Review Queue**: where humans decide what happens next

This is enough to get a new team to value.

Advanced model details such as repository connections, installation records, durable customer grants, and service identities should remain available to operators but hidden behind advanced controls.

## Golden Path

### Step 1: Create Project

Operator creates a workspace and project, or selects an existing one.

### Step 2: Connect GitHub

Operator completes GitHub App setup through a single readiness-driven flow.

### Step 3: Launch Widget

Operator mints a widget link and installs it on a live product or opens it directly.

### Step 4: Submit Feedback

Reporter submits feedback with a minimal form.

### Step 5: Review And Promote

Operator reviews the report, approves or rejects it, and sends approved work into GitHub.

## Product Principles

### Principle 1: One Blessed Setup Path

The default path should use GitHub App auth only.

PAT-based setup may remain for edge cases, but it should not be the first-class onboarding story.

### Principle 2: One Primary Intake Surface

The hosted widget is the default intake surface.

Browser extension capture, embed-script variations, and richer artifact modes are follow-on capabilities.

### Principle 3: Human Review Before GitHub Write

No customer-submitted report should write into GitHub without explicit internal approval.

### Principle 4: Readiness Over Configuration

Users should see whether a project is ready, not be forced to understand every configuration object.

### Principle 5: Progressive Disclosure

Advanced setup, routing, policy, and automation capabilities should be revealed only when needed.

## Simplified Functional Requirements

### Setup

- Project creation must be available from one surface.
- GitHub setup must expose a single readiness result.
- Widget minting must be available from the same setup surface.
- The setup UI must explain what is missing in plain language.

### Feedback Intake

- Widget form must support a minimal required path.
- Title, page URL, description, severity, and reporter identity should be sufficient for a valid first report.
- Optional fields and uploads must not block the basic flow.
- Submission must return a confirmation and status link.

### Review

- Review queue must show pending reports for a project.
- Each item must expose enough context to approve or reject.
- Repository target must be visible at review time.
- Approval and rejection must require rationale.

### Promotion

- Approved work must remain project-scoped.
- Promotion must use the connected GitHub App installation.
- Operators must be able to see whether promotion is available.
- Merge and post-promotion details should be downstream from the first review decision.

## Suggested Information Architecture

### Beginner Surfaces

- Quick Start
- Widget
- Review Queue

### Advanced Surfaces

- Full Onboarding Console
- Triage Policy Editor
- Service Identities
- Customer Portal Grants
- Repo Connection Overrides
- Promotion Diagnostics

## Success Metrics

### Setup

- First project connected to GitHub in under 10 minutes
- Widget link minted without operator confusion

### Feedback

- First report submitted in under 60 seconds
- No required field confusion on the basic widget path

### Review

- Operator can understand and disposition a report in under 2 minutes
- Approved reports can be promoted without needing hidden setup knowledge

## vNext Deliverables

### Deliverable 1

Rewrite the docs and onboarding story around the golden path.

### Deliverable 2

Introduce a simple quick-start setup surface that hides advanced configuration.

### Deliverable 3

Refocus the review queue on approve, reject, and route decisions.

### Deliverable 4

Keep advanced functionality available, but clearly separate it from the beginner path.
