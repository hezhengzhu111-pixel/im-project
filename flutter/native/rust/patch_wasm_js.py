#!/usr/bin/env python3
"""
Post-build patch for im_rust_bridge.js.

Two fixes:
1. Change 'let wasm_bindgen' to 'var wasm_bindgen' — allows redeclaration when
   script is loaded multiple times (dev hot-reload, browser cache).

2. Add window.script_src fallback in the IIFE — dynamic <script> loading makes
   document.currentScript === null, so wasm-bindgen can't capture script_src.
   The flutter_rust_bridge loader sets window.script_src before loading.

Applied automatically by build_wasm.sh after wasm-pack build.
"""
import sys, os

# Fix 1: var instead of let (allows redeclaration)
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

def main():
    if len(sys.argv) > 1:
        js_path = sys.argv[1]
    else:
        js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               '..', '..', 'apps', 'web', 'web', 'pkg', 'im_rust_bridge.js')
    js_path = os.path.normpath(js_path)

    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # Fix 1
    if LET_LINE in content:
        content = content.replace(LET_LINE, VAR_LINE)
        print(f"  [1] let -> var (allows redeclaration)")
        changed = True

    # Fix 2
    if OLD_SCRIPT_SRC in content:
        content = content.replace(OLD_SCRIPT_SRC, NEW_SCRIPT_SRC)
        print(f"  [2] Added window.script_src fallback")
        changed = True
    elif NEW_SCRIPT_SRC in content:
        print(f"  [2] Already patched")
    else:
        print(f"  [WARN] script_src pattern not found — wasm-bindgen version may have changed")
        sys.exit(1)

    if changed:
        with open(js_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  Patched: {js_path}")
    else:
        print(f"  No changes needed: {js_path}")

if __name__ == '__main__':
    main()
