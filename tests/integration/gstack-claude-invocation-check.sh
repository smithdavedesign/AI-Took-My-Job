#!/usr/bin/env bash
# Integration test: every scripts/gstack-*.sh must actually invoke claude when it is on PATH,
# and the RepoHQ brief it injects into CLAUDE.md must be visible during the run but never
# left behind for the commit (it made every agent PR conflict on CLAUDE.md).
#
# Root cause this test guards against:
#   The OpenClaw removal (1e9210e) left the `$CLAUDE_CMD --print ...` call inside the
#   `else` branch of the "is claude installed?" check. On any machine with claude on PATH
#   (including the Render worker) the skill silently never ran, and report-only skills
#   produced empty "clean" reports.
#
# This test puts a stub `claude` first on PATH that records its invocation, runs each
# script against a throwaway git worktree, and asserts the stub was called with --print.
#
# Usage: bash tests/integration/gstack-claude-invocation-check.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

# Stub claude: log args, write a minimal valid output contract, exit 0.
mkdir -p "$TMP_ROOT/bin"
cat > "$TMP_ROOT/bin/claude" << 'STUB'
#!/usr/bin/env bash
echo "$*" >> "$CLAUDE_STUB_LOG"
# Record whether the injected brief was visible to the agent during the run.
grep -c 'repohq-brief-start' CLAUDE.md >> "$CLAUDE_STUB_LOG.brief" 2>/dev/null || echo 0 >> "$CLAUDE_STUB_LOG.brief"
if [ -n "${NEXUS_AGENT_OUTPUT_FILE:-}" ]; then
  mkdir -p "$(dirname "$NEXUS_AGENT_OUTPUT_FILE")"
  printf '{"schemaVersion":"nexus-agent-output-v1","outcome":"no-changes","summary":"stub","findings":["stub finding"]}\n' > "$NEXUS_AGENT_OUTPUT_FILE"
fi
exit 0
STUB
chmod +x "$TMP_ROOT/bin/claude"

for script in "$REPO_ROOT"/scripts/gstack-*.sh; do
  name="$(basename "$script" .sh)"
  work="$TMP_ROOT/$name"
  mkdir -p "$work/.nexus"
  git -C "$work" init -q
  echo '{"name":"t","scripts":{"test":"true"}}' > "$work/package.json"
  echo '@AGENTS.md' > "$work/CLAUDE.md"
  git -C "$work" add package.json CLAUDE.md && git -C "$work" -c user.email=t@t -c user.name=t commit -qm init
  echo "Objective: test" > "$work/.nexus/task.md"
  echo '{"repoHQ":{"brief":"# Brief\n- Last push: Mon Jun 15 2026"}}' > "$work/.nexus/context.json"
  log="$TMP_ROOT/$name.log"
  : > "$log"

  CLAUDE_STUB_LOG="$log" \
  PATH="$TMP_ROOT/bin:$PATH" \
  NEXUS_AGENT_WORKTREE_PATH="$work" \
  NEXUS_AGENT_CONTEXT_FILE="$work/.nexus/context.json" \
  NEXUS_AGENT_OUTPUT_FILE="$work/.nexus/output.json" \
  NEXUS_AGENT_PROMPT_FILE="$work/.nexus/task.md" \
  NEXUS_AGENT_EXECUTION_ID="test-$name" \
    bash "$script" > "$TMP_ROOT/$name.out" 2>&1 || true

  if grep -q -- "--print" "$log"; then
    echo "  ✅ $name invoked claude"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name did NOT invoke claude"
    tail -5 "$TMP_ROOT/$name.out" | sed 's/^/       /'
    FAIL=$((FAIL + 1))
  fi

  if [ "$(head -1 "$log.brief" 2>/dev/null)" = "1" ] && git -C "$work" diff --quiet -- CLAUDE.md && [ "$(cat "$work/CLAUDE.md")" = "@AGENTS.md" ]; then
    echo "  ✅ $name: brief visible during the run, CLAUDE.md clean afterwards"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name: brief seen=$(head -1 "$log.brief" 2>/dev/null || echo none); CLAUDE.md after run:"
    sed 's/^/       /' "$work/CLAUDE.md" | head -6
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAILED"
  exit 1
fi
echo "RESULT: PASSED"
