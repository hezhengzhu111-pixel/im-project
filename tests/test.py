#!/usr/bin/env python3
"""Unified Rust/Flutter/SIT test entry point for local and CI gates."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR / "common"))

from gate_common import ROOT, StepResult, run_step, skip_step, write_gate_reports
from workspace import ensure_work_workspace, setup_isolated_env


PYTHON = sys.executable
TEST_REPORT_DIR = ROOT / "build" / "reports" / "test"

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
    raise AssertionError(f"unknown command: {args.command}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=["pr-fast", "main-full", "gray-release", "gray-signoff", "rust", "flutter", "coverage", "manifest", "sit"],
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


def main() -> int:
    args = parse_args()
    results = dispatch(args)
    exit_code = write_gate_reports(
        f"test-{args.command}",
        args.command,
        results,
        report_base=TEST_REPORT_DIR / f"test-{args.command}",
    )
    if args.json:
        print(json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2))
    if args.continue_on_error:
        return exit_code
    return 1 if any(result.status == "FAIL" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
