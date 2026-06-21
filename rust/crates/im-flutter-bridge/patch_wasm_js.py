#!/usr/bin/env python3
"""
Post-build patch for im_rust_bridge.js.

The bridge is intentionally built as single-threaded WASM (no atomics /
SharedArrayBuffer memory).  flutter_rust_bridge's WorkerPool, however,
expects to spawn Web Workers and post the WebAssembly.Memory to them.
Without a shared Memory that fails with DataCloneError.

This patch replaces the global Worker constructor with a lightweight fake
worker.  The fake worker satisfies the WorkerPool API while running each
closure synchronously on the main thread and reclaiming itself afterwards,
so WorkerPool behaves normally without requiring shared memory or COOP/COEP.

Applied automatically by build_wasm.sh / build_web.dart / builder.py after
wasm-pack build.
"""
import sys, os

# Fix 1: var instead of let (allows redeclaration on hot-reload / cache)
LET_LINE = 'let wasm_bindgen = (function(exports) {'
VAR_LINE = 'var wasm_bindgen = (function(exports) {'

# Fix 2: window.script_src fallback
OLD_SCRIPT_SRC = """\
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }"""

NEW_SCRIPT_SRC = """\
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }
    if (typeof script_src === 'undefined' && typeof window !== 'undefined' && window.script_src) {
        script_src = new URL(window.script_src, location.href).toString();
    }"""

# Fix 3: Replace real Web Workers with fake main-thread workers.
#
# The fake worker ignores the init message sent by WorkerPool.spawn() and
# executes closure messages ([payload, ...serializedTransferables]) by calling
# receive_transfer_closure() synchronously.  It then fires onmessage so the
# pool reclaims it, keeping the worker cache functional.
WORKER_POOL_MARKER = '    class WorkerPool {'
WORKER_POOL_FIX = """\
    // [patch] Single-threaded WASM: run flutter_rust_bridge WorkerPool
    // closures on the main thread instead of real Web Workers.  The WASM
    // module is built without atomic/shared memory features, so posting
    // WebAssembly.Memory to a Worker fails with DataCloneError.  A fake
    // Worker satisfies the WorkerPool API while running closures
    // synchronously and reclaiming itself after each task.
    if (typeof Worker !== 'undefined') {
        const _OrigWorker = Worker;
        const _FakeWorker = function(url) {
            return {
                postMessage: function(data) {
                    // WorkerPool.spawn() sends an init object.
                    // WorkerPool.execute() sends [payload, ...transferables].
                    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'number') {
                        const payload = data[0];
                        const transfer = data.slice(1);
                        receive_transfer_closure(payload, transfer);
                        // Reclaim this fake worker back into the pool.
                        if (this.onmessage) {
                            this.onmessage({ data: undefined });
                        }
                    }
                },
                terminate: function() {},
                onmessage: null,
                onerror: null,
            };
        };
        _FakeWorker.prototype = _OrigWorker.prototype;
        Worker = _FakeWorker;
    }

    class WorkerPool {"""

# Detect older patch variants so we can replace them with the fake-worker fix.
OLD_PATCH_MARKERS = [
    "// [patch] Block Worker creation in single-threaded WASM builds.",
    "// [patch] Make WorkerPool safe in single-threaded WASM.",
]

# Minimal signature that must be present for the bridge to work on
# single-threaded WASM.  Checked by --verify and after a successful patch.
PATCH_SIGNATURE = '_FakeWorker'


def _default_js_path():
    return os.path.normpath(
        os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..',
            '..',
            '..',
            'flutter',
            'apps',
            'web',
            'web',
            'pkg',
            'im_rust_bridge.js',
        )
    )


def _remove_old_worker_patch(content):
    """Strip any previous Worker patch block inserted before class WorkerPool."""
    marker_idx = content.find(WORKER_POOL_MARKER)
    if marker_idx == -1:
        return content
    # Search backwards for the nearest comment that starts an old patch block.
    region_start = marker_idx
    for marker in OLD_PATCH_MARKERS:
        idx = content.rfind(marker, 0, marker_idx)
        if idx != -1:
            # Include leading newline if present.
            start = idx
            if start > 0 and content[start - 1] == '\n':
                start -= 1
            region_start = min(region_start, start)
    if region_start < marker_idx:
        content = content[:region_start] + '\n' + content[marker_idx:]
    return content


def _read_content(js_path):
    if not os.path.isfile(js_path):
        print(f"[ERROR] File not found: {js_path}")
        sys.exit(1)
    with open(js_path, 'r', encoding='utf-8') as f:
        return f.read()


def _verify(js_path, content=None):
    """Return True if the fake-worker patch is present in the JS glue."""
    if content is None:
        content = _read_content(js_path)
    return PATCH_SIGNATURE in content and WORKER_POOL_MARKER in content


def _patch(js_path):
    content = _read_content(js_path)
    changed = False

    # Fix 1
    if LET_LINE in content:
        content = content.replace(LET_LINE, VAR_LINE)
        print(f"  [1] let -> var (allows redeclaration)")
        changed = True

    # Fix 2
    if NEW_SCRIPT_SRC in content:
        print(f"  [2] Already patched")
    elif OLD_SCRIPT_SRC in content:
        content = content.replace(OLD_SCRIPT_SRC, NEW_SCRIPT_SRC)
        print(f"  [2] Added window.script_src fallback")
        changed = True
    else:
        print(f"  [WARN] script_src pattern not found — wasm-bindgen version may have changed")
        sys.exit(1)

    # Fix 3: ensure the fake-worker patch is present exactly once.
    content = _remove_old_worker_patch(content)
    if WORKER_POOL_FIX not in content:
        if WORKER_POOL_MARKER in content:
            content = content.replace(WORKER_POOL_MARKER, WORKER_POOL_FIX, 1)
            print(f"  [3] Patched Worker constructor for single-threaded WASM")
            changed = True
        else:
            print(f"  [WARN] WorkerPool class not found — wasm-bindgen version may have changed")
            sys.exit(1)
    else:
        print(f"  [3] Already patched")

    if changed:
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  Patched: {js_path}")
    else:
        print(f"  No changes needed: {js_path}")

    if not _verify(js_path):
        print(f"  [ERROR] Verification failed after patching: {js_path}")
        sys.exit(1)
    print(f"  [OK] Verified fake-worker patch is present")


def main():
    verify_only = False
    args = sys.argv[1:]
    if '--verify' in args:
        verify_only = True
        args.remove('--verify')

    js_path = args[0] if args else _default_js_path()
    js_path = os.path.normpath(js_path)

    if verify_only:
        if _verify(js_path):
            print(f"[OK] Verified fake-worker patch: {js_path}")
            sys.exit(0)
        else:
            print(f"[ERROR] Missing fake-worker patch: {js_path}")
            print(f"       Rebuild with: bash rust/crates/im-flutter-bridge/build_wasm.sh")
            sys.exit(1)

    _patch(js_path)


if __name__ == '__main__':
    main()
