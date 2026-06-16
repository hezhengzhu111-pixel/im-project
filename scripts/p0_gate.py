#!/usr/bin/env python3
"""
P0 Final Acceptance Gate — runs all P0 validation steps and reports results.

Steps:
  1. Rust: cargo fmt --check, check, test, clippy (P0 crates)
  2. Flutter analyze: core_flutter, shared_features, web, mobile, desktop
  3. Flutter test: core_flutter, shared_features, web, mobile, desktop
  4. P0-2 Security log test
  5. P0-3 Provider smoke tests (Web / Mobile / Desktop)
  6. P0-1 E2EE SIT (requires --base-url and --db-url)
  7. P0-4 Media entry-point guard tests

Usage:
    # Full P0 verification (DB scan REQUIRED):
    python scripts/p0_gate.py \\
        --base-url http://localhost:8082 \\
        --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db

    # Local debug only (SIT DB scan skipped — NOT valid for P0):
    python scripts/p0_gate.py \\
        --base-url http://localhost:8082 \\
        --skip-sit-db-scan

Exit code: 0 if all steps pass, 1 otherwise.
"""

import argparse
import subprocess
import sys
import os
import time
from pathlib import Path
from typing import List, Tuple, Optional

ROOT = Path(__file__).resolve().parent.parent


# ============================================================================
# Helpers
# ============================================================================

def _run(cmd: str, cwd: str, timeout: int = 300) -> Tuple[int, str, str]:
    """Run a shell command, return (exit_code, stdout, stderr)."""
    try:
        proc = subprocess.run(
            cmd, shell=True, cwd=cwd, capture_output=True, text=True,
            timeout=timeout,
        )
        return (proc.returncode, proc.stdout, proc.stderr)
    except subprocess.TimeoutExpired:
        return (-1, "", f"TIMEOUT after {timeout}s: {cmd}")
    except Exception as e:
        return (-1, "", str(e))


def _step(name: str, cmd: str, cwd: str, timeout: int = 300) -> bool:
    """Run one gate step and report PASS / FAIL."""
    print(f"\n{'=' * 60}")
    print(f"  {name}")
    print(f"  cwd: {cwd}")
    print(f"  cmd: {cmd}")
    print(f"{'=' * 60}")
    sys.stdout.flush()

    ec, stdout, stderr = _run(cmd, str(cwd), timeout)

    tail_out = stdout.strip().splitlines()[-20:] if stdout.strip() else []
    tail_err = stderr.strip().splitlines()[-20:] if stderr.strip() else []

    if ec == 0:
        print(f"  [PASS] {name}")
        for line in tail_out:
            print(f"         {line}")
        return True
    else:
        print(f"  [FAIL] {name} (exit={ec})")
        for line in tail_err:
            print(f"         {line}")
        for line in tail_out:
            print(f"         {line}")
        return False


# ============================================================================
# Main gate
# ============================================================================

