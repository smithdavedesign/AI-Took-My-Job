#!/usr/bin/env bash
# Nexus AGENT_EXECUTION_COMMAND wrapper — gstack /ship skill
# Tier 2 risk: dependency updates, CI fixes, straightforward improvements
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

echo "[gstack-ship] Starting ship skill for execution $NEXUS_AGENT_EXECUTION_ID"
echo "[gstack-ship] Worktree: $WORKTREE"

cd "$WORKTREE"

# Build a consolidated prompt for Claude Code that includes:
# - The Nexus task brief
# - The RepoHQ coding context (if present in context.json)
# - Instruction to write .nexus/output.json on completion

TASK_OBJECTIVE=$(node -e "
  const fs = require('fs');
  const ctx = JSON.parse(fs.readFileSync('$CONTEXT_FILE', 'utf8'));
  const brief = ctx.repoHQ?.brief ?? '';
  const taskFile = fs.readFileSync('$PROMPT_FILE', 'utf8');
  console.log(taskFile + (brief ? '\n\n---\n\n## RepoHQ Portfolio Context\n\n' + brief : ''));
" 2>/dev/null || cat "$PROMPT_FILE")

# Run Claude Code with the /ship skill context
# Claude Code reads the prompt from stdin and operates on the current worktree
echo "$TASK_OBJECTIVE" | npx --yes claude --dangerously-skip-permissions \
  --print \
  "You are an expert software engineer. Read the task above carefully.

IMPORTANT: After completing your changes, write a JSON file to $OUTPUT_FILE with this exact structure:
{
  \"contractVersion\": \"nexus-agent-output-v1\",
  \"summary\": \"<one sentence describing what you did>\",
  \"findings\": [\"<key finding 1>\", \"<key finding 2>\"],
  \"outcome\": \"changes-made\",
  \"changedFiles\": [\"<relative path 1>\", \"<relative path 2>\"],
  \"validationCommand\": \"npm test\",
  \"pullRequest\": {
    \"title\": \"<concise PR title>\",
    \"body\": \"<PR body describing the change>\",
    \"draft\": true
  }
}

If you cannot make the changes, set outcome to 'blocked' and explain in findings."

echo "[gstack-ship] Execution complete"
