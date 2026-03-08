# MCP Developer Context

Phase 7 exposes Nexus developer context through a stdio MCP server so IDEs can ask for active issues, report context, reproduction state, and linked observability metadata without bouncing back to the dashboard.

## Start The Server

```bash
npm run mcp:dev
```

For a production-style launch, use:

```bash
npm run mcp:start
```

The MCP process reads the same environment contract as the API server. At minimum, make sure these values are present:

- `APP_BASE_URL`
- `INTERNAL_SERVICE_TOKENS`

`APP_BASE_URL` should point at the running Nexus gateway, for example `http://127.0.0.1:4000`.

## Available Tools

- `nexus_active_issues`: search recent issue-linked reports by service or file path.
- `nexus_issue_context`: fetch aggregated report context, signed artifact URLs, and optional inline previews.
- `nexus_reproduction_status`: inspect the latest replay-backed reproduction result for a report.
- `nexus_observability_context`: fetch normalized observability payload context for a report.
- `nexus_engineering_summary`: fetch a compact ownership, clustering, and reproduction summary for editor-first triage.

## Example Calls

Active issues by repository file:

```json
{
  "name": "nexus_active_issues",
  "arguments": {
    "file": "src/routes/internal/reports.ts",
    "limit": 5
  }
}
```

Detailed issue context with previews:

```json
{
  "name": "nexus_issue_context",
  "arguments": {
    "reportId": "fdbe782f-b877-426a-bc8e-7eddea4c9080",
    "includeDownloadUrls": true,
    "includeInlinePreviews": true,
    "previewCharacters": 1200
  }
}
```

## What Is Indexed

During triage, Nexus now persists a `reportIndex` into each enriched report payload. That index currently includes:

- normalized service or owner labels
- extracted repository file paths
- derived lookup keywords

The active-issues route and MCP search reuse that persisted index when available, and fall back to live extraction for older reports.

To backfill older rows after deploying the indexing change:

```bash
npm run backfill:report-index
```

Helpful flags:

- `--dry-run`
- `--limit=250`
- `--batch-size=50`
- `--force`

## VS Code MCP Configuration

Example `.vscode/mcp.json` entry:

```json
{
  "servers": {
    "nexus": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "env": {
        "APP_BASE_URL": "http://127.0.0.1:4000",
        "INTERNAL_SERVICE_TOKENS": "dev-token:internal:read"
      }
    }
  }
}
```

If your editor expects a raw executable instead of `npm`, point it at the built entrypoint in `dist/mcp/server.js` after running the TypeScript build.

## Learn More Pages

The gateway also hosts two public learn-more pages:

- `/learn`
- `/learn/prd`
- `/learn/developer-workbench`

These are useful for onboarding teammates who need the product framing or a visual preview of the planned developer experience.

## Smoke Coverage

`npm run e2e:developer-context` verifies:

- the public learn routes return HTML
- a seeded report appears in `active-issues`
- the seeded report exposes persisted `reportIndex` data through both `active-issues` and report context

The same path runs in CI through `.github/workflows/developer-context-smoke.yml`.

`npm run e2e:mcp-developer-context` additionally spawns the stdio MCP server and verifies live tool calls through the MCP SDK client.