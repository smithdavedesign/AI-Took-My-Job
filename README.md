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
- For approved hosted feedback, optionally start an agent task and launch an isolated branch execution.
- Promote only reviewed work into GitHub.

## What Exists Today

- Fastify gateway and worker runtime.
- PostgreSQL persistence for workspaces, projects, reports, review state, and GitHub linkage.
- Redis-backed queueing for triage, replay, and agent execution work.
- Project-scoped GitHub App resolution and repository connections.
- Hosted feedback widget, embed bootstrap, dashboard, and customer portal surfaces.
- Review-gated issue and PR promotion flows.
- Review-queue history, agent-pipeline kickoff, execution closeout, and promotion review from the operator UI.
- Replay and agent-execution foundations, including a worker-backed API adapter for production coding runs.
- MCP developer context and self-hostable packaging.

## Runtime Surfaces

- `/learn`: simplified front door for the product story and quick-start flow.
- `/learn/onboarding`: advanced setup console for workspace, project, repo, widget, and access configuration.
- `/learn/review-queue`: operator review surface for approvals, reviewed-history inspection, agent pipeline launch, execution closeout, and PR promotion.
- `/learn/support-ops`: readiness and support-oriented follow-up surface.
- `/learn/prd`: product reference.

## Current Operator Flow

The default hosted path now looks like this:

1. Connect a project repository through the GitHub App.
2. Mint a signed widget session and collect hosted feedback.
3. Review the report in `/learn/review-queue` with the operator summary and raw evidence.
4. Approve or reject the report.
5. If approved, either stop at the synced GitHub draft issue or send the report into the internal agent pipeline.
6. Launch isolated execution, inspect closeout state, submit human review, and explicitly promote approved work into GitHub.

The product still requires explicit human review before GitHub promotion. The new agent pipeline can now move from approved report to worker-backed execution, but it is still intentionally review-gated and not autonomous PR publication.

### Autonomous Branch Policy

- Autonomous execution branches use `feature/bot/{taskId}-{executionId}` naming.
- Autonomous PRs target `integration/agent` by default (`AGENT_INTEGRATION_BASE_BRANCH`).
- Autonomous PR promotion to `main` is rejected by policy.
- Human-reviewed promotion from integration branch to `main` remains the final required gate.

### Main Release Gate

- Integration promotion PRs targeting `main` (`integration/agent -> main`) must include label `human-reviewed-release`.
- This policy is enforced in workflow: `.github/workflows/policy-main-release-gate.yml`.

### Branch Cleanup Preview (Scaffold)

- Internal preview endpoint: `GET /internal/agent-task-branches/cleanup-preview`
- Purpose: list candidate autonomous branches older than the configured TTL.
- Execute endpoint: `POST /internal/agent-task-branches/cleanup-execute`.
- `dryRun` defaults to `true`; set `dryRun=false` to delete candidate remote branches.
- Deletion requires `AGENT_BRANCH_CLEANUP_ENABLED=true`.
- Config knobs: `AGENT_BRANCH_CLEANUP_ENABLED`, `AGENT_BRANCH_TTL_HOURS`, `AGENT_BRANCH_CLEANUP_MAX_PER_RUN`.

### Notion Execution Ledger

- Optional write-back: set `NOTION_INTEGRATION_KEY` and `NOTION_EXECUTION_DATABASE_ID`.
- Nexus upserts a canonical execution record on PR opened and merged lifecycle events.
- Quick setup:
	- Create a Notion internal integration token (`NOTION_INTEGRATION_KEY`).
	- Share your target Notion database with that integration.
	- Set `NOTION_EXECUTION_DATABASE_ID` to the database ID (or URL; parser normalizes URL form in validation script).
	- Run `npm run notion:validate`.
- Required Notion properties expected in the target database include:
	- `Name` (title)
	- `Execution ID` (rich text)
	- `Task ID` (rich text)
	- `Repository` (rich text)
	- `Status` (rich text)
	- `Terminal State` (rich text)
	- `Branch` (rich text)
	- `Base Branch` (rich text)
	- `Source` (rich text)
	- `Trigger` (rich text)
	- `Skill` (rich text)
	- `Objective` (rich text)
	- `Summary` (rich text)
	- `Outcome` (rich text)
	- `Outcome Delta` (number)
	- `PR URL` (url)
	- `Retries` (number)

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

The largest remaining gap is now runtime hardening rather than basic operator UX. Nexus can move from approved report through execution closeout and promotion review inside the product, but production still needs post-deploy validation and iteration on real code-changing worker runs.

## Reference Docs

- `PRD.md`: simplified top-level product requirements.
- `PRD-part2.md`: customer onboarding and operating model for the simplified path.
- `roadmap.md`: phase history plus current simplification direction.
- `docs/simplified-vnext/`: working simplification specs and gap analysis.
## Installation and Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/smithdavedesign/AI-Took-My-Job.git
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables by copying `.env.example` to `.env` and configuring it with your settings.

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Optionally, build the project for production:
   ```bash
   npm run build
   ```

6. Run tests (if any):
   ```bash
   npm test
   ```

7. For more detailed setup and configuration, refer to `docs/simplified-vnext/` directory.
