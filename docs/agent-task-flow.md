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
   - persisted artifact metadata
   - operator objective, execution mode, and acceptance criteria
5. The task becomes `ready`.
6. An internal operator or automation starts an execution attempt for that task.
7. Nexus queues an `agent-execution` job, prepares an isolated branch and worktree, and stores execution findings plus validation evidence.
8. If `AGENT_EXECUTION_COMMAND` is configured, Nexus invokes that command inside the prepared worktree with `.nexus/task.md`, `.nexus/context.json`, and `.nexus/output.json` as the contract surface.
9. If the agent modifies files, Nexus persists a git diff artifact, can run the agent-provided validation command, can optionally rerun the stored HAR against a target base URL, and can optionally open a draft PR when `AGENT_EXECUTION_AUTO_CREATE_PR=true` and the target repository has a usable base branch.

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

Execution statuses now distinguish between:

- `completed`: no code changes were produced, but the workspace and execution bundle were prepared
- `changes-generated`: the agent produced code changes, but no passing validation or PR exists yet
- `validated`: code changes were produced and the agent-provided validation command passed
- `pr-opened`: a draft pull request was opened for the execution branch

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

## What This Does Not Do Yet

This is not a full autonomous coding runtime yet.

Not implemented yet:

- code modification by a downstream coding agent
- repeated fail-before and pass-after replay verification against a patched build
- approval workflow for agent-produced changes

Current execution scaffolding notes:

- repository checkout and branch management are now implemented for execution attempts
- each execution stores branch name, base branch, worktree path, findings, validation evidence, and persisted execution artifacts
- replay comparisons are also persisted as a first-class execution record with baseline replay status, post-change replay status, expectation, and target origin
- the downstream agent contract is file-based and command-driven: `.nexus/task.md`, `.nexus/context.json`, `.nexus/output.json`
- persisted execution artifacts include agent context, agent output, git diff, validation logs, and replay-validation summaries when present
- replay validation can rerun the stored HAR against a target base URL and compare the result to an expected replay outcome such as `not-reproduced`
- draft PR creation is now wired for GitHub repositories when auto-create is enabled and the repository has a usable base branch
- GitHub-hosted repository checkout currently requires PAT-backed GitHub auth

## Why This Shape

The current implementation intentionally binds agent work to a persisted Nexus report first. That gives the future runtime a stable evidence package instead of a raw GitHub issue string with missing reproduction context.

Future expansion can add direct GitHub-issue-only task submission, but the report-linked path is the safer foundation.