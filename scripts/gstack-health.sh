#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /health skill
# Read-only: code quality dashboard — no code changes, findings report only.
#
# G1: Invokes real gstack /health skill
# G3: Injects repo-specific learnings for context
# G5: Writes RepoHQ brief to CLAUDE.md so gstack reads it natively
#
# Expected env vars (set by Nexus worker):
#   NEXUS_AGENT_TASK_ID, NEXUS_AGENT_EXECUTION_ID
#   NEXUS_AGENT_WORKTREE_PATH, NEXUS_AGENT_CONTEXT_FILE
#   NEXUS_AGENT_OUTPUT_FILE, NEXUS_AGENT_PROMPT_FILE

set -euo pipefail

WORKTREE="${NEXUS_AGENT_WORKTREE_PATH:-$(pwd)}"
CONTEXT_FILE="${NEXUS_AGENT_CONTEXT_FILE:-$WORKTREE/.nexus/context.json}"
OUTPUT_FILE="${NEXUS_AGENT_OUTPUT_FILE:-$WORKTREE/.nexus/output.json}"
PROMPT_FILE="${NEXUS_AGENT_PROMPT_FILE:-$WORKTREE/.nexus/task.md}"
GSTACK_BIN="${HOME}/.claude/skills/gstack/bin"

echo "[gstack-health] Starting /health for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
echo "[gstack-health] Worktree: $WORKTREE"

cd "$WORKTREE"

# ── G5: Inject RepoHQ brief into CLAUDE.md ───────────────────────────────────
node -e "
  const fs = require('fs');
  try {
    const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
    const brief = ctx.repoHQ?.brief ?? '';
    if (!brief) process.exit(0);
    const claudeMd = '$WORKTREE/CLAUDE.md';
    const existing = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
    const stripped = existing.replace(/<!-- repohq-brief-start -->[\s\S]*?<!-- repohq-brief-end -->\n?/g, '');
    const injected = stripped.trimEnd() +
      '\n\n<!-- repohq-brief-start -->\n## RepoHQ Portfolio Context\n\n' + brief +
      '\n<!-- repohq-brief-end -->\n';
    fs.writeFileSync(claudeMd, injected);
  } catch (e) { /* non-fatal */ }
" 2>/dev/null || true

# ── G3: Inject learnings ──────────────────────────────────────────────────────
if command -v "$GSTACK_BIN/gstack-slug" >/dev/null 2>&1; then
  eval "$("$GSTACK_BIN/gstack-slug" 2>/dev/null)" || true
  if [ -n "${SLUG:-}" ]; then
    LEARNINGS=$("$GSTACK_BIN/gstack-learnings-search" --limit 3 2>/dev/null || true)
    if [ -n "$LEARNINGS" ]; then
      printf '\n\n---\n\n## Past Findings\n\n%s\n' "$LEARNINGS" >> "$PROMPT_FILE"
    fi
  fi
fi

export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"
export OPENCLAW_SESSION=true
export SPAWNED_SESSION=true

# ── Append Nexus output format requirement to prompt ─────────────────────────
# The /health skill produces human-readable stdout. To capture structured findings
# in the RepoHQ UI, the agent must write JSON to NEXUS_AGENT_OUTPUT_FILE.
cat >> "$PROMPT_FILE" << 'NEXUS_OUTPUT_FORMAT'

---

## Required Output (Nexus contract)

When the health check is complete, write the following JSON to the file at
the path in the NEXUS_AGENT_OUTPUT_FILE environment variable:

```json
{
  "contractVersion": "nexus-agent-output-v1",
  "summary": "One-sentence health verdict (e.g. 'Health 72/100 — 3 TypeScript errors, 2 dead exports')",
  "findings": [
    "TypeScript: description of issue with file:line if known",
    "Dead code: description",
    "Tests: description"
  ],
  "outcome": "no-changes",
  "changedFiles": []
}
```

Rules:
- findings: array of short strings, one per issue. Passing checks may be included as "✅ TypeScript: 0 errors".
- outcome must be "no-changes" (health is read-only).
- Write to NEXUS_AGENT_OUTPUT_FILE using the Bash tool or Write tool.
NEXUS_OUTPUT_FORMAT

# ── G1: Run /health — read-only code quality dashboard ───────────────────────
echo "[gstack-health] Running gstack /health..."
# Resolve claude CLI — prefer global install, fall back to npx for CI/CD environments
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD="claude"
else
  CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
fi

$CLAUDE_CMD /health \
  --print \
  --dangerously-skip-permissions \
  "$(cat "$PROMPT_FILE")" 2>&1

# ── Post-process output.json ──────────────────────────────────────────────────
# The /health skill may write output.json directly (when NEXUS_AGENT_OUTPUT_FILE
# is set), but markdown findings often include blank lines that become empty
# strings — invalid per the Nexus agent output contract. Filter them here.
if [ -f "$OUTPUT_FILE" ]; then
  echo "[gstack-health] Sanitising output.json findings..."
  node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));

      // Filter empty / whitespace-only strings from findings
      if (Array.isArray(out.findings)) {
        out.findings = out.findings
          .filter(f => typeof f === 'string' && f.trim().length > 0)
          .map(f => f.trim());
      }

      // Ensure at least one finding so the array is non-empty
      if (!out.findings || out.findings.length === 0) {
        out.findings = ['Health check complete — see dashboard output above'];
      }

      // Ensure required fields are present
      if (!out.contractVersion) out.contractVersion = 'nexus-agent-output-v1';
      if (!out.outcome) out.outcome = 'no-changes';
      if (!Array.isArray(out.changedFiles)) out.changedFiles = [];

      fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(out, null, 2));
      console.log('[gstack-health] output.json sanitised: ' + out.findings.length + ' findings');
    } catch (e) {
      console.warn('[gstack-health] Could not sanitise output.json:', e.message);
    }
  " 2>/dev/null || true
else
  # /health produced no output.json — create a minimal valid contract
  echo "[gstack-health] No output.json written — creating fallback..."
  node -e "
    const fs = require('fs');
    const output = {
      contractVersion: 'nexus-agent-output-v1',
      summary: 'Code health check complete — see findings for details',
      findings: ['Health dashboard produced — check agent logs for full scored output'],
      outcome: 'no-changes',
      changedFiles: [],
      validationCommand: 'npm test && npm run typecheck',
    };
    fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(output, null, 2));
  " 2>/dev/null || true
fi

echo "[gstack-health] /health complete"
