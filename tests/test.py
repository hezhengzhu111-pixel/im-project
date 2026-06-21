#!/usr/bin/env python3
"""Unified Rust/Flutter/SIT test entry point for local and CI gates."""

from __future__ import annotations

import os
import sys

# Prevent compiled Python bytecode from being written into the source tree.
# Bytecode belongs in build artifacts, not in tests/**/__pycache__.
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
sys.dont_write_bytecode = True

import argparse
import json
from dataclasses import asdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR / "common"))
# Make deploy_system available for source-pollution checks.
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from gate_common import ROOT, StepResult, run_step, skip_step, write_gate_reports
from workspace import ensure_work_workspace, setup_isolated_env


PYTHON = sys.executable
TEST_REPORT_DIR = ROOT / "build" / "reports" / "test"
DOMAINS_DIR = TESTS_DIR / "domains"

# Domain test entry points
doMAIN_RUNNERS = {
    "auth": DOMAINS_DIR / "auth" / "runner.py",
    "user": DOMAINS_DIR / "user" / "runner.py",
    "message": DOMAINS_DIR / "message_private" / "runner.py",
    "message-private": DOMAINS_DIR / "message_private" / "runner.py",
    "message-group": DOMAINS_DIR / "message_group" / "runner.py",
    "social": DOMAINS_DIR / "social" / "runner.py",
    "moments": DOMAINS_DIR / "moments" / "runner.py",
    "file": DOMAINS_DIR / "file" / "runner.py",
    "push": DOMAINS_DIR / "push" / "runner.py",
    "e2ee": DOMAINS_DIR / "e2ee" / "runner.py",
    "websocket": DOMAINS_DIR / "websocket" / "runner.py",
}

# Use build/work isolated workspaces instead of source directories
RUST_WORK_DIR = ROOT / "build" / "work" / "rust"
FLUTTER_WORK_DIR = ROOT / "build" / "work" / "flutter"
FLUTTER_TARGETS = [
    ("core", "packages/core"),
    ("core_flutter", "packages/core_flutter"),
    ("shared_features", "packages/shared_features"),
    ("web", "apps/web"),
    ("mobile", "apps/mobile"),
    ("desktop", "apps/desktop"),
]
RUST_PACKAGES = [
    ("api-server", "apps/api-server"),
    ("im-server", "apps/im-server"),
    ("im-common", "crates/im-common"),
    ("im-e2ee-core", "crates/im-e2ee-core"),
    ("im-e2ee-ffi", "crates/im-e2ee-ffi"),
    ("im-flutter-bridge", "crates/im-flutter-bridge"),
    ("im-e2ee-wasm", "crates/im-e2ee-wasm"),
]
E2EE_RUST_CRATES = [
    ("im-e2ee-core", "crates/im-e2ee-core"),
    ("im-e2ee-ffi", "crates/im-e2ee-ffi"),
    ("im-e2ee-wasm", "crates/im-e2ee-wasm"),
]


