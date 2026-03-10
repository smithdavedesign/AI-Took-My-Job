# Default Versus Advanced Gap Analysis

## Goal

Identify which current concepts belong in the default product path and which should move behind advanced/operator-only surfaces.

This document is intentionally product-facing. It focuses on user comprehension, not backend purity.

## Default Path

The default path should support one successful trial of Nexus.

That means a user can:
- connect GitHub
- mint a widget
- submit feedback
- review the report
- promote approved work into GitHub

If a concept does not help that first successful trial, it should not be shown by default.

## Surface Review

### Workspace

Default: yes

Reason:
A user needs a place to anchor a project.

Simplification:
Treat workspace as a team container. Do not explain repository relationships or installation ownership in the beginner path.

### Project

Default: yes

Reason:
Project is the core operational unit for the beginner path.

Simplification:
Teach it as `the app or product you are collecting feedback for`.

### Repository

Default: yes

Reason:
A user must understand where approved work lands.

Simplification:
Teach it as one repository in the beginner path.

Advanced note:
Multiple repo connections remain supported but should not be foregrounded.

### GitHub App Setup

Default: yes

Reason:
This is the only setup path that should matter in vNext.

Simplification:
Show readiness and next step only.

Advanced note:
Installation ids, installation records, transfer flows, and auth-mode distinctions are advanced.

### Widget Session

Default: yes

Reason:
The widget is the primary proof of value.

Simplification:
Show widget URL, embed script URL, expiration, and a single sentence describing the difference.

### Review Queue

Default: yes

Reason:
It is the main operator value surface.

Simplification:
Teach it as the place where a human approves or rejects incoming work.

### Repository Connections

Default: partially

Reason:
The existence of a target repository matters. The low-level repository connection model does not.

Default surface should show:
- selected repository
- whether a default exists

Advanced surface should show:
- connection ids
- multiple connections
- status toggles
- config JSON
- reassignment behavior

### Triage Policy

Default: no

Reason:
The beginner path does not require understanding ownership rules or scoring rules.

Keep as advanced because:
- it is currently configured as raw JSON
- it affects routing hints but is not required to get value from first-run feedback

### Ownership Candidates

Default: no

Reason:
Users do not need to understand ownership heuristics to submit or review a basic report.

Default surface should show:
- suggested owner label if available

Advanced surface should show:
- candidate list
- scores
- reasons
- policy source
- repository owner fallback

### Service Identities

Default: no

Reason:
This is operational infrastructure, not beginner setup.

### Customer Portal Grants

Default: no

Reason:
Durable customer visibility is useful, but it is not necessary for the first successful run of the product.

Default path should focus on session-scoped widget and dashboard usage.

### Agent Task Details

Default: no

Reason:
Agent execution contracts, closeout gates, and merge details are downstream acceleration layers.

Default path should frame this simply as `approved work can be promoted into GitHub safely`.

### MCP And Developer Context

Default: no

Reason:
This is a separate audience and a later-stage value layer.

### Shadow Suite / Replay Internals

Default: no

Reason:
They strengthen trust, but they add too much conceptual weight to the first-run narrative.

## Recommended Product Partition

### Beginner
- Create or select project
- Connect GitHub
- Mint widget
- Submit feedback
- Review queue
- Promote approved work

### Operator
- Advanced onboarding console
- Repo connection management
- Customer portal grant lifecycle
- Service identity lifecycle
- Triage policy configuration
- Setup diagnostics

### Power User / Engineering
- Replay and shadow suite
- MCP surfaces
- Agent execution diagnostics
- Deep GitHub promotion state

## Main Gaps Between Current Product And Desired vNext

### Gap 1: The onboarding surface is an operator toolbox, not a quick-start flow.

Current:
The onboarding page exposes almost every setup and admin capability.

Desired:
The default onboarding path should expose only the next required action.

### Gap 2: The review queue exposes system state instead of decision support.

Current:
Queue semantics include guardrails, ownership hints, routing state, and promotion context.

Desired:
The main queue should optimize for a fast decision and show internals only when expanded.

### Gap 3: The widget is conceptually simple, but the surrounding explanation is not.

Current:
Users must understand signed widget sessions, embed scripts, durable portal access, and origin behavior.

Desired:
Users should first see `here is your widget link` and `here is where the report appears after submission`.

### Gap 4: Product language is too close to implementation language.

Current examples:
- installation record id
- repo connection id
- promotable
- closeout
- project-scoped routing

Desired examples:
- connected GitHub app
- selected repository
- ready for GitHub
- waiting for review
- project target

## Suggested Rules For vNext

1. If the concept is only needed to debug setup, it belongs in Advanced.
2. If the concept is only needed by internal operators, it belongs in Advanced.
3. If the concept is not needed to get a widget live and collect one report, it should not block the default path.
4. If the concept is not needed to approve or reject one report, it should not be shown at first glance in the review queue.
5. If the concept belongs to a later value layer such as replay, MCP, or automation internals, it should be described after the core product story, not before it.

## Immediate Product Recommendation

For the next simplification pass, keep the backend behavior mostly intact and make these changes first:

1. Introduce a `Quick Start` surface.
2. Relegate the current onboarding console to `Advanced Setup`.
3. Simplify widget documentation to one live link + one expected outcome.
4. Reduce review queue language to decision-making terms.
5. Rewrite the docs so beginner, operator, and power-user stories are clearly separated.