def run_gate(base_url: str, db_url: Optional[str], skip_sit_db: bool = False) -> int:
    results: List[Tuple[str, bool]] = []
    flutter_root = ROOT / "flutter"
    rust_root = ROOT / "rust"

    # ---- 1. Rust ----
    s = "1. Rust"
    print(f"\n\n### {s} ###")

    results.append((f"{s} fmt --check",
        _step(f"{s} fmt --check", "cargo fmt --check", str(rust_root))))
    results.append((f"{s} check --workspace",
        _step(f"{s} check --workspace", "cargo check --workspace", str(rust_root))))
    results.append((f"{s} test --workspace",
        _step(f"{s} test --workspace", "cargo test --workspace", str(rust_root), timeout=600)))

    # cargo clippy on P0 crates (full workspace may have too many warnings)
    p0_crates = ["api-server", "im-e2ee-ffi", "im-flutter-bridge", "im-common"]
    for crate in p0_crates:
        crate_path = rust_root / crate
        if crate_path.exists():
            results.append((f"{s} clippy {crate}",
                _step(f"{s} clippy {crate}",
                      f"cargo clippy -p {crate} --all-targets -- -D warnings",
                      str(rust_root))))
        else:
            print(f"  [SKIP] Rust crate '{crate}' not found")

    # ---- 2. Flutter analyze ----
    s = "2. Flutter analyze"
    print(f"\n\n### {s} ###")

    flutter_pkgs = [
        ("core_flutter", "packages/core_flutter"),
        ("shared_features", "packages/shared_features"),
        ("web", "apps/web"),
        ("mobile", "apps/mobile"),
        ("desktop", "apps/desktop"),
    ]
    for name, rel in flutter_pkgs:
        results.append((f"{s} {name}",
            _step(f"{s} {name}", "flutter analyze", str(flutter_root / rel))))

    # ---- 3. Flutter test ----
    s = "3. Flutter test"
    print(f"\n\n### {s} ###")

    for name, rel in flutter_pkgs:
        results.append((f"{s} {name}",
            _step(f"{s} {name}", "flutter test", str(flutter_root / rel), timeout=600)))

    # ---- 4. P0-2 Security log test ----
    s = "4. P0-2 Security log"
    print(f"\n\n### {s} ###")
    results.append((s,
        _step(s, "flutter test test/logging/app_logger_test.dart",
              str(flutter_root / "packages" / "core_flutter"))))

    # ---- 5. P0-3 Provider smoke tests ----
    s = "5. P0-3 Provider smoke"
    print(f"\n\n### {s} ###")
    for platform in ["web", "mobile", "desktop"]:
        results.append((f"{s} {platform}",
            _step(f"{s} {platform}",
                  f"flutter test test/smoke/provider_smoke_test.dart",
                  str(flutter_root / "apps" / platform))))

    # ---- 6. P0-1 E2EE SIT ----
    s = "6. P0-1 E2EE SIT"
    print(f"\n\n### {s} ###")
    if skip_sit_db:
        print("  [SKIP] --skip-sit-db-scan set (not valid for P0)")
        results.append((s, None))  # None = skipped
    elif not db_url:
        print("  [FAIL] --db-url is required for P0 verification")
        results.append((s, False))
    else:
        sit_script = ROOT / "tests" / "p0_e2ee_private_text_acceptance.py"
        cmd = f"python {sit_script} --base-url {base_url} --db-url {db_url}"
        results.append((s,
            _step(s, cmd, str(ROOT), timeout=120)))

    # ---- 7. P0-4 Media entry-point guard ----
    s = "7. P0-4 Media guard"
    print(f"\n\n### {s} ###")
    # Run all Web tests (they include media-related characterization tests).
    results.append((f"{s} web tests",
        _step(f"{s} web tests", "flutter test", str(flutter_root / "apps" / "web"), timeout=600)))

    # ---- Report ----
    print(f"\n\n{'=' * 60}")
    print("P0 GATE RESULT")
    print(f"{'=' * 60}")

    fail_count = 0
    skip_count = 0
    for name, ok in results:
        if ok is None:
            print(f"  [SKIP] {name}")
            skip_count += 1
        elif ok:
            print(f"  [PASS] {name}")
        else:
            print(f"  [FAIL] {name}")
            fail_count += 1

    pass_count = sum(1 for _, ok in results if ok is True)
    total = len(results)
    print(f"\n  Total: {total}  Passed: {pass_count}  Failed: {fail_count}  Skipped: {skip_count}")

    if fail_count > 0:
        print("\nP0 GATE: FAIL")
        return 1
    if skip_count > 0:
        print("\nP0 GATE: PARTIAL (some steps skipped — not valid for P0 sign-off)")
        return 1
    print("\nP0 GATE: PASS")
    return 0


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P0 Final Acceptance Gate")
    parser.add_argument("--base-url", default="http://localhost:8082",
                        help="Backend base URL for SIT")
    parser.add_argument("--db-url", default=None,
                        help="MySQL URL for mandatory DB plaintext scan")
    parser.add_argument("--skip-sit-db-scan", action="store_true",
                        help="Skip SIT DB scan (debug only, NOT valid for P0)")
    args = parser.parse_args()

    sys.exit(run_gate(args.base_url, args.db_url, args.skip_sit_db_scan))


if __name__ == "__main__":
    main()
