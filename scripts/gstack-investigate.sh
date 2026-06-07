#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /investigate skill
# Tier 3 risk: security fixes, complex investigations
#
# G1: Invokes real gstack /investigate (not bare claude --print)
# G3: Injects repo-specific learnings before the skill runs
# G4: Enables checkpoint mode so progress survives crashes
# G5: Writes RepoHQ brief to CLAUDE.md in the worktree so gstack reads it natively
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

echo "[gstack-investigate] Starting /investigate for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
echo "[gstack-investigate] Worktree: $WORKTREE"

cd "$WORKTREE"

# ── G5: Write RepoHQ brief to CLAUDE.md so gstack reads it as native context ──
node -e "
  const fs = require('fs');
  try {
    const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
    const brief = ctx.repoHQ?.brief ?? '';
    if (!brief) process.exit(0);

    const claudeMd = '$WORKTREE/CLAUDE.md';
    const existing = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';

    // Remove any previous RepoHQ section and re-inject
    const stripped = existing.replace(/<!-- repohq-brief-start -->[\s\S]*?<!-- repohq-brief-end -->\n?/g, '');
    const injected = stripped.trimEnd() +
      '\n\n<!-- repohq-brief-start -->\n## RepoHQ Portfolio Context\n\n' + brief +
      '\n<!-- repohq-brief-end -->\n';

    fs.writeFileSync(claudeMd, injected);
    console.log('[gstack-investigate] RepoHQ brief injected into CLAUDE.md');
  } catch (e) {
    console.warn('[gstack-investigate] Brief injection failed (non-fatal):', e.message);
  }
" 2>/dev/null || true

# ── G5: Also merge brief into the task prompt for the skill's initial prompt ──
node -e "
  const fs = require('fs');
  try {
    const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
    const brief = ctx.repoHQ?.brief ?? '';
    const task = fs.readFileSync('$PROMPT_FILE', 'utf8');
    const merged = task + (brief ? '\n\n---\n\n## RepoHQ Portfolio Context\n\n' + brief : '');
    fs.writeFileSync('$PROMPT_FILE', merged);
  } catch (e) { /* non-fatal */ }
" 2>/dev/null || true

# ── G3: Inject repo-specific learnings before the skill runs ──────────────────
# gstack-slug computes the project slug from the current directory
if command -v "$GSTACK_BIN/gstack-slug" >/dev/null 2>&1; then
  eval "$("$GSTACK_BIN/gstack-slug" 2>/dev/null)" || true
  if [ -n "${SLUG:-}" ]; then
    LEARNINGS=$("$GSTACK_BIN/gstack-learnings-search" --limit 5 2>/dev/null || true)
    if [ -n "$LEARNINGS" ]; then
      echo "[gstack-investigate] Injecting ${SLUG} learnings into prompt"
      printf '\n\n---\n\n## Operational Learnings (from past sessions on this repo)\n\n%s\n' "$LEARNINGS" >> "$PROMPT_FILE"
    fi
  fi
fi

# ── G4: Enable checkpoint mode so the skill auto-commits WIP ─────────────────
if command -v "$GSTACK_BIN/gstack-config" >/dev/null 2>&1; then
  "$GSTACK_BIN/gstack-config" set checkpoint_mode continuous 2>/dev/null || true
fi

# ── Set up environment ────────────────────────────────────────────────────────
export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"

# OPENCLAW_SESSION: gstack preamble auto-chooses recommended options (no interactive prompts)
# SPAWNED_SESSION: signals orchestrator context — disables feature discovery, telemetry prompts
export OPENCLAW_SESSION=true
export SPAWNED_SESSION=true

# ── G1: Invoke the real gstack /investigate skill ─────────────────────────────
echo "[gstack-investigate] Running gstack /investigate..."
# Resolve claude CLI — prefer global install, fall back to npx for CI/CD environments
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD="claude"
else
  CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
fi

$CLAUDE_CMD /investigate \
  --print \
  --dangerously-skip-permissions \
  "$(cat "$PROMPT_FILE")" 2>&1

# ── Sanitise output.json — filter empty findings strings ─────────────────────
# /investigate may produce findings with empty strings (blank lines in markdown).
# These fail the Nexus agent output contract Zod validation.
if [ -f "$OUTPUT_FILE" ]; then
  node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
      if (Array.isArray(out.findings)) {
        out.findings = out.findings
          .filter(f => typeof f === 'string' && f.trim().length > 0)
          .map(f => f.trim());
        if (out.findings.length === 0) {
          out.findings = ['Investigation complete — no specific findings to report'];
        }
      }
      fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(out, null, 2));
    } catch (e) {}
  " 2>/dev/null || true
fi

# ── G3: Log any operational discoveries back to gstack learnings ──────────────
if [ -f "$OUTPUT_FILE" ] && command -v "$GSTACK_BIN/gstack-learnings-log" >/dev/null 2>&1; then
  SUMMARY=$(node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
      if (out.findings && out.findings.length > 0) {
        // Log the first finding as an operational learning for future sessions
        const finding = out.findings[0];
        if (finding && finding.length > 10) process.stdout.write(finding.slice(0, 200));
      }
    } catch (e) {}
  " 2>/dev/null || true)

  if [ -n "$SUMMARY" ]; then
    "$GSTACK_BIN/gstack-learnings-log" \
      "{\"skill\":\"investigate\",\"type\":\"operational\",\"key\":\"nexus-finding-${NEXUS_AGENT_EXECUTION_ID:-$(date +%s)}\",\"insight\":\"$SUMMARY\",\"confidence\":6,\"source\":\"observed\"}" \
      2>/dev/null || true
  fi
fi

echo "[gstack-investigate] /investigate complete"
