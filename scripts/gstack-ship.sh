#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /ship skill
# Tier 2 risk: dependency updates, CI fixes, straightforward improvements
#
# G1: Invokes real gstack /ship (not bare claude --print)
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

echo "[gstack-ship] Starting /ship for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
echo "[gstack-ship] Worktree: $WORKTREE"

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
    const stripped = existing.replace(/<!-- repohq-brief-start -->[\s\S]*?<!-- repohq-brief-end -->\n?/g, '');
    const injected = stripped.trimEnd() +
      '\n\n<!-- repohq-brief-start -->\n## RepoHQ Portfolio Context\n\n' + brief +
      '\n<!-- repohq-brief-end -->\n';
    fs.writeFileSync(claudeMd, injected);
    console.log('[gstack-ship] RepoHQ brief injected into CLAUDE.md');
  } catch (e) {
    console.warn('[gstack-ship] Brief injection failed (non-fatal):', e.message);
  }
" 2>/dev/null || true

# ── G5: Also merge brief into the task prompt ─────────────────────────────────
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
if command -v "$GSTACK_BIN/gstack-slug" >/dev/null 2>&1; then
  eval "$("$GSTACK_BIN/gstack-slug" 2>/dev/null)" || true
  if [ -n "${SLUG:-}" ]; then
    LEARNINGS=$("$GSTACK_BIN/gstack-learnings-search" --limit 5 2>/dev/null || true)
    if [ -n "$LEARNINGS" ]; then
      echo "[gstack-ship] Injecting ${SLUG} learnings into prompt"
      printf '\n\n---\n\n## Operational Learnings (from past sessions on this repo)\n\n%s\n' "$LEARNINGS" >> "$PROMPT_FILE"
    fi
  fi
fi

# ── G4: Enable checkpoint mode ────────────────────────────────────────────────
if command -v "$GSTACK_BIN/gstack-config" >/dev/null 2>&1; then
  "$GSTACK_BIN/gstack-config" set checkpoint_mode continuous 2>/dev/null || true
fi

# ── Set up environment ────────────────────────────────────────────────────────
export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"
export OPENCLAW_SESSION=true
export SPAWNED_SESSION=true

# ── G1: Invoke the real gstack /ship skill ────────────────────────────────────
echo "[gstack-ship] Running gstack /ship..."
# Pre-flight: verify openclaw + claude both available before delegating.
_OPENCLAW_READY=false
if [ "${OPENCLAW_LOCAL:-false}" = "true" ] && command -v openclaw >/dev/null 2>&1 && command -v claude >/dev/null 2>&1; then
  _OPENCLAW_READY=true
fi

if [ "$_OPENCLAW_READY" = "true" ]; then
  echo "[gstack-ship] Routing to openclaw agent --local (session: nexus-${NEXUS_AGENT_TASK_ID:-local})"
  openclaw agent --local \
    --session-id "nexus-${NEXUS_AGENT_TASK_ID:-$(date +%s)}" \
    --message "/ship $(cat "$PROMPT_FILE")" 2>&1
else
  if command -v claude >/dev/null 2>&1; then
    CLAUDE_CMD="claude"
  else
    CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
  fi
  $CLAUDE_CMD /ship \
    --print \
    --dangerously-skip-permissions \
    "$(cat "$PROMPT_FILE")" 2>&1
fi

echo "[gstack-ship] /ship complete"
