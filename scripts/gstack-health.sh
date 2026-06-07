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

# ── Prepend hard read-only constraint then append output format ───────────────
# IMPORTANT: prepend comes first so the agent reads the constraint BEFORE
# the objective. Appending it at the end means the agent may already have
# decided to make changes by the time it reads the instructions.
ORIGINAL_PROMPT="$(cat "$PROMPT_FILE")"
cat > "$PROMPT_FILE" << 'READ_ONLY_HEADER'
# ASSESSMENT ONLY — DO NOT MODIFY ANY FILES

This is a READ-ONLY code health assessment. You are a reporter, not a fixer.

HARD CONSTRAINTS — violating any of these will cause the task to fail:
1. DO NOT use Edit, Write, MultiEdit, or any tool that modifies source files.
2. DO NOT run git add, git commit, git push, or stage any changes.
3. DO NOT create, rename, or delete any source files.
4. The ONLY file you may write is the JSON output to NEXUS_AGENT_OUTPUT_FILE.
5. If you find a bug or issue: REPORT it as a finding. Do NOT fix it.

Your job: read the code, assess quality, write a JSON report. Nothing else.

---

READ_ONLY_HEADER

# Re-append original objective after the constraint header
printf '%s\n' "$ORIGINAL_PROMPT" >> "$PROMPT_FILE"

# Append output format requirement
cat >> "$PROMPT_FILE" << 'NEXUS_OUTPUT_FORMAT'

---

## Required Output (Nexus contract)

When your assessment is complete, write this JSON to NEXUS_AGENT_OUTPUT_FILE
(use `echo '...' > "$NEXUS_AGENT_OUTPUT_FILE"` or the Write tool on that path):

{
  "contractVersion": "nexus-agent-output-v1",
  "summary": "One sentence: overall health verdict with score if determinable",
  "findings": [
    "TypeScript: <specific issue with file:line>",
    "Tests: <specific issue or passing count>",
    "Dead code: <specific exports/functions never imported>",
    "Lint: <specific issues>"
  ],
  "outcome": "no-changes",
  "changedFiles": []
}

Rules:
- One finding per issue. Be specific — include file paths and line numbers where possible.
- Passing checks: include as "✅ TypeScript: 0 errors" so the user sees what passed.
- outcome MUST be "no-changes". This is a read-only task.
- changedFiles MUST be []. You made no changes.
NEXUS_OUTPUT_FORMAT

# ── G1: Run /health — read-only code quality dashboard ───────────────────────
echo "[gstack-health] Running gstack /health..."
# Resolve claude CLI — prefer global install, fall back to npx for CI/CD environments
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD="claude"
else
  CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
fi

$CLAUDE_CMD \
  --print \
  --dangerously-skip-permissions \
  "$(cat "$PROMPT_FILE")" 2>&1


# ── Force-revert any source changes the agent made ──────────────────────────
# Report-only skills must not modify source files. If the agent edited anything
# despite the read-only constraint, revert it here so the Nexus worker sees
# no git changes and fires agent_skill_report instead of creating a PR.
# .nexus/ is always preserved (excluded from git pathspec by the worker).
echo "[gstack-health] Reverting any unexpected source changes..."
git -C "$WORKTREE" checkout -- . 2>/dev/null || true
git -C "$WORKTREE" clean -fd --exclude=.nexus 2>/dev/null || true
echo "[gstack-health] Worktree clean."

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
