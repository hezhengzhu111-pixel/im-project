#!/usr/bin/env python3
"""Shared helpers for local and CI test gates."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence


ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT / "build" / "reports"
GATE_REPORT_DIR = REPORT_DIR / "gates"

SECRET_PATTERNS = [
    re.compile(r"(?i)(token|secret|password|api[_-]?key)(\s*[:=]\s*)([^\s,'\"}]+)"),
    re.compile(r"(?i)(--[^\s]*(?:token|secret|password|api[_-]?key)[^\s]*)(\s+)([^\s]+)"),
    re.compile(r"(?i)(mysql://[^:\s]+:)([^@\s]+)(@)"),
    re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE),
]


@dataclass
class StepResult:
    name: str
    status: str
    exit_code: int | None
    duration_seconds: float
    command: str
    cwd: str
    reason: str = ""
    stdout_tail: list[str] | None = None
    stderr_tail: list[str] | None = None


def repo_root() -> Path:
    return ROOT


def ensure_report_dir() -> Path:
    GATE_REPORT_DIR.mkdir(parents=True, exist_ok=True)
    return GATE_REPORT_DIR


def sanitize(text: str) -> str:
    sanitized = text
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub(
            lambda m: (
                f"{m.group(1)}{m.group(2)}***"
                if m.lastindex and m.lastindex >= 3 and m.group(2).strip() == ""
                else f"{m.group(1)}***{m.group(3)}"
                if m.lastindex and m.lastindex >= 3 and m.group(1).lower().startswith("mysql://")
                else f"{m.group(1)}{m.group(2)}***"
                if m.lastindex and m.lastindex >= 2
                else "secret***"
            ),
            sanitized,
        )
    return sanitized


def safe_print(line: str, *, stream=None) -> None:
    target = stream or sys.stdout
    encoding = getattr(target, "encoding", None) or "utf-8"
    safe = line.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe, file=target)


def tail_lines(text: str, limit: int = 40) -> list[str]:
    if not text:
        return []
    return sanitize(text).splitlines()[-limit:]


def command_text(cmd: Sequence[str] | str) -> str:
    if isinstance(cmd, str):
        return cmd
    return " ".join(cmd)


def resolve_command(cmd: Sequence[str] | str) -> Sequence[str] | str:
    if isinstance(cmd, str) or not cmd:
        return cmd
    resolved = shutil.which(cmd[0])
    if not resolved:
        return cmd
    return [resolved, *cmd[1:]]


def run_step(
    name: str,
    cmd: Sequence[str] | str,
    *,
    cwd: Path | None = None,
    timeout: int = 600,
    critical: bool = True,
    env: dict[str, str] | None = None,
) -> StepResult:
    started = time.time()
    actual_cwd = cwd or ROOT
    printable = command_text(cmd)
    safe_print(f"\n==> {name}")
    safe_print(f"cwd: {actual_cwd}")
    safe_print(f"cmd: {sanitize(printable)}")
    sys.stdout.flush()
    try:
        actual_cmd = resolve_command(cmd)
        proc = subprocess.run(
            actual_cmd,
            cwd=str(actual_cwd),
            text=True,
            capture_output=True,
            timeout=timeout,
            shell=isinstance(cmd, str),
            env={**os.environ, **(env or {})},
            encoding="utf-8",
            errors="replace",
        )
        duration = time.time() - started
        stdout = tail_lines(proc.stdout)
        stderr = tail_lines(proc.stderr)
        for line in stdout:
            safe_print(line)
        for line in stderr:
            safe_print(line, stream=sys.stderr)
        status = "PASS" if proc.returncode == 0 else "FAIL"
        safe_print(f"{status} {name} ({duration:.2f}s)")
        return StepResult(
            name=name,
            status=status,
            exit_code=proc.returncode,
            duration_seconds=round(duration, 3),
            command=sanitize(printable),
            cwd=str(actual_cwd),
            stdout_tail=stdout,
            stderr_tail=stderr,
        )
    except FileNotFoundError as exc:
        duration = time.time() - started
        status = "FAIL" if critical else "SKIP"
        reason = f"command not found: {exc.filename}"
        print(f"{status} {name}: {reason}")
        return StepResult(name, status, 127, round(duration, 3), sanitize(printable), str(actual_cwd), reason)
    except subprocess.TimeoutExpired as exc:
        duration = time.time() - started
        reason = f"timeout after {timeout}s"
        print(f"FAIL {name}: {reason}")
        return StepResult(
            name=name,
            status="FAIL",
            exit_code=-1,
            duration_seconds=round(duration, 3),
            command=sanitize(printable),
            cwd=str(actual_cwd),
            reason=reason,
            stdout_tail=tail_lines(exc.stdout or ""),
            stderr_tail=tail_lines(exc.stderr or ""),
        )


def skip_step(name: str, reason: str, *, critical: bool = False) -> StepResult:
    status = "FAIL" if critical else "SKIP"
    print(f"{status} {name}: {reason}")
    return StepResult(name, status, None, 0.0, "", str(ROOT), reason)


def write_gate_reports(
    name: str,
    mode: str,
    results: Iterable[StepResult],
    *,
    report_base: Path | None = None,
) -> int:
    result_list = list(results)
    report_dir = ensure_report_dir()
    base = report_base or (report_dir / name)
    json_path = base.with_suffix(".json")
    md_path = base.with_suffix(".md")
    fail_count = sum(1 for result in result_list if result.status == "FAIL")
    skip_count = sum(1 for result in result_list if result.status == "SKIP")
    pass_count = sum(1 for result in result_list if result.status == "PASS")
    payload = {
        "name": name,
        "mode": mode,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {"pass": pass_count, "fail": fail_count, "skip": skip_count},
        "steps": [asdict(result) for result in result_list],
    }
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [
        f"# {name} ({mode})",
        "",
        f"Generated: {payload['generated_at']}",
        "",
        "| status | count |",
        "| --- | ---: |",
        f"| PASS | {pass_count} |",
        f"| FAIL | {fail_count} |",
        f"| SKIP | {skip_count} |",
        "",
        "## Steps",
        "",
        "| step | status | exit | duration | reason |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    for result in result_list:
        reason = result.reason.replace("|", "\\|") if result.reason else ""
        lines.append(
            f"| {result.name} | {result.status} | {'' if result.exit_code is None else result.exit_code} | "
            f"{result.duration_seconds:.2f}s | {reason} |"
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nReports written: {json_path} and {md_path}")
    return 1 if fail_count else 0


def run_all(results: list[StepResult], continue_on_error: bool = False) -> int:
    failed = any(result.status == "FAIL" for result in results)
    if failed and not continue_on_error:
        return 1
    return 1 if failed else 0
