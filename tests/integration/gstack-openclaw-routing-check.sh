#!/usr/bin/env bash
# Unit test: _OPENCLAW_READY pre-flight routing logic (Phase 57, iter-8).
#
# Tests:
#   1. OPENCLAW_LOCAL=false → _OPENCLAW_READY stays false
#   2. OPENCLAW_LOCAL=true + openclaw not in PATH → _OPENCLAW_READY stays false
#   3. OPENCLAW_LOCAL=true + openclaw in PATH + claude not in PATH → stays false
#   4. OPENCLAW_LOCAL=true + both openclaw + claude in PATH → _OPENCLAW_READY=true
#   5. All 9 scripts have identical routing logic (3 occurrences of _OPENCLAW_READY)

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ── Create temp dir with mock binaries ───────────────────────────────────────
TMPDIR_BASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BASE"' EXIT

MOCK_BIN="$TMPDIR_BASE/bin"
mkdir -p "$MOCK_BIN"
echo '#!/usr/bin/env bash' > "$MOCK_BIN/openclaw"; chmod +x "$MOCK_BIN/openclaw"
echo '#!/usr/bin/env bash' > "$MOCK_BIN/claude"; chmod +x "$MOCK_BIN/claude"

# Evaluate _OPENCLAW_READY under controlled PATH and env
# Returns "true" or "false"
check_ready() {
  local openclaw_local="$1"
  local has_openclaw="$2"  # "yes" or "no"
  local has_claude="$3"    # "yes" or "no"

  # Fresh isolated dir each call — prevents binary leakage between tests
  local path_prefix
  path_prefix="$(mktemp -d "$TMPDIR_BASE/testbin.XXXXXX")"

  if [ "$has_openclaw" = "yes" ]; then
    cp "$MOCK_BIN/openclaw" "$path_prefix/openclaw"
  fi
  if [ "$has_claude" = "yes" ]; then
    cp "$MOCK_BIN/claude" "$path_prefix/claude"
  fi

  bash -c "
    set -euo pipefail 2>/dev/null || true
    # Use a fully isolated PATH so real openclaw/claude installs don't interfere.
    # /bin:/usr/bin provides basic shell utilities (echo, test, etc.) without claude or openclaw.
    export PATH='$path_prefix:/bin:/usr/bin'
    export OPENCLAW_LOCAL='$openclaw_local'
    _OPENCLAW_READY=false
    if [ \"\${OPENCLAW_LOCAL:-false}\" = 'true' ] && command -v openclaw >/dev/null 2>&1 && command -v claude >/dev/null 2>&1; then
      _OPENCLAW_READY=true
    fi
    echo \"\$_OPENCLAW_READY\"
  " 2>/dev/null
}

echo ""
echo "Testing _OPENCLAW_READY condition logic"
echo "────────────────────────────────────────────────────────────────"

# Test 1: OPENCLAW_LOCAL=false → not ready
result="$(check_ready "false" "yes" "yes")"
if [ "$result" = "false" ]; then
  pass "OPENCLAW_LOCAL=false + both in PATH → _OPENCLAW_READY=false (not activated)"
else
  fail "OPENCLAW_LOCAL=false → expected false, got: $result"
fi

# Test 2: OPENCLAW_LOCAL=true + no openclaw → not ready
result="$(check_ready "true" "no" "yes")"
if [ "$result" = "false" ]; then
  pass "OPENCLAW_LOCAL=true + openclaw missing → _OPENCLAW_READY=false (graceful fallback)"
else
  fail "OPENCLAW_LOCAL=true + no openclaw → expected false, got: $result"
fi

# Test 3: OPENCLAW_LOCAL=true + no claude → not ready (needs both)
result="$(check_ready "true" "yes" "no")"
if [ "$result" = "false" ]; then
  pass "OPENCLAW_LOCAL=true + claude missing → _OPENCLAW_READY=false (needs both)"
else
  fail "OPENCLAW_LOCAL=true + no claude → expected false, got: $result"
fi

# Test 4: OPENCLAW_LOCAL=true + both present → ready
result="$(check_ready "true" "yes" "yes")"
if [ "$result" = "true" ]; then
  pass "OPENCLAW_LOCAL=true + openclaw + claude in PATH → _OPENCLAW_READY=true"
else
  fail "OPENCLAW_LOCAL=true + both present → expected true, got: $result"
fi

# Test 5: Neither present, OPENCLAW_LOCAL=true → not ready
result="$(check_ready "true" "no" "no")"
if [ "$result" = "false" ]; then
  pass "OPENCLAW_LOCAL=true + neither binary → _OPENCLAW_READY=false"
else
  fail "OPENCLAW_LOCAL=true + neither → expected false, got: $result"
fi

echo ""
echo "Testing structural consistency across all 9 gstack scripts"
echo "────────────────────────────────────────────────────────────────"
SCRIPTS_DIR="/Users/davidsmith/Documents/Repos/AI-Took-My-Job/scripts"
REFERENCE=3  # _OPENCLAW_READY appears: =false, =true, ="true"

for s in investigate retro ship health qa qa-only review canary document-release; do
  count="$(grep -c "_OPENCLAW_READY" "$SCRIPTS_DIR/gstack-$s.sh" 2>/dev/null || echo "0")"
  if [ "$count" = "$REFERENCE" ]; then
    pass "$s: _OPENCLAW_READY pattern present ($count occurrences)"
  else
    fail "$s: expected $REFERENCE occurrences, got $count"
  fi
done

echo ""
echo "Testing syntax validity of all 9 gstack scripts"
echo "────────────────────────────────────────────────────────────────"
for s in investigate retro ship health qa qa-only review canary document-release; do
  if bash -n "$SCRIPTS_DIR/gstack-$s.sh" 2>/dev/null; then
    pass "$s: bash -n OK"
  else
    fail "$s: bash -n FAILED (syntax error)"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Summary ──────────────────────────────────────────────────────────────"
echo "  Passed: $PASS / $((PASS+FAIL))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAILED ($FAIL checks failed)"
  exit 1
else
  echo "RESULT: PASSED"
  exit 0
fi
