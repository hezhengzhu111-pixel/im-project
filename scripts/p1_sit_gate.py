#!/usr/bin/env python3
"""P1 staged SIT gate for E2EE production hardening.

This script orchestrates local or manual-CI SIT:
  - verifies Docker / Flutter / Rust prerequisites;
  - optionally starts docker-compose.sit.yml;
  - waits for api-server health;
  - runs SQL migrations through the compose migrate service;
  - builds the Rust E2EE FFI;
  - runs the P0 gate;
  - runs P1 staged SIT scripts when present;
  - writes summary, logs, and plaintext-scan artifacts under artifacts/.

Gate semantics:
  - fail_count > 0                            → exit 1
  - pending_count > 0 without --allow-pending → exit 1
  - allowed-pending is NOT valid for P1 sign-off (explicitly annotated)
  - all pass                                  → exit 0
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from gate_common import sanitize

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ARTIFACT_ROOT = ROOT / "artifacts" / "p1-sit"

P1_REQUIRED_SCRIPTS = [
    "tests/p1_opk_lifecycle.py",
    "tests/p1_private_multidevice_fanout.py",
    "tests/p1_group_e2ee.py",
    "tests/p1_db_plaintext_scan.py",
]


@dataclass
class StepResult:
    name: str
    status: str
    exit_code: int
    log: str


def run_command(
    name: str,
    cmd: list[str],
    cwd: Path,
    artifact_dir: Path,
    timeout: int = 600,
    allow_failure: bool = False,
) -> StepResult:
    log_path = artifact_dir / f"{slug(name)}.log"
    started = datetime.now(timezone.utc).isoformat()
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"# {name}\n")
        log.write(f"started={started}\n")
        log.write(f"cwd={cwd}\n")
        log.write(f"cmd={sanitize(json.dumps(cmd))}\n\n")
        log.flush()
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(cwd),
                text=True,
                capture_output=True,
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            if proc.stdout:
                log.write(sanitize(proc.stdout))
            if proc.stderr:
                log.write(sanitize(proc.stderr))
            status = "pass" if proc.returncode == 0 else "fail"
            if allow_failure and proc.returncode != 0:
                status = "allowed-fail"
            return StepResult(name, status, proc.returncode, str(log_path))
        except subprocess.TimeoutExpired:
            log.write(f"\nTIMEOUT after {timeout}s\n")
            return StepResult(name, "fail", -1, str(log_path))


def slug(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value.lower()).strip("-")


def require_tools(tools: Iterable[str]) -> list[str]:
    missing = []
    for tool in tools:
        if shutil.which(tool) is None:
            missing.append(tool)
    return missing


def compose_cmd(compose_file: Path) -> list[str]:
    if shutil.which("docker") is None:
        return []
    return ["docker", "compose", "-f", str(compose_file)]


def wait_for_health(base_url: str, timeout: int, artifact_dir: Path) -> StepResult:
    log_path = artifact_dir / "wait-health.log"
    deadline = time.time() + timeout
    health_url = f"{base_url.rstrip('/')}/health"
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"health_url={health_url}\n")
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(health_url, timeout=5) as response:
                    body = response.read().decode("utf-8", errors="replace")
                    log.write(f"status={response.status} body={body}\n")
                    if 200 <= response.status < 300:
                        return StepResult("wait health", "pass", 0, str(log_path))
            except Exception as exc:
                log.write(f"waiting: {exc}\n")
            log.flush()
            time.sleep(3)
    return StepResult("wait health", "fail", -1, str(log_path))


def p1_stage_scripts() -> list[tuple[str, Path]]:
    return [
        ("private single-device", ROOT / "tests" / "p0_e2ee_private_text_acceptance.py"),
        ("opk lifecycle", ROOT / "tests" / "p1_opk_lifecycle.py"),
        ("private multi-device fan-out", ROOT / "tests" / "p1_private_multidevice_fanout.py"),
        ("group e2ee", ROOT / "tests" / "p1_group_e2ee.py"),
        ("db plaintext scan", ROOT / "tests" / "p1_db_plaintext_scan.py"),
    ]


def write_summary(
    results: list[StepResult],
    artifact_dir: Path,
    allow_pending: bool = False,
) -> int:
    """Write summary.md and compute exit code.

    Status classification:
      - pass
      - fail
      - pending          (script doesn't exist yet)
      - allowed-pending  (missing script with --allow-pending)
      - allowed-fail     (explicitly allowed failure)

    Exit code logic:
      - fail_count > 0                                          → 1
      - pending_count > 0 without --allow-pending               → 1
      - allowed_pending_count > 0 WITH --allow-pending          → 1 (NOT VALID FOR P1)
      - all pass                                                → 0
    """
    summary_path = artifact_dir / "summary.md"

    fail_count = sum(1 for r in results if r.status == "fail")
    pass_count = sum(1 for r in results if r.status == "pass")
    pending_count = sum(1 for r in results if r.status == "pending")
    allowed_pending_count = sum(1 for r in results if r.status == "allowed-pending")
    allowed_fail_count = sum(1 for r in results if r.status == "allowed-fail")

    # Write summary.json for machine-readable results
    summary_json = {
        "overall_status": "PASS",
        "pass": pass_count,
        "fail": fail_count,
        "pending": pending_count,
        "allowed_pending": allowed_pending_count,
        "allowed_fail": allowed_fail_count,
        "valid_for_p1_signoff": True,
    }

    with summary_path.open("w", encoding="utf-8") as out:
        out.write("# P1 SIT Summary\n\n")
        out.write(f"generated={datetime.now(timezone.utc).isoformat()}\n\n")

        if allow_pending and allowed_pending_count > 0:
            out.write("> **NOT VALID FOR P1 SIGN-OFF**\n")
            out.write("> --allow-pending was passed; pending scripts do NOT count as pass.\n\n")

        out.write("## Status Counts\n\n")
        out.write(f"| status | count |\n")
        out.write(f"| --- | ---: |\n")
        out.write(f"| pass | {pass_count} |\n")
        out.write(f"| fail | {fail_count} |\n")
        out.write(f"| pending | {pending_count} |\n")
        out.write(f"| allowed-pending | {allowed_pending_count} |\n")
        out.write(f"| allowed-fail | {allowed_fail_count} |\n")
        out.write("\n")

        out.write("## Steps\n\n")
        out.write("| step | status | exit | log |\n")
        out.write("| --- | --- | ---: | --- |\n")
        for result in results:
            out.write(
                f"| {result.name} | {result.status} | {result.exit_code} | {Path(result.log).name} |\n"
            )

        # Write gate status to summary.md
        out.write("\n## Gate Status\n\n")

    plaintext_scan = artifact_dir / "plaintext-scan.txt"
    if not plaintext_scan.exists():
        plaintext_scan.write_text(
            "Plaintext scan is produced by P0/P1 DB scan stages when DB credentials are available.\n",
            encoding="utf-8",
        )

    print(f"P1 SIT artifacts: {artifact_dir}")

    # Compute exit code and determine final status.
    gate_status = "PASS"
    exit_code = 0
    if fail_count > 0:
        gate_status = "FAIL"
        exit_code = 1
        summary_json["overall_status"] = "FAIL"
        summary_json["valid_for_p1_signoff"] = False
        print("\nP1 SIT GATE: FAIL (failures present)")
    elif pending_count > 0 and not allow_pending:
        gate_status = "FAIL"
        exit_code = 1
        summary_json["overall_status"] = "FAIL"
        summary_json["valid_for_p1_signoff"] = False
        print("\nP1 SIT GATE: FAIL (pending scripts without --allow-pending)")
    elif allowed_pending_count > 0:
        gate_status = "FAIL"
        exit_code = 1
        summary_json["overall_status"] = "FAIL"
        summary_json["valid_for_p1_signoff"] = False
        print("\nP1 SIT GATE: NOT VALID FOR P1 SIGN-OFF (allowed-pending)")
    else:
        print("\nP1 SIT GATE: PASS")

    # Append gate status to summary.md
    with summary_path.open("a", encoding="utf-8") as out:
        out.write(f"P1 SIT GATE: **{gate_status}**\n")
        if not summary_json["valid_for_p1_signoff"]:
            out.write("\n> **NOT VALID FOR P1 SIGN-OFF**\n")

    # Write summary.json
    summary_json_path = artifact_dir / "summary.json"
    with summary_json_path.open("w", encoding="utf-8") as f:
        json.dump(summary_json, f, indent=2, ensure_ascii=False)

    print(f"Summary JSON: {summary_json_path}")
    print(summary_path.read_text(encoding="utf-8"))

    return exit_code


def check_required_scripts(artifact_dir: Path) -> list[StepResult]:
    """Check that all P1-required scripts exist. Missing → fail by default."""
    results: list[StepResult] = []
    for rel_path in P1_REQUIRED_SCRIPTS:
        script_path = ROOT / rel_path
        if not script_path.exists():
            log_path = artifact_dir / f"{slug(rel_path)}-missing.log"
            log_path.write_text(
                f"FAIL: Required P1 stage script is missing: {script_path}\n"
                f"This script is mandatory for P1 sign-off.\n",
                encoding="utf-8",
            )
            results.append(StepResult(f"required: {rel_path}", "fail", 1, str(log_path)))
        else:
            results.append(StepResult(f"required: {rel_path}", "pass", 0, ""))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Run P1 staged SIT gate")
    parser.add_argument("--base-url", default=os.environ.get("IM_API_BASE", "http://localhost:8082"))
    parser.add_argument(
        "--db-url",
        default=os.environ.get(
            "IM_DB_URL",
            "mysql://root:root123@127.0.0.1:3306/service_message_service_db",
        ),
    )
    parser.add_argument("--compose-file", default=str(ROOT / "docker-compose.sit.yml"))
    parser.add_argument("--artifact-dir", default=None)
    parser.add_argument("--skip-compose", action="store_true")
    parser.add_argument("--skip-p0-gate", action="store_true")
    parser.add_argument("--health-timeout", type=int, default=180)
    parser.add_argument(
        "--allow-pending",
        action="store_true",
        help="Allow pending (missing) scripts without blocking; NOT VALID FOR P1 SIGN-OFF",
    )
    args = parser.parse_args()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    artifact_dir = Path(args.artifact_dir) if args.artifact_dir else DEFAULT_ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    results: list[StepResult] = []
    missing = require_tools(["docker", "flutter", "cargo", "rustc"])
    if missing:
        missing_log = artifact_dir / "missing-prerequisites.log"
        missing_log.write_text("\n".join(missing) + "\n", encoding="utf-8")
        results.append(StepResult("prerequisites", "fail", 1, str(missing_log)))
        return write_summary(results, artifact_dir, args.allow_pending)
    results.append(StepResult("prerequisites", "pass", 0, str(artifact_dir / "summary.md")))

    # Check required P1 scripts exist. Missing → fail (unless --allow-pending).
    required_results = check_required_scripts(artifact_dir)
    for rr in required_results:
        if rr.status == "fail":
            if args.allow_pending:
                rr.status = "allowed-pending"
            results.append(rr)
        else:
            results.append(rr)

    compose_file = Path(args.compose_file)
    compose = compose_cmd(compose_file)
    if not args.skip_compose:
        results.append(
            run_command(
                "compose up",
                [*compose, "up", "-d", "--build", "mysql", "redis", "migrate", "api-server"],
                ROOT,
                artifact_dir,
                timeout=1800,
            )
        )

    results.append(wait_for_health(args.base_url, args.health_timeout, artifact_dir))

    if not args.skip_compose:
        results.append(
            run_command(
                "run migrations",
                [*compose, "run", "--rm", "migrate"],
                ROOT,
                artifact_dir,
                timeout=300,
            )
        )

    results.append(
        run_command(
            "build rust e2ee ffi",
            ["cargo", "build", "-p", "im-e2ee-ffi", "--release"],
            ROOT / "rust",
            artifact_dir,
            timeout=1200,
        )
    )

    if not args.skip_p0_gate:
        results.append(
            run_command(
                "p0 gate",
                [
                    sys.executable,
                    str(ROOT / "scripts" / "p0_gate.py"),
                    "--base-url",
                    args.base_url,
                    "--db-url",
                    args.db_url,
                ],
                ROOT,
                artifact_dir,
                timeout=3600,
            )
        )

    for name, script in p1_stage_scripts():
        if not script.exists():
            log_path = artifact_dir / f"{slug(name)}.log"
            actual_status = "allowed-pending" if args.allow_pending else "fail"
            msg = f"pending: {script} is not implemented yet\n"
            if not args.allow_pending:
                msg += "This is a P1-required stage script. Missing → FAIL.\n"
                msg += "Re-run with --allow-pending to allow (NOT VALID FOR P1 SIGN-OFF).\n"
            log_path.write_text(msg, encoding="utf-8")
            results.append(StepResult(name, actual_status, 1, str(log_path)))
            continue
        cmd = [sys.executable, str(script), "--base-url", args.base_url]
        if "scan" in name or "private single-device" in name:
            cmd.extend(["--db-url", args.db_url])
        results.append(run_command(name, cmd, ROOT, artifact_dir, timeout=600))

    return write_summary(results, artifact_dir, args.allow_pending)


if __name__ == "__main__":
    raise SystemExit(main())
