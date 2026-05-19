#!/usr/bin/env bash
# ==============================================================================
# E2EE Rust CI — local verification script
#
# Performs the same checks as .github/workflows/e2ee-rust-ci.yml
#
# Usage:
#   bash backend/scripts/e2ee-ci-check.sh          # from repo root
#   bash scripts/e2ee-ci-check.sh                   # from backend/ directory
#   bash backend/scripts/e2ee-ci-check.sh --fix     # auto-fix formatting first
#
# Prerequisites:
#   - Rust stable toolchain with clippy and rustfmt components
#   - (Optional) wasm32-unknown-unknown target for e2ee-wasm target check
# ==============================================================================

set -euo pipefail

# Determine backend directory
if [ -f "Cargo.toml" ] && grep -q 'e2ee-core' "Cargo.toml" 2>/dev/null; then
  BACKEND_DIR="."
elif [ -f "backend/Cargo.toml" ] && grep -q 'e2ee-core' "backend/Cargo.toml" 2>/dev/null; then
  BACKEND_DIR="backend"
else
  echo "ERROR: Cannot find backend/ directory. Run from repo root or backend/."
  exit 1
fi

cd "$BACKEND_DIR"

AUTO_FIX=false
if [ "${1:-}" = "--fix" ]; then
  AUTO_FIX=true
fi

PASS=0
FAIL=0

# check_ok: run a command, report pass/fail, continue on failure
check_ok() {
  local label="$1"
  shift
  printf '\n%s\n' "---- $label ----"
  if "$@"; then
    echo "[PASS] $label"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $label (exit code: $?)"
    FAIL=$((FAIL + 1))
  fi
}

# ---- Rust toolchain ----
echo "=== Rust toolchain ==="
rustc --version
cargo --version

# ---- Format ----
if $AUTO_FIX; then
  echo "=== Auto-fixing formatting ==="
  cargo fmt -p e2ee-core
  cargo fmt -p e2ee-ffi
  cargo fmt -p e2ee-wasm
  echo "Done."
fi

check_ok "Format check (e2ee-core)" cargo fmt --check -p e2ee-core
check_ok "Format check (e2ee-ffi)"  cargo fmt --check -p e2ee-ffi
check_ok "Format check (e2ee-wasm)" cargo fmt --check -p e2ee-wasm

# ---- Clippy ----
check_ok "Clippy e2ee-core" cargo clippy -p e2ee-core -- -D warnings

# ---- Tests ----
check_ok "Test e2ee-core" cargo test -p e2ee-core

check_ok "Test e2ee-ffi" cargo test -p e2ee-ffi

echo ""
echo "Note: #[wasm_bindgen_test] tests require wasm-pack + node to execute."
echo "      Only host-compatible tests (host_tests module) run with cargo test."
check_ok "Test e2ee-wasm (host tests)" cargo test -p e2ee-wasm

# ---- wasm32 target compilation check ----
echo ""
echo "=== wasm32 target check ==="
if rustup target add wasm32-unknown-unknown 2>/dev/null; then
  check_ok "Check e2ee-wasm (wasm32 target)" cargo check -p e2ee-wasm --target wasm32-unknown-unknown
else
  echo "[SKIP] Could not install wasm32-unknown-unknown target"
fi

# ---- Forbidden pattern scan ----
FORBIDDEN='\.unwrap\(|\.expect\(|\bunsafe\b|panic!|unreachable!|todo!|unimplemented!'

echo ""
echo "=== Forbidden pattern scan ==="

echo "--- e2ee-core/src (hard fail) ---"
# Exclude #![forbid(unsafe_code)] lint attribute from the scan
MATCHES="$(grep -nE "$FORBIDDEN" e2ee-core/src/*.rs 2>/dev/null | grep -v 'forbid(unsafe_code)')" || true
if [ -n "$MATCHES" ]; then
  echo "$MATCHES"
  echo "[FAIL] Forbidden patterns in e2ee-core/src/"
  FAIL=$((FAIL + 1))
else
  echo "[PASS] e2ee-core/src is clean"
  PASS=$((PASS + 1))
fi

echo "--- e2ee-ffi/src (report only) ---"
grep -nE "$FORBIDDEN" e2ee-ffi/src/*.rs 2>/dev/null || echo "  clean"

echo "--- e2ee-wasm/src (report only) ---"
grep -nE "$FORBIDDEN" e2ee-wasm/src/*.rs 2>/dev/null || echo "  clean"

# ---- e2ee-ffi/build.rs check ----
echo ""
echo "--- e2ee-ffi/build.rs (report only) ---"
grep -nE "$FORBIDDEN" e2ee-ffi/build.rs 2>/dev/null || echo "  clean"

# ---- Summary ----
echo ""
echo "================================================================================"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed. Review the output above."
  exit 1
else
  echo "All checks passed."
fi
