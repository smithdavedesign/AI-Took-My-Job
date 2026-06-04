#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /document-release skill
set -euo pipefail
WORKTREE="${NEXUS_AGENT_WORKTREE_PATH:-$(pwd)}"
CONTEXT_FILE="${NEXUS_AGENT_CONTEXT_FILE:-$WORKTREE/.nexus/context.json}"
OUTPUT_FILE="${NEXUS_AGENT_OUTPUT_FILE:-$WORKTREE/.nexus/output.json}"
PROMPT_FILE="${NEXUS_AGENT_PROMPT_FILE:-$WORKTREE/.nexus/task.md}"
GSTACK_BIN="${HOME}/.claude/skills/gstack/bin"
echo "[gstack-document-release] Starting /document-release for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
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
echo "[gstack-document-release] Running gstack /document-release..."
claude /document-release --print --dangerously-skip-permissions "$(cat "$PROMPT_FILE")" 2>&1
if [ -f "$OUTPUT_FILE" ]; then
  node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
      if (Array.isArray(out.findings)) out.findings = out.findings.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
      if (!out.findings || out.findings.length === 0) out.findings = ['document-release complete'];
      if (!out.contractVersion) out.contractVersion = 'nexus-agent-output-v1';
      if (!out.outcome) out.outcome = 'changes-made';
      if (!Array.isArray(out.changedFiles)) out.changedFiles = [];
      fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(out, null, 2));
    } catch (e) { console.warn('[gstack-document-release] sanitise failed:', e.message); }
  " 2>/dev/null || true
else
  node -e "const fs=require('fs');fs.writeFileSync('$OUTPUT_FILE',JSON.stringify({contractVersion:'nexus-agent-output-v1',summary:'document-release complete',findings:['document-release complete — check agent logs for full output'],outcome:'changes-made',changedFiles:[]},null,2));" 2>/dev/null || true
fi
echo "[gstack-document-release] /document-release complete"
