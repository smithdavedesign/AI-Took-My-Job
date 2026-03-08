# Agent Task Flow

## What Exists Today

Nexus now supports a Phase 6 execution scaffold: an operator can submit an internal agent task against an existing Nexus report, let the worker prepare the task context, and then start an execution attempt that provisions an isolated git branch and worktree for downstream agent work.

Current flow:

1. A user or system submits a report through the browser extension, Slack, or observability ingestion.
2. Nexus stores the report, optional artifacts, replay output, and draft issue state.
3. An internal operator or automation submits an agent task tied to that `reportId`.
4. Nexus queues an `agent-task` job and prepares a context package containing:
   - report summary
   - GitHub draft linkage if available
   - replay status and matched failing steps if available
  - similar stored reports when semantic or heuristic matches exist
  - ownership candidates inferred from report and repository context
  - historical issue and PR links from the current report and related reports
  - refined impact assessment using recurrence, breadth, and prior remediation history
   - persisted artifact metadata
   - operator objective, execution mode, and acceptance criteria
5. The task becomes `ready`.
6. An internal operator or automation starts an execution attempt for that task.
7. Nexus queues an `agent-execution` job, prepares an isolated branch and worktree, and stores execution findings plus validation evidence.
8. If `AGENT_EXECUTION_COMMAND` is configured, Nexus invokes that command inside the prepared worktree with `.nexus/task.md`, `.nexus/context.json`, and `.nexus/output.json` as the contract surface.
9. If the agent modifies files, Nexus persists a git diff artifact, can run the agent-provided validation command, can optionally rerun the stored HAR against a target base URL, and stops at a reviewable execution state before any PR is opened.
10. After approval, an operator can explicitly promote the execution into a PR record.
11. Merge attempts are separately gated and persisted as part of the execution audit trail.

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

### Execute an agent task

`POST /internal/agent-tasks/:taskId/execute`

Response body:

```json
{
  "accepted": true,
  "executionId": "<uuid>",
  "processingJobId": "<uuid>",
  "status": "queued"
}
```

### Inspect execution attempts for a task

`GET /internal/agent-tasks/:taskId/executions`

### Inspect a single execution attempt

`GET /internal/agent-task-executions/:executionId`

### List artifacts for an execution attempt

`GET /internal/agent-task-executions/:executionId/artifacts`

### Inspect the replay comparison for an execution attempt

`GET /internal/agent-task-executions/:executionId/replay-validation`

### Inspect the persisted validation policy result for an execution attempt

`GET /internal/agent-task-executions/:executionId/validation-policy`

### Inspect or submit human review for an execution attempt

- `GET /internal/agent-task-executions/:executionId/review`
- `POST /internal/agent-task-executions/:executionId/review`

### Promote an approved execution into a draft PR

`POST /internal/agent-task-executions/:executionId/promote`

This route requires:

- a completed execution with repository changes
- an approved human review
- a non-failed validation result
- a GitHub-backed target repository with a usable base branch

Optional request body:

```json
{
  "draft": false
}
```

### Inspect persisted PR metadata for an execution attempt

`GET /internal/agent-task-executions/:executionId/pull-request`

### Attempt a merge for an approved execution PR

`POST /internal/agent-task-executions/:executionId/merge`

Optional request body:

```json
{
  "mergeMethod": "merge"
}
```

This route requires:

- an execution already promoted to `pr-opened`
- a current approved review state
- persisted PR metadata with a PR number
- GitHub credentials that can actually merge PRs in the target repository

Execution statuses now distinguish between:

- `completed`: no code changes were produced, but the workspace and execution bundle were prepared
- `changes-generated`: the agent produced code changes, but no passing validation or PR exists yet
- `validated`: code changes were produced and validation passed, but PR creation is still blocked pending human approval and explicit promotion
- `pr-opened`: a draft pull request was opened for the execution branch
- `completed`: used both for no-change executions and for PR-backed executions that have been merged or otherwise fully closed out

