# UI Simplification Spec

## Objective

Compress the current onboarding, feedback, and review experience into a smaller set of beginner-friendly surfaces without removing advanced operator capabilities.

The design goal is not a visual redesign first. The goal is to reduce cognitive load and remove unnecessary choices from the default path.

## Current Problem

The current UI exposes too many system concepts at once:

- workspace
- project
- repository connection
- GitHub installation id
- installation record id
- default behavior
- repo connection config JSON
- widget origin
- service identity id
- customer portal grant data
- triage policy JSON

This is too much for the first-run experience.

## Proposed Surface Model

### 1. Quick Start

Purpose:
Connect GitHub, prepare a project, and mint a widget session.

Primary questions answered:
- Is this project ready?
- What is still missing?
- How do I get a live widget URL?

Primary controls:
- Select or create workspace
- Select or create project
- Connect GitHub
- Confirm repository
- Mint widget

Hidden by default:
- installation record id
- repo connection id
- repo connection config JSON
- service identity controls
- portal grant controls
- triage policy JSON
- transfer installation flow

### 2. Widget Test

Purpose:
Let an operator or customer quickly try the real intake flow.

Primary questions answered:
- What does the reporter see?
- Does the widget submit correctly?
- Where does the report show up afterward?

Primary controls:
- Open widget URL
- Copy widget URL
- Copy embed script URL
- Open review queue for current project

### 3. Review Queue

Purpose:
Let operators understand reports and make decisions quickly.

Primary questions answered:
- What is this report?
- Does it deserve action?
- Where should it go?

Primary controls:
- Approve
- Reject
- Select repository target when needed
- Open report context

Secondary controls:
- Assign
- Bulk approve/reject
- Advanced filters

### 4. Advanced Settings

Purpose:
Contain the operator-only features that are useful but not part of the default path.

Includes:
- repo connection overrides
- installation transfer
- service identity lifecycle
- customer portal grants
- triage policy editor
- GitHub promotion diagnostics

## Quick Start Spec

### Layout

Replace the current multi-tool onboarding console with a smaller step-based page.

Sections:

#### Section A: Project
- Workspace selector or create form
- Project selector or create form
- Project readiness badge

#### Section B: GitHub
- Repository field
- Connect GitHub button
- Setup status summary
- Next required step

#### Section C: Launch
- Mint widget button
- Widget URL output
- Embed script URL output
- Open widget button
- Open review queue button

#### Section D: Advanced
- Collapsible panel
- Links to full onboarding console and advanced settings

### States

#### Ready
Project has:
- workspace
- project
- GitHub installation
- default repository

#### Missing GitHub
Project exists but GitHub setup is incomplete.

#### Missing Repository
GitHub is connected but no active default repository is scoped.

#### Ready To Launch
Widget session can be minted immediately.

## Review Queue Spec

### Main Table Columns

Keep only the columns needed for first-pass review:
- Title
- Severity
- Project
- Repository target
- Submitted at
- Status

Move behind expandable details:
- ownership candidate details
- policy metadata
- score internals
- assignment notes
- age metrics

### Decision Drawer

When a report is selected, show one drawer with:
- Summary
- Description
- Page URL
- Reporter
- Severity
- Artifact links
- Repository target
- Decision notes field
- Approve / Reject buttons

### Copy Changes

Replace system language with operator language:
- `promotable` -> `Ready for GitHub`
- `repository scope unresolved` -> `Choose where this report should go`
- `decision rationale missing` -> `Add a reason for your decision`
- `issueState awaiting-review` -> `Waiting for operator decision`

## Widget Spec

### Minimal Form

Required fields:
- Title
- Page URL
- Description
- Severity

Recommended but optional:
- Reporter email
- Environment
- Notes

Advanced optional section:
- artifact uploads
- labels
- console/network counts
- stakeholder count

### Submission Response

On success, show:
- report accepted message
- report id
- status dashboard link
- short note explaining review comes first

## Information Disclosure Rules

### Default Path Should Show
- project
- repository
- widget URL
- readiness status
- review decision actions

### Default Path Should Hide
- installation ids
- repo connection ids
- service identities
- triage policy JSON
- portal grant administration
- transfer workflows
- low-level promotion gate internals

### Advanced Path Should Show
Everything needed by operators who are debugging or customizing the system.

## Backend Support Needed

### Add Or Reuse A Single Readiness Endpoint

One endpoint should summarize:
- project exists
- GitHub app connected
- installation mapped
- default repo selected
- widget mintable
- review queue reachable

### Keep Existing Endpoints Behind The Simpler UI

Likely reused endpoints:
- setup status
- project operations
- widget session minting
- repo connection create/update
- review queue

## Delivery Order

### Phase 1
- New docs and quick-start narrative
- New simple onboarding surface

### Phase 2
- Review queue copy and layout simplification
- Advanced settings segregation

### Phase 3
- Optional richer widget capture restoration inside advanced disclosure

## Acceptance Criteria

1. A new operator can get from zero to widget URL without understanding installation ids or repo connection records.
2. A new reporter can submit feedback without seeing advanced capture controls.
3. A new operator can approve or reject a report without reading GitHub promotion internals.
4. Advanced capabilities remain available in a separate panel or page.
