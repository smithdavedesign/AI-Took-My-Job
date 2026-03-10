# PRD: AI-DevOps Nexus

## 1. Product Summary

AI-DevOps Nexus is a self-hostable control plane that turns live product feedback into reviewed engineering work.

The simplified product promise is:

1. Connect a repo
2. Collect feedback
3. Review and promote work

The system may contain richer infrastructure behind the scenes, but the default user experience should stay anchored to those three jobs.

## 2. Problem

Teams lose time at the handoff between product feedback and engineering action.

- Setup is often too technical for a first-time operator.
- Feedback arrives without enough context to act quickly.
- Review queues become diagnostics consoles instead of decision tools.
- GitHub workflows are either too open or too disconnected from the feedback source.

Nexus should reduce that friction without weakening the current review and safety model.

## 3. Product Goal

Make it possible for an operator to go from no setup to a reviewed, promotable feedback item with minimal training.

Success means:

- repo connection feels straightforward
- the widget is easy to test and hand off
- the review queue makes the next decision obvious

## 4. Primary Users

### Workspace Admin

- Connects GitHub through the GitHub App
- Defines the project boundary
- Confirms repository scope

### Project Operator

- Launches the feedback widget
- Reviews incoming reports
- Approves or rejects downstream GitHub action

### Reporter

- Submits a lightweight bug or product issue
- Expects the report to be quick and guided

### Developer

- Consumes approved context through Nexus, GitHub, or MCP-backed tooling

## 5. Core Jobs

### Job 1: Connect Repo

The operator should be able to:

- create or load a project
- connect GitHub through the GitHub App
- confirm the repository Nexus can target

The default path should not require understanding installation transfer mechanics, service identities, or detailed repository policy knobs.

### Job 2: Collect Feedback

The operator should be able to:

- mint a widget session
- share a direct hosted feedback link
- verify that a submitted report appears in Nexus

The default path should prioritize a hosted widget over heavier extension-based capture.

### Job 3: Review And Promote

The operator should be able to:

- open queued reports
- inspect enough evidence to decide
- approve or reject downstream GitHub action

The queue should behave like an approval workflow, not a general-purpose operations console.

## 6. Product Principles

- Default to one obvious next step.
- Keep advanced setup behind explicit affordances.
- Preserve project-scoped boundaries on every report and GitHub action.
- Keep GitHub writes review-gated.
- Prefer direct language over internal system terminology.

## 7. Functional Requirements

### 7.1 Setup

- A project can be looked up by key.
- GitHub App installation state can be reconciled to the project.
- A default repository can be identified clearly.

### 7.2 Feedback Intake

- A project-scoped widget session can be minted quickly.
- Hosted feedback submission captures the core fields needed for triage.
- The product can confirm that the report landed in the queue.

### 7.3 Review

- Operators can filter queued reports by project and assignment.
- Operators can load report context before acting.
- Approve and reject actions require explicit rationale.

### 7.4 Promotion

- GitHub issue and PR creation remain gated behind review.
- Repository targeting stays explicit.
- Promotion should fail clearly when setup is incomplete.

## 8. Advanced Capabilities

These remain part of the platform but should not dominate the default experience:

- replay evidence and validation policy
- agent task execution and promotion diagnostics
- service identity lifecycle management
- customer portal grants and durable access
- MCP developer context
- shadow and replay-oriented regression workflows

## 9. UX Direction

### Learn Front Door

`/learn` should present the product as three jobs:

- connect repo
- collect feedback
- review and promote

### Onboarding

`/learn/onboarding` should be positioned as the advanced setup surface, not the first explanation of the product.

### Review Queue

`/learn/review-queue` should emphasize:

- what needs review now
- what evidence is loaded
- what decision is blocked or unblocked

## 10. Success Metrics

- First repo connection completed without a PAT in under 5 minutes.
- A test feedback report can be submitted in under 60 seconds.
- Operators can identify the next approval decision without training on internal system concepts.
- Review-gated promotion continues to prevent accidental GitHub writes.

## 11. Near-Term Delivery

1. Rewrite top-level product docs around the simplified story.
2. Turn `/learn` into a quick-start front door.
3. Simplify review queue language and affordances.
4. Preserve advanced flows behind deeper operator surfaces instead of removing them.
