#!/bin/bash
# Build WASM for Flutter Web (single-threaded, main-thread WorkerPool fallback).
#
# The WASM module is built without atomics/shared-memory.  flutter_rust_bridge's
# WorkerPool normally spawns Web Workers and posts the WebAssembly.Memory to them,
# which fails with DataCloneError in this configuration.  patch_wasm_js.js replaces
# the Worker constructor with a fake worker that runs closures synchronously on the
# main thread, so the bridge works without SharedArrayBuffer.
#
# Usage: bash ../rust/crates/im-flutter-bridge/build_wasm.sh
set -e
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
else
  PYTHON=python
fi

echo "=== Building WASM (single-threaded mode) ==="
RUSTFLAGS="-C target-feature=-atomics,-bulk-memory,-mutable-globals" \
  wasm-pack build --target no-modules --out-dir ../../../flutter/apps/web/web/pkg --no-default-features
echo "=== Patching JS glue for main-thread WorkerPool fallback ==="
"$PYTHON" "$(dirname "$0")/patch_wasm_js.py"
echo "=== Verifying single-threaded WASM worker patch ==="
"$PYTHON" "$(dirname "$0")/patch_wasm_js.py" --verify
echo "=== Done! ==="
echo "Run: flutter run -d chrome"
