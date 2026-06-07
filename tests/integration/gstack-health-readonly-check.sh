#!/usr/bin/env bash
# Integration test: gstack-health.sh must produce outcome=no-changes and make zero git changes.
#
# Root cause this test guards against:
#   Without gstack installed, `claude /health` behaves as a regular agent that
#   reads the prompt, finds issues, and fixes them — setting outcome=changes-made
#   and triggering a PR instead of a /health report.
#
# This test:
#   1. Creates a temp git worktree with a minimal JS project
#   2. Runs gstack-health.sh against it
#   3. Asserts output.json exists with outcome=no-changes
#   4. Asserts zero git changes were made to source files
#   5. Asserts the prompt contains the read-only header
#
# Usage: bash tests/integration/gstack-health-readonly-check.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HEALTH_SCRIPT="$REPO_ROOT/scripts/gstack-health.sh"

if [ ! -f "$HEALTH_SCRIPT" ]; then
  echo "ERROR: gstack-health.sh not found at $HEALTH_SCRIPT"
  exit 1
fi

PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ── Setup: create a minimal temp worktree ────────────────────────────────────
TMPDIR_BASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BASE"' EXIT

WORKTREE="$TMPDIR_BASE/test-repo"
mkdir -p "$WORKTREE"
cd "$WORKTREE"
git init -q
git config user.email "test@test.com"
git config user.name "Test"

# Minimal project with known issues (unused variable, missing tests)
cat > index.js << 'JS'
const unusedVar = 'this is dead code';

function add(a, b) {
  return a + b;
}

module.exports = { add };
JS

cat > package.json << 'PKG'
{"name": "test-project", "version": "1.0.0", "scripts": {"test": "echo 'no tests'"}}
PKG

git add -A
git commit -q -m "initial"
BEFORE_HASH="$(git rev-parse HEAD)"

# ── Setup env vars ────────────────────────────────────────────────────────────
NEXUS_DIR="$WORKTREE/.nexus"
mkdir -p "$NEXUS_DIR"

OUTPUT_FILE="$NEXUS_DIR/output.json"
PROMPT_FILE="$NEXUS_DIR/task.md"
CONTEXT_FILE="$NEXUS_DIR/context.json"

cat > "$PROMPT_FILE" << 'PROMPT'
Run a code health check on this project. Report TypeScript errors, dead code, test coverage gaps, and any quality issues.
PROMPT

cat > "$CONTEXT_FILE" << 'CTX'
{"repoHQ": {"brief": "Test repo for readonly verification"}}
CTX

export NEXUS_AGENT_WORKTREE_PATH="$WORKTREE"
export NEXUS_AGENT_OUTPUT_FILE="$OUTPUT_FILE"
export NEXUS_AGENT_PROMPT_FILE="$PROMPT_FILE"
export NEXUS_AGENT_CONTEXT_FILE="$CONTEXT_FILE"
export NEXUS_AGENT_TASK_ID="test-task-readonly"
export NEXUS_AGENT_EXECUTION_ID="test-exec-readonly"

echo ""
echo "Running gstack-health.sh against temp repo..."
echo "Worktree: $WORKTREE"
echo ""

# ── Run the script ────────────────────────────────────────────────────────────
bash "$HEALTH_SCRIPT" 2>&1 || true

echo ""
echo "── Test Results ─────────────────────────────────────────────────────────"

# ── Check 1: prompt contains read-only header ─────────────────────────────────
if grep -q "ASSESSMENT ONLY" "$PROMPT_FILE" 2>/dev/null; then
  pass "prompt contains ASSESSMENT ONLY read-only header"
else
  fail "prompt does NOT contain read-only header — script is not prepending it"
fi

# ── Check 2: output.json must exist ──────────────────────────────────────────
if [ -f "$OUTPUT_FILE" ]; then
  pass "output.json was written"
else
  fail "output.json was NOT written — agent produced no structured output"
fi

# ── Check 3: outcome must be no-changes ──────────────────────────────────────
if [ -f "$OUTPUT_FILE" ]; then
  OUTCOME="$(node -e "const o=JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8')); console.log(o.outcome||'missing')" 2>/dev/null || echo "parse-error")"
  if [ "$OUTCOME" = "no-changes" ]; then
    pass "outcome = no-changes"
  else
    fail "outcome = '$OUTCOME' (expected no-changes) — agent made changes instead of reporting"
  fi
fi

# ── Check 4: contractVersion present ─────────────────────────────────────────
if [ -f "$OUTPUT_FILE" ]; then
  CV="$(node -e "const o=JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8')); console.log(o.contractVersion||'missing')" 2>/dev/null || echo "parse-error")"
  if [ "$CV" = "nexus-agent-output-v1" ]; then
    pass "contractVersion = nexus-agent-output-v1"
  else
    fail "contractVersion = '$CV'"
  fi
fi

# ── Check 5: findings non-empty ───────────────────────────────────────────────
if [ -f "$OUTPUT_FILE" ]; then
  FINDING_COUNT="$(node -e "
    const o=JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
    const f=Array.isArray(o.findings)?o.findings.filter(x=>x&&x.trim()):[];
    console.log(f.length);
  " 2>/dev/null || echo "0")"
  if [ "$FINDING_COUNT" -gt 0 ]; then
    pass "findings has $FINDING_COUNT entries"
  else
    fail "findings is empty — agent ran but produced no findings"
  fi
fi

# ── Check 6: zero git changes to source files ─────────────────────────────────
cd "$WORKTREE"
CHANGED_FILES="$(git diff --name-only HEAD 2>/dev/null || true)"
CHANGED_STAGED="$(git diff --cached --name-only 2>/dev/null || true)"
AFTER_HASH="$(git rev-parse HEAD 2>/dev/null || echo "$BEFORE_HASH")"

SOURCE_CHANGES=""
for f in $CHANGED_FILES $CHANGED_STAGED; do
  if [[ "$f" != .nexus/* ]]; then
    SOURCE_CHANGES="$SOURCE_CHANGES $f"
  fi
done

if [ -z "$(echo $SOURCE_CHANGES | tr -d ' ')" ] && [ "$AFTER_HASH" = "$BEFORE_HASH" ]; then
  pass "zero source file changes (git tree unchanged)"
else
  fail "source files were modified: [$SOURCE_CHANGES] — agent made code changes, this is a read-only skill"
fi

# ── Check 7: changedFiles is empty array ──────────────────────────────────────
if [ -f "$OUTPUT_FILE" ]; then
  CF_LEN="$(node -e "const o=JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8')); console.log((o.changedFiles||[]).length)" 2>/dev/null || echo "?")"
  if [ "$CF_LEN" = "0" ]; then
    pass "changedFiles = []"
  else
    fail "changedFiles has $CF_LEN entries (should be empty for read-only skills)"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ──────────────────────────────────────────────────────────────"
echo "  Passed: $PASS / $((PASS+FAIL))"

if [ -f "$OUTPUT_FILE" ]; then
  echo ""
  echo "── output.json ──────────────────────────────────────────────────────────"
  node -e "
    const o=JSON.parse(require('fs').readFileSync('$OUTPUT_FILE','utf8'));
    console.log('outcome:', o.outcome);
    console.log('summary:', o.summary);
    (o.findings||[]).slice(0,5).forEach(f => console.log(' ', f));
    if((o.findings||[]).length>5) console.log('  ...and', o.findings.length-5, 'more');
  " 2>/dev/null || cat "$OUTPUT_FILE"
fi

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAILED ($FAIL checks failed)"
  exit 1
else
  echo "RESULT: PASSED"
  exit 0
fi
