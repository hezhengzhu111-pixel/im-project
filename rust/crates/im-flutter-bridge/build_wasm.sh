#!/bin/bash
# Build WASM for Flutter Web (single-threaded, no WorkerPool shared memory)
# Usage: bash ../rust/crates/im-flutter-bridge/build_wasm.sh
set -e
cd "$(dirname "$0")"
echo "=== Building WASM (single-threaded mode) ==="
RUSTFLAGS="-C target-feature=-atomics,-bulk-memory,-mutable-globals" \
  wasm-pack build --target no-modules --out-dir ../../../flutter/apps/web/web/pkg --no-default-features
echo "=== Patching JS glue for script_src fallback ==="
python3 "$(dirname "$0")/patch_wasm_js.py"
echo "=== Done! ==="
echo "Run: flutter run -d chrome"
