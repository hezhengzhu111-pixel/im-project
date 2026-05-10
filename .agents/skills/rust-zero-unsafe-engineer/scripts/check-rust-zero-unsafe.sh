#!/usr/bin/env bash
set -euo pipefail

echo "== Rust zero-unsafe verification =="

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep 'rg' is required."
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "ERROR: cargo is required."
  exit 1
fi

echo ""
echo "== Step 1: Checking unsafe keyword in project-owned Rust source =="

if rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  '\bunsafe\b' .; then
  echo ""
  echo "ERROR: project-owned Rust code must not contain the unsafe keyword."
  exit 1
fi

echo "PASS: no unsafe keyword found in project-owned Rust source."

echo ""
echo "== Step 2: Checking unsafe_code lint weakening =="

if rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  '#!\s*\[\s*(allow|warn|deny)\s*\(\s*unsafe_code\s*\)\s*\]|#\s*\[\s*(allow|warn|deny)\s*\(\s*unsafe_code\s*\)\s*\]' .; then
  echo ""
  echo "ERROR: unsafe_code lint weakening is forbidden. Use #![forbid(unsafe_code)]."
  exit 1
fi

echo "PASS: no unsafe_code lint weakening found."

echo ""
echo "== Step 3: Checking dangerous low-level Rust primitives =="

if rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  'transmute|zeroed|uninitialized|from_raw_parts|from_raw_parts_mut|from_utf8_unchecked|copy_nonoverlapping|std::ptr|libc::|MaybeUninit|as \*const|as \*mut' .; then
  echo ""
  echo "ERROR: dangerous low-level Rust primitive detected."
  echo "Replace it with safe Rust, or document and remove the risky design."
  exit 1
fi

echo "PASS: no dangerous low-level Rust primitive found."

echo ""
echo "== Step 4: Checking crate roots for #![forbid(unsafe_code)] =="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/check-crate-forbid.py"

echo ""
echo "== Step 5: Running cargo fmt =="

cargo fmt --all -- --check

echo ""
echo "== Step 6: Running cargo clippy =="

cargo clippy --workspace --all-targets --all-features -- -D warnings

echo ""
echo "== Step 7: Running cargo test =="

cargo test --workspace --all-features

echo ""
echo "== Step 8: Optional security tools =="

if cargo audit --version >/dev/null 2>&1; then
  echo "Running cargo audit..."
  cargo audit
else
  echo "WARN: cargo audit is not installed; skipped."
fi

if cargo deny --version >/dev/null 2>&1; then
  echo "Running cargo deny check..."
  cargo deny check
else
  echo "WARN: cargo deny is not installed; skipped."
fi

if cargo geiger --version >/dev/null 2>&1; then
  echo "Running cargo geiger..."
  cargo geiger --all-features --workspace
else
  echo "WARN: cargo geiger is not installed; skipped."
fi

echo ""
echo "PASS: Rust zero-unsafe verification completed."