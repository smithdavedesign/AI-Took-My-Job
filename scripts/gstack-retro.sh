#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /retro skill
set -euo pipefail
WORKTREE="${NEXUS_AGENT_WORKTREE_PATH:-$(pwd)}"
CONTEXT_FILE="${NEXUS_AGENT_CONTEXT_FILE:-$WORKTREE/.nexus/context.json}"
OUTPUT_FILE="${NEXUS_AGENT_OUTPUT_FILE:-$WORKTREE/.nexus/output.json}"
PROMPT_FILE="${NEXUS_AGENT_PROMPT_FILE:-$WORKTREE/.nexus/task.md}"
GSTACK_BIN="${HOME}/.claude/skills/gstack/bin"
echo "[gstack-retro] Starting /retro for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
cd "$WORKTREE"
node -e "
  const fs = require('fs');
  try {
    const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
    const brief = ctx.repoHQ?.brief ?? '';
    if (!brief) process.exit(0);
    const claudeMd = '$WORKTREE/CLAUDE.md';
    const existing = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
    const stripped = existing.replace(/<!-- repohq-brief-start -->[\s\S]*?<!-- repohq-brief-end -->\n?/g, '');
    const injected = stripped.trimEnd() + '\n\n<!-- repohq-brief-start -->\n## RepoHQ Portfolio Context\n\n' + brief + '\n<!-- repohq-brief-end -->\n';
    fs.writeFileSync(claudeMd, injected);
  } catch (e) { /* non-fatal */ }
" 2>/dev/null || true
node -e "
  const fs = require('fs');
  try {
    const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
    const brief = ctx.repoHQ?.brief ?? '';
    const task = fs.readFileSync('$PROMPT_FILE', 'utf8');
    fs.writeFileSync('$PROMPT_FILE', task + (brief ? '\n\n---\n\n## RepoHQ Context\n\n' + brief : ''));
  } catch (e) { /* non-fatal */ }
" 2>/dev/null || true
if command -v "$GSTACK_BIN/gstack-slug" >/dev/null 2>&1; then
  eval "$(\"$GSTACK_BIN/gstack-slug\" 2>/dev/null)" || true
  if [ -n "${SLUG:-}" ]; then
    LEARNINGS="$(\"$GSTACK_BIN/gstack-learnings-search\" --limit 3 2>/dev/null || true)"
    [ -n "$LEARNINGS" ] && printf '\n\n---\n\n## Past Findings\n\n%s\n' "$LEARNINGS" >> "$PROMPT_FILE"
  fi
fi
export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"
export OPENCLAW_SESSION=true
export SPAWNED_SESSION=true

# ── Append Nexus output format requirement to prompt ─────────────────────────
# The /retro skill produces human-readable stdout. To capture structured findings
# in the RepoHQ UI, the agent must write JSON to NEXUS_AGENT_OUTPUT_FILE.
cat >> "$PROMPT_FILE" << 'NEXUS_OUTPUT_FORMAT'

---

## Required Output (Nexus contract)

When the weekly engineering retrospective — patterns, velocity, growth areas is complete, write the following JSON to the file at
the path in the NEXUS_AGENT_OUTPUT_FILE environment variable:

```json
{
  "contractVersion": "nexus-agent-output-v1",
  "summary": "One-sentence verdict",
  "findings": ["Finding 1 with file:line where applicable", "Finding 2"],
  "outcome": "no-changes",
  "changedFiles": []
}
```

Rules:
- Each finding is a short string. One issue per entry.
- outcome must be "no-changes" (this skill is read-only).
- Write to NEXUS_AGENT_OUTPUT_FILE using the Bash tool or Write tool.
NEXUS_OUTPUT_FORMAT

echo "[gstack-retro] Running gstack /retro..."
# Resolve claude CLI — prefer global install, fall back to npx for CI/CD environments
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD="claude"
else
  CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
fi

$CLAUDE_CMD /retro --print --dangerously-skip-permissions "$(cat "$PROMPT_FILE")" 2>&1
if [ -f "$OUTPUT_FILE" ]; then
  node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
      if (Array.isArray(out.findings)) out.findings = out.findings.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
      if (!out.findings || out.findings.length === 0) out.findings = ['retro complete'];
      if (!out.contractVersion) out.contractVersion = 'nexus-agent-output-v1';
      if (!out.outcome) out.outcome = 'no-changes';
      if (!Array.isArray(out.changedFiles)) out.changedFiles = [];
      fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(out, null, 2));
    } catch (e) { console.warn('[gstack-retro] sanitise failed:', e.message); }
  " 2>/dev/null || true
else
  node -e "const fs=require('fs');fs.writeFileSync('$OUTPUT_FILE',JSON.stringify({contractVersion:'nexus-agent-output-v1',summary:'retro complete',findings:['retro complete — check agent logs for full output'],outcome:'no-changes',changedFiles:[]},null,2));" 2>/dev/null || true
fi
echo "[gstack-retro] /retro complete"