def rust_steps(*, continue_on_error: bool = False) -> list[StepResult]:
    results: list[StepResult] = []

    # Ensure we have isolated workspace
    ensure_work_workspace()

    # Set environment for isolated builds
    env = setup_isolated_env()

    commands = [
        ("Rust fmt", ["cargo", "fmt", "--check"], 300),
        ("Rust check", ["cargo", "check", "--workspace"], 900),
        ("Rust unit tests", ["cargo", "test", "--workspace"], 1200),
    ]
    for name, cmd, timeout in commands:
        results.append(run_step(name, cmd, cwd=RUST_WORK_DIR, timeout=timeout, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results
    for package, rel_path in RUST_PACKAGES:
        package_path = RUST_WORK_DIR / rel_path
        if not package_path.exists():
            results.append(skip_step(f"Rust clippy {package}", f"missing package path {package_path}", critical=True))
        else:
            results.append(
                run_step(
                    f"Rust clippy {package}",
                    ["cargo", "clippy", "-p", package, "--all-targets", "--", "-D", "warnings"],
                    cwd=RUST_WORK_DIR,
                    timeout=900,
                    env=env,
                )
            )
        if results[-1].status == "FAIL" and not continue_on_error:
            return results
    return results


def e2ee_rust_steps(*, continue_on_error: bool = False) -> list[StepResult]:
    """E2EE Rust crates: fmt, clippy, test, wasm check."""
    results: list[StepResult] = []
    ensure_work_workspace()
    env = setup_isolated_env()

    # fmt check scoped to e2ee crates
    for package, _ in E2EE_RUST_CRATES:
        results.append(run_step(f"E2EE fmt {package}", ["cargo", "fmt", "--check", "-p", package], cwd=RUST_WORK_DIR, timeout=300, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results

    # clippy
    for package, rel_path in E2EE_RUST_CRATES:
        package_path = RUST_WORK_DIR / rel_path
        if not package_path.exists():
            results.append(skip_step(f"E2EE clippy {package}", f"missing package path {package_path}", critical=True))
            continue
        results.append(run_step(f"E2EE clippy {package}", ["cargo", "clippy", "-p", package, "--", "-D", "warnings"], cwd=RUST_WORK_DIR, timeout=900, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results

    # test
    for package, _ in E2EE_RUST_CRATES:
        results.append(run_step(f"E2EE test {package}", ["cargo", "test", "-p", package], cwd=RUST_WORK_DIR, timeout=1200, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results

    # wasm target check
    results.append(run_step("E2EE wasm target add", ["rustup", "target", "add", "wasm32-unknown-unknown"], cwd=RUST_WORK_DIR, timeout=120, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("E2EE wasm check", ["cargo", "check", "-p", "im-e2ee-wasm", "--target", "wasm32-unknown-unknown"], cwd=RUST_WORK_DIR, timeout=600, env=env))

    return results


def rust_bridge_steps(*, continue_on_error: bool = False) -> list[StepResult]:
    """Rust bridge: Rust im-flutter-bridge build/test + Flutter rust_bridge package."""
    results: list[StepResult] = []
    ensure_work_workspace()
    env = setup_isolated_env()

    # Rust side
    results.append(run_step("Bridge fmt", ["cargo", "fmt", "--check", "-p", "im-flutter-bridge"], cwd=RUST_WORK_DIR, timeout=300, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("Bridge check", ["cargo", "check", "-p", "im-flutter-bridge"], cwd=RUST_WORK_DIR, timeout=600, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("Bridge test", ["cargo", "test", "-p", "im-flutter-bridge"], cwd=RUST_WORK_DIR, timeout=1200, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("Bridge release build", ["cargo", "build", "-p", "im-flutter-bridge", "--release"], cwd=RUST_WORK_DIR, timeout=1200, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results

    # Flutter side: rust_bridge package only
    bridge_dir = FLUTTER_WORK_DIR / "packages" / "rust_bridge"
    if not bridge_dir.exists():
        results.append(skip_step("Flutter rust_bridge", f"missing target path {bridge_dir}", critical=True))
        return results
    results.append(run_step("Bridge flutter pub get", ["flutter", "pub", "get"], cwd=bridge_dir, timeout=600, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("Bridge flutter analyze", ["flutter", "analyze"], cwd=bridge_dir, timeout=600, env=env))
    if results[-1].status == "FAIL" and not continue_on_error:
        return results
    results.append(run_step("Bridge flutter test", ["flutter", "test"], cwd=bridge_dir, timeout=1200, env=env))

    return results


def domain_steps(command: str, args: argparse.Namespace) -> list[StepResult]:
    """Run a domain-specific test runner."""
    runner = doMAIN_RUNNERS.get(command)
    if runner is None or not runner.exists():
        return [skip_step(f"Domain {command}", f"runner not found: {runner}", critical=True)]
    cmd = [PYTHON, str(runner), "--base-url", args.api_base]
    if args.ws_base:
        cmd.extend(["--ws-base", args.ws_base])
    if args.db_url:
        cmd.extend(["--db-url", args.db_url])
    if args.continue_on_error:
        cmd.append("--continue-on-error")
    return [run_step(f"Domain {command}", cmd, cwd=ROOT, timeout=1800)]


def flutter_steps(*, coverage: bool = False, continue_on_error: bool = False) -> list[StepResult]:
    results: list[StepResult] = []

    # Ensure we have isolated workspace
    ensure_work_workspace()

    # Set environment for isolated builds
    env = setup_isolated_env()

    for target, rel_path in FLUTTER_TARGETS:
        target_dir = FLUTTER_WORK_DIR / rel_path
        if not target_dir.exists():
            results.append(skip_step(f"Flutter target {target}", f"missing target path {target_dir}", critical=True))
            if not continue_on_error:
                return results
            continue
        results.append(run_step(f"Flutter pub get {target}", ["flutter", "pub", "get"], cwd=target_dir, timeout=600, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results
        results.append(run_step(f"Flutter analyze {target}", ["flutter", "analyze"], cwd=target_dir, timeout=600, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results
        test_cmd = ["flutter", "test", "--coverage"] if coverage else ["flutter", "test"]
        results.append(run_step(f"Flutter test {target}", test_cmd, cwd=target_dir, timeout=1200, env=env))
        if results[-1].status == "FAIL" and not continue_on_error:
            return results
    return results


def dispatch(args: argparse.Namespace) -> list[StepResult]:
    if args.command in {"pr-fast", "main-full"}:
        return [
            run_step(
                f"Gray gate {args.command}",
                [PYTHON, str(TESTS_DIR / "gates" / "gray_gate.py"), "--mode", args.command],
                cwd=ROOT,
                timeout=7200,
            )
        ]
    if args.command == "gray-release":
        return [
            run_step(
                f"Gray gate {args.command}",
                [
                    PYTHON,
                    str(TESTS_DIR / "gates" / "gray_gate.py"),
                    "--mode", "gray-release",
                    "--base-url", args.api_base,
                    "--db-url", args.db_url,
                ],
                cwd=ROOT,
                timeout=7200,
            )
        ]
    if args.command == "gray-signoff":
        cmd = [
            PYTHON,
            str(TESTS_DIR / "gates" / "gray_gate.py"),
            "--mode", "gray-signoff",
            "--env", args.env,
            "--base-url", args.api_base,
            "--ws-base", args.ws_base,
            "--db-url", args.db_url,
            "--redis-url", args.redis_url,
            "--operator", args.operator,
        ]
        if args.continue_on_error:
            cmd.append("--continue-on-error")
        return [
            run_step(
                "Gray signoff gate",
                cmd,
                cwd=ROOT,
                timeout=7200,
            )
        ]
    if args.command == "rust":
        return rust_steps(continue_on_error=args.continue_on_error)
    if args.command == "flutter":
        return flutter_steps(coverage=False, continue_on_error=args.continue_on_error)
    if args.command == "coverage":
        return [
            run_step(
                "Coverage gate",
                [PYTHON, str(TESTS_DIR / "gates" / "coverage_gate.py")],
                cwd=ROOT,
                timeout=7200,
            )
        ]
    if args.command == "manifest":
        return [
            run_step(
                "Manifest gate",
                [PYTHON, str(TESTS_DIR / "gates" / "check_test_manifest.py")],
                cwd=ROOT,
                timeout=300,
            )
        ]
    if args.command == "sit":
        return [
            run_step(
                "P1 SIT gate",
                [PYTHON, str(TESTS_DIR / "sit" / "p1_sit_gate.py")],
                cwd=ROOT,
                timeout=7200,
            )
        ]
    if args.command == "e2ee-rust":
        return e2ee_rust_steps(continue_on_error=args.continue_on_error)
    if args.command == "rust-bridge":
        return rust_bridge_steps(continue_on_error=args.continue_on_error)
    if args.command in doMAIN_RUNNERS:
        return domain_steps(args.command, args)
    if args.command == "domains":
        return all_domain_steps(args)
    raise AssertionError(f"unknown command: {args.command}")


def all_domain_steps(args: argparse.Namespace) -> list[StepResult]:
    """Run all domain test runners sequentially."""
    results: list[StepResult] = []
    for name in sorted(doMAIN_RUNNERS):
        results.extend(domain_steps(name, args))
        if results[-1].status == "FAIL" and not args.continue_on_error:
            return results
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "pr-fast", "main-full", "gray-release", "gray-signoff",
            "rust", "flutter", "coverage", "manifest", "sit",
            "e2ee-rust", "rust-bridge",
            "auth", "user", "message", "message-private", "message-group",
            "social", "moments", "file", "push", "e2ee", "websocket",
            "domains",
        ],
    )
    parser.add_argument("--json", action="store_true", help="Print machine-readable summary.")
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Diagnostic mode only; formal gates fail fast.",
    )
    # Gray signoff specific args
    parser.add_argument("--env", default="local-gray", help="Gray environment name")
    parser.add_argument("--api-base", "--base-url", default=os.environ.get("IM_API_BASE", "http://localhost:8082"), help="API base URL")
    parser.add_argument("--ws-base", default=os.environ.get("IM_WS_BASE", ""), help="WebSocket base URL")
    parser.add_argument("--db-url", default=os.environ.get("IM_DB_URL", ""), help="Database URL")
    parser.add_argument("--redis-url", default=os.environ.get("REDIS_URL", ""), help="Redis URL")
    parser.add_argument("--operator", default=os.environ.get("USER", "unknown"), help="Operator name")
    return parser.parse_args()


def _guard_source(command: str, *, post: bool = False) -> None:
    """Fail fast if source directories contain build/dependency artifacts."""
    from deploy_system.source_guard import check_source_pollution

    label = "after" if post else "before"
    print(f"\n[GUARD] Source pollution check {label} '{command}'...")
    if check_source_pollution(ROOT, verbose=False):
        print(
            f"\n[ERROR] Source pollution detected {label} running tests.\n"
            "Build/dependency artifacts must not appear in source directories.\n"
            "Clean with: python scripts/imctl.py clean source-pollution\n"
            "Then use script-based commands only:",
            file=sys.stderr,
        )
        print("  python tests/test.py <gate>", file=sys.stderr)
        print("  python scripts/imctl.py build", file=sys.stderr)
        raise SystemExit(1)
    print(f"[GUARD] Source directories clean {label} '{command}'.")


def main() -> int:
    args = parse_args()
    _guard_source(args.command, post=False)
    results = dispatch(args)
    exit_code = write_gate_reports(
        f"test-{args.command}",
        args.command,
        results,
        report_base=TEST_REPORT_DIR / f"test-{args.command}",
    )
    if args.json:
        print(json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2))
    _guard_source(args.command, post=True)
    if args.continue_on_error:
        return exit_code
    return 1 if any(result.status == "FAIL" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
