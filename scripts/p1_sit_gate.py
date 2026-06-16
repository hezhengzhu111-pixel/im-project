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
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ARTIFACT_ROOT = ROOT / "artifacts" / "p1-sit"


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
        log.write(f"cmd={json.dumps(cmd)}\n\n")
        log.flush()
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(cwd),
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=timeout,
            )
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


def write_summary(results: list[StepResult], artifact_dir: Path) -> int:
    summary_path = artifact_dir / "summary.md"
    fail_count = sum(1 for result in results if result.status == "fail")
    with summary_path.open("w", encoding="utf-8") as out:
        out.write("# P1 SIT Summary\n\n")
        out.write(f"generated={datetime.now(timezone.utc).isoformat()}\n\n")
        out.write("| step | status | exit | log |\n")
        out.write("| --- | --- | ---: | --- |\n")
        for result in results:
            out.write(
                f"| {result.name} | {result.status} | {result.exit_code} | {Path(result.log).name} |\n"
            )
    plaintext_scan = artifact_dir / "plaintext-scan.txt"
    if not plaintext_scan.exists():
        plaintext_scan.write_text(
            "Plaintext scan is produced by P0/P1 DB scan stages when DB credentials are available.\n",
            encoding="utf-8",
        )
    print(f"P1 SIT artifacts: {artifact_dir}")
    print(summary_path.read_text(encoding="utf-8"))
    return 1 if fail_count else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run P1 staged SIT gate")
    parser.add_argument("--base-url", default="http://localhost:8082")
    parser.add_argument(
        "--db-url",
        default="mysql://root:root123@127.0.0.1:3306/service_message_service_db",
    )
    parser.add_argument("--compose-file", default=str(ROOT / "docker-compose.sit.yml"))
    parser.add_argument("--artifact-dir", default=None)
    parser.add_argument("--skip-compose", action="store_true")
    parser.add_argument("--skip-p0-gate", action="store_true")
    parser.add_argument("--health-timeout", type=int, default=180)
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
        return write_summary(results, artifact_dir)
    results.append(StepResult("prerequisites", "pass", 0, str(artifact_dir / "summary.md")))

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
            log_path.write_text(f"pending: {script} is not implemented yet\n", encoding="utf-8")
            results.append(StepResult(name, "pending", 0, str(log_path)))
            continue
        cmd = [sys.executable, str(script), "--base-url", args.base_url]
        if "scan" in name or "private single-device" in name:
            cmd.extend(["--db-url", args.db_url])
        results.append(run_command(name, cmd, ROOT, artifact_dir, timeout=600))

    return write_summary(results, artifact_dir)


if __name__ == "__main__":
    raise SystemExit(main())