The `.nexus/output.json` contract can now include:

```json
{
  "summary": "Prepared a candidate fix.",
  "findings": ["Updated the checkout handler."],
  "validationCommand": "npm test -- checkout",
  "replayValidation": {
    "enabled": true,
    "baseUrl": "http://127.0.0.1:3001",
    "expectation": "not-reproduced"
  },
  "pullRequest": {
    "title": "Fix checkout failure",
    "body": "Draft PR body",
    "draft": true
  }
}
```

For repeatable local verification of the execution inspection routes, the repository includes:

- `src/scripts/e2e/agent-execution-fixture.ts`: a minimal downstream agent fixture that writes a proof file and requests replay-backed validation
- `src/scripts/e2e/agent-execution-routes.ts`: an end-to-end verifier for `GET /internal/agent-task-executions/:executionId/artifacts` and `GET /internal/agent-task-executions/:executionId/replay-validation`

Run the worker with the fixture command and then execute:

```bash
npm run e2e:agent-routes
```

### List agent tasks for a report

`GET /internal/reports/:reportId/agent-tasks`

### Inspect the persisted embedding for a report

`GET /internal/reports/:reportId/embedding`

### Inspect inferred ownership candidates for a report

`GET /internal/reports/:reportId/ownership`

### Inspect similar stored reports for a report

`GET /internal/reports/:reportId/similar`

### Inspect related issue and PR history for a report

`GET /internal/reports/:reportId/history`

### Inspect refined impact for a report

`GET /internal/reports/:reportId/impact`

## What This Does Not Do Yet

This is not a full autonomous coding runtime yet.

Not implemented yet:

- code modification by a downstream coding agent
- repeated fail-before and pass-after replay verification against a patched build
- merge-time policy beyond the current approval-before-promotion gate

Current execution scaffolding notes:

- repository checkout and branch management are now implemented for execution attempts
- each execution stores branch name, base branch, worktree path, findings, validation evidence, and persisted execution artifacts
- replay comparisons are also persisted as a first-class execution record with baseline replay status, post-change replay status, expectation, and target origin
- replay-backed validation now also persists a first-class fail-before/pass-after policy record that captures whether baseline reproduction and post-change expectations were both satisfied
- the downstream agent contract is file-based and command-driven: `.nexus/task.md`, `.nexus/context.json`, `.nexus/output.json`
- the repository now includes a reusable downstream writing command at `src/scripts/agents/creative-readme-agent.ts` for README-focused tasks
- persisted execution artifacts include agent context, agent output, git diff, validation logs, and replay-validation summaries when present
- executions with changes now carry a pending review record that can be approved or rejected over internal routes
- promoted executions now also persist a first-class PR record with repository, branches, PR number, PR URL, promotion actor, and merge outcome metadata
- merge attempts are approval-gated and persist either merged or merge-failed status in that PR record
- ownership hints are now attached to prepared agent-task context using explicit owner metadata, repository owner, and nearest-neighbor reports
- similar reports are now attached to prepared agent-task context using embedding distance plus deterministic heuristics like title overlap, source match, severity match, and external-id match
- historical issue and PR links are now attached to prepared agent-task context using the current report plus semantically related reports
- refined impact is now attached to prepared agent-task context using recurrence, breadth, owner spread, and related issue/PR history
- replay validation can rerun the stored HAR against a target base URL and compare the result to an expected replay outcome such as `not-reproduced`
- draft PR creation is now wired for GitHub repositories, but only after review approval and an explicit promote call
- feedback-report embeddings are now persisted at ingestion time so Phase 5 clustering can operate on live vectors
- GitHub-hosted repository checkout currently requires PAT-backed GitHub auth

## Why This Shape

The current implementation intentionally binds agent work to a persisted Nexus report first. That gives the future runtime a stable evidence package instead of a raw GitHub issue string with missing reproduction context.

Future expansion can add direct GitHub-issue-only task submission, but the report-linked path is the safer foundation.