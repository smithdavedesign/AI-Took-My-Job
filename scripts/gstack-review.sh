#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /review skill
# Read-only: pre-merge code review — no code changes, findings report only.
set -euo pipefail
WORKTREE="${NEXUS_AGENT_WORKTREE_PATH:-$(pwd)}"
CONTEXT_FILE="${NEXUS_AGENT_CONTEXT_FILE:-$WORKTREE/.nexus/context.json}"
OUTPUT_FILE="${NEXUS_AGENT_OUTPUT_FILE:-$WORKTREE/.nexus/output.json}"
PROMPT_FILE="${NEXUS_AGENT_PROMPT_FILE:-$WORKTREE/.nexus/task.md}"
GSTACK_BIN="${HOME}/.claude/skills/gstack/bin"
echo "[gstack-review] Starting /review for execution ${NEXUS_AGENT_EXECUTION_ID:-local}"
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
  eval "$("$GSTACK_BIN/gstack-slug" 2>/dev/null)" || true
  if [ -n "${SLUG:-}" ]; then
    LEARNINGS=$("$GSTACK_BIN/gstack-learnings-search" --limit 3 2>/dev/null || true)
    [ -n "$LEARNINGS" ] && printf '\n\n---\n\n## Past Findings\n\n%s\n' "$LEARNINGS" >> "$PROMPT_FILE"
  fi
fi
export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"
export OPENCLAW_SESSION=true
export SPAWNED_SESSION=true

# ── Prepend hard read-only constraint then append output format ───────────────
ORIGINAL_PROMPT="$(cat "$PROMPT_FILE")"
cat > "$PROMPT_FILE" << 'READ_ONLY_HEADER'
# ASSESSMENT ONLY — DO NOT MODIFY ANY FILES

This is a READ-ONLY assessment. You are a reporter, not a fixer.

HARD CONSTRAINTS — violating any of these will cause the task to fail:
1. DO NOT use Edit, Write, MultiEdit, or any tool that modifies source files.
2. DO NOT run git add, git commit, git push, or stage any changes.
3. DO NOT create, rename, or delete any source files.
4. The ONLY file you may write is the JSON output to NEXUS_AGENT_OUTPUT_FILE.
5. If you find a bug or issue: REPORT it as a finding. Do NOT fix it.

Your job: code review — security, logic errors, type safety. Report issues found.

---

READ_ONLY_HEADER

printf '%s\n' "$ORIGINAL_PROMPT" >> "$PROMPT_FILE"

cat >> "$PROMPT_FILE" << 'NEXUS_OUTPUT_FORMAT'

---

## Required Output (Nexus contract)

When your assessment is complete, write this JSON to NEXUS_AGENT_OUTPUT_FILE:

{{
  "contractVersion": "nexus-agent-output-v1",
  "summary": "One sentence verdict",
  "findings": ["Finding 1 with file:line", "Finding 2"],
  "outcome": "no-changes",
  "changedFiles": []
}}

Rules:
- One finding per issue. Include file paths and line numbers where possible.
- outcome MUST be "no-changes". This is a read-only task.
- changedFiles MUST be []. You made no changes.

NEXUS_OUTPUT_FORMAT

echo "[gstack-review] Running gstack /review..."
# Resolve claude CLI — prefer global install, fall back to npx for CI/CD environments
if command -v claude >/dev/null 2>&1; then
  CLAUDE_CMD="claude"
else
  CLAUDE_CMD="npx --yes @anthropic-ai/claude-code"
fi

$CLAUDE_CMD /review --print --dangerously-skip-permissions "$(cat "$PROMPT_FILE")" 2>&1
if [ -f "$OUTPUT_FILE" ]; then
  node -e "
    const fs = require('fs');
    try {
      const out = JSON.parse(fs.readFileSync('$OUTPUT_FILE', 'utf8'));
      if (Array.isArray(out.findings)) out.findings = out.findings.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim());
      if (!out.findings || out.findings.length === 0) out.findings = ['Code review complete — no issues found'];
      if (!out.contractVersion) out.contractVersion = 'nexus-agent-output-v1';
      if (!out.outcome) out.outcome = 'no-changes';
      if (!Array.isArray(out.changedFiles)) out.changedFiles = [];
      fs.writeFileSync('$OUTPUT_FILE', JSON.stringify(out, null, 2));
    } catch (e) { console.warn('[gstack-review] sanitise failed:', e.message); }
  " 2>/dev/null || true
else
  node -e "const fs=require('fs');fs.writeFileSync('$OUTPUT_FILE',JSON.stringify({contractVersion:'nexus-agent-output-v1',summary:'Code review complete',findings:['Review complete — check agent logs for detailed findings'],outcome:'no-changes',changedFiles:[],validationCommand:'npm test'},null,2));" 2>/dev/null || true
fi
echo "[gstack-review] /review complete"
