#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /investigate skill
# Tier 3 risk: security fixes, complex investigations
# Investigate mode: diagnose first, then implement fix if safe
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

echo "[gstack-investigate] Starting investigate skill for execution $NEXUS_AGENT_EXECUTION_ID"
echo "[gstack-investigate] Worktree: $WORKTREE"

cd "$WORKTREE"

# Build consolidated prompt with RepoHQ context
TASK_OBJECTIVE=$(node -e "
  const fs = require('fs');
  const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
  const brief = ctx.repoHQ?.brief ?? '';
  const taskFile = fs.readFileSync('$PROMPT_FILE', 'utf8');
  console.log(taskFile + (brief ? '\n\n---\n\n## RepoHQ Portfolio Context\n\n' + brief : ''));
" 2>/dev/null || cat "$PROMPT_FILE")

# Run Claude Code in investigate mode
# Phase 1: Diagnose. Phase 2: Fix only if high-confidence and low blast-radius.
echo "$TASK_OBJECTIVE" | npx --yes claude --dangerously-skip-permissions \
  --print \
  "You are a security-focused software engineer. This is a TIER 3 HIGH-RISK task.

INVESTIGATION RULES:
1. First, thoroughly diagnose the issue. Read relevant files carefully.
2. Check if the fix is straightforward and low blast-radius.
3. If YES: implement the fix, write tests if possible.
4. If NO or UNCERTAIN: report findings only, set outcome to 'no-changes'.
5. NEVER introduce new security patterns without understanding the threat model.
6. NEVER modify auth, payments, or data migration files without explicit instruction.

After completing, write a JSON file to $OUTPUT_FILE:
{
  \"contractVersion\": \"nexus-agent-output-v1\",
  \"summary\": \"<what was found and what was done>\",
  \"findings\": [
    \"<security finding 1>\",
    \"<root cause>\",
    \"<what was changed or why it was left unchanged>\"
  ],
  \"outcome\": \"changes-made | no-changes | blocked\",
  \"changedFiles\": [\"<relative paths of changed files>\"],
  \"validationCommand\": \"npm test\",
  \"pullRequest\": {
    \"title\": \"fix: <concise security fix title>\",
    \"body\": \"<detailed description including: what was vulnerable, what changed, how to verify>\",
    \"draft\": true
  }
}"

echo "[gstack-investigate] Execution complete"
