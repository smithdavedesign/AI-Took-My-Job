# Agent Task Flow

## What Exists Today

Nexus now supports a Phase 6 pre-step: an operator can submit an internal agent task against an existing Nexus report, and the worker prepares a structured context bundle for a future coding agent runtime.

Current flow:

1. A user or system submits a report through the browser extension, Slack, or observability ingestion.
2. Nexus stores the report, optional artifacts, replay output, and draft issue state.
3. An internal operator or automation submits an agent task tied to that `reportId`.
4. Nexus queues an `agent-task` job and prepares a context package containing:
   - report summary
   - GitHub draft linkage if available
   - replay status and matched failing steps if available
   - persisted artifact metadata
   - operator objective, execution mode, and acceptance criteria
5. The task becomes `ready` for a future execution runtime.

## Current API Shape

### Submit an agent task

`POST /internal/agent-tasks`

Request body:

```json
{
  "reportId": "<uuid>",
  "targetRepository": "owner/repo",
  "title": "Fix checkout replay failure",
  "objective": "Investigate the replay evidence and propose a code fix for the failing checkout path.",
  "executionMode": "fix",
  "acceptanceCriteria": [
    "Replay failing step still reproduces before the fix.",
    "Proposed fix is scoped to the checkout path.",
    "Result includes linked evidence and reasoning."
  ],
  "contextNotes": "Prefer the staged checkout implementation first."
}
```

Response body:

```json
{
  "accepted": true,
  "agentTaskId": "<uuid>",
  "processingJobId": "<uuid>",
  "status": "queued"
}
```

### Inspect an agent task

`GET /internal/agent-tasks/:taskId`

### List agent tasks for a report

`GET /internal/reports/:reportId/agent-tasks`

## What This Does Not Do Yet

This is not a full autonomous coding runtime yet.

Not implemented yet:

- code checkout and branch management
- actual agent execution against a repository
- fix proposal or PR generation
- pass-after verification against a patched build
- approval workflow for agent-produced changes

## Why This Shape

The current implementation intentionally binds agent work to a persisted Nexus report first. That gives the future runtime a stable evidence package instead of a raw GitHub issue string with missing reproduction context.

Future expansion can add direct GitHub-issue-only task submission, but the report-linked path is the safer foundation.