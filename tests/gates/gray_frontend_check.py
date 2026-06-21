#!/usr/bin/env python3
"""Gray release frontend build and test verification."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TESTS_DIR / "common"))

from gate_common import ROOT, REPORT_DIR, sanitize, tail_lines
from workspace import ensure_work_workspace, setup_isolated_env

# Use build/work isolated copy, never source directory directly.
FLUTTER_WORK_DIR = ROOT / "build" / "work" / "flutter"
PYTHON = sys.executable

FRONTEND_TARGETS = [
    ("web", "apps/web", True),      # (name, relative_path, needs_build)
    ("mobile", "apps/mobile", False),
    ("desktop", "apps/desktop", False),
]


def _default_desktop_platform() -> str:
    """Infer the desktop build target from the current platform."""
    if sys.platform.startswith("win32"):
        return "windows"
    if sys.platform.startswith("darwin"):
        return "macos"
    if sys.platform.startswith("linux"):
        return "linux"
    return ""


def _desktop_build_cmd(platform: str) -> list[str] | None:
    """Return the flutter build command for the requested desktop platform."""
    if platform in ("windows", "macos", "linux"):
        return ["flutter", "build", platform]
    return None


def _use_shell_for_command(cmd: list[str]) -> bool:
    """Windows needs shell=True to execute flutter.bat via CreateProcess."""
    if not sys.platform.startswith("win32"):
        return False
    executable = shutil.which(cmd[0])
    if executable is None:
        return False
    return executable.lower().endswith((".bat", ".cmd"))


def run_flutter_step(name: str, cmd: list, cwd: Path, timeout: int = 600, env: dict[str, str] | None = None) -> dict:
    """Run a Flutter step and return result."""
    started = time.time()
    use_shell = _use_shell_for_command(cmd)
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            env=env,
            shell=use_shell,
        )
        duration = time.time() - started
        status = "PASS" if proc.returncode == 0 else "FAIL"
        return {
            "name": name,
            "status": status,
            "exit_code": proc.returncode,
            "duration_seconds": round(duration, 3),
            "stdout_tail": tail_lines(proc.stdout, limit=20),
            "stderr_tail": tail_lines(proc.stderr, limit=20),
        }
    except FileNotFoundError as exc:
        duration = time.time() - started
        return {
            "name": name,
            "status": "FAIL",
            "exit_code": 127,
            "duration_seconds": round(duration, 3),
            "error": f"command not found: {exc.filename}",
        }
    except subprocess.TimeoutExpired:
        duration = time.time() - started
        return {
            "name": name,
            "status": "FAIL",
            "exit_code": -1,
            "duration_seconds": round(duration, 3),
            "error": f"timeout after {timeout}s",
        }


def check_target(
    name: str,
    rel_path: str,
    needs_build: bool,
    env: str,
    api_base: str,
    ws_base: str,
    skip_web_build: bool = False,
    desktop_build: bool = False,
    desktop_platform: str = "",
) -> dict:
    """Check a single frontend target."""
    target_dir = FLUTTER_WORK_DIR / rel_path
    steps = []
    isolated_env = setup_isolated_env()

    if not target_dir.exists():
        return {
            "status": "FAIL",
            "error": f"Target path does not exist: {target_dir}",
            "steps": [],
        }

    # Check if Flutter is available
    if not shutil.which("flutter"):
        return {
            "status": "FAIL",
            "error": "Flutter not found in PATH",
            "steps": [],
        }

    # Step 1: flutter pub get
    steps.append(run_flutter_step(
        f"{name} pub get",
        ["flutter", "pub", "get"],
        target_dir,
        timeout=600,
        env=isolated_env,
    ))
    if steps[-1]["status"] == "FAIL":
        return {"status": "FAIL", "steps": steps}

    # Step 2: flutter analyze
    steps.append(run_flutter_step(
        f"{name} analyze",
        ["flutter", "analyze"],
        target_dir,
        timeout=600,
        env=isolated_env,
    ))
    if steps[-1]["status"] == "FAIL":
        return {"status": "FAIL", "steps": steps}

    # Step 3: flutter test
    steps.append(run_flutter_step(
        f"{name} test",
        ["flutter", "test"],
        target_dir,
        timeout=1200,
        env=isolated_env,
    ))
    if steps[-1]["status"] == "FAIL":
        return {"status": "FAIL", "steps": steps}

    # Step 4: flutter build web (only for web target)
    if needs_build and not skip_web_build:
        build_cmd = [
            "flutter", "build", "web",
            f"--dart-define=APP_ENV={env}",
            f"--dart-define=API_BASE_URL={api_base}",
            f"--dart-define=WS_BASE_URL={ws_base}",
        ]
        steps.append(run_flutter_step(
            f"{name} build web",
            build_cmd,
            target_dir,
            timeout=1800,
            env=isolated_env,
        ))
        if steps[-1]["status"] == "FAIL":
            return {"status": "FAIL", "steps": steps}
    elif needs_build and skip_web_build:
        steps.append({
            "name": f"{name} build web",
            "status": "SKIP",
            "reason": "skip_web_build=true (diagnostic mode)",
        })

    # Step 5: desktop build (only when explicitly requested)
    if name == "desktop":
        if desktop_build:
            platform = desktop_platform or _default_desktop_platform()
            build_cmd = _desktop_build_cmd(platform)
            if build_cmd is None:
                steps.append({
                    "name": f"{name} build desktop",
                    "status": "NOT RUN",
                    "reason": f"unsupported_desktop_platform: {platform}",
                })
            else:
                steps.append(run_flutter_step(
                    f"{name} build {platform}",
                    build_cmd,
                    target_dir,
                    timeout=1800,
                    env=isolated_env,
                ))
                if steps[-1]["status"] == "FAIL":
                    return {"status": "FAIL", "steps": steps}
        else:
            steps.append({
                "name": f"{name} build desktop",
                "status": "NOT RUN",
                "reason": "desktop_build_not_requested",
            })

    # All steps passed
    all_passed = all(s["status"] in ("PASS", "SKIP", "NOT RUN") for s in steps)
    any_failed = any(s["status"] == "FAIL" for s in steps)
    any_not_run = any(s["status"] == "NOT RUN" for s in steps)
    if any_failed:
        status = "FAIL"
    elif all_passed and any_not_run:
        status = "PASS_WITH_NOT_RUN"
    elif all_passed:
        status = "PASS"
    else:
        status = "FAIL"
    return {
        "status": status,
        "steps": steps,
    }


def run_frontend_check(
    env: str,
    api_base: str,
    ws_base: str,
    skip_web_build: bool = False,
    desktop_build: bool = False,
    desktop_platform: str = "",
) -> dict:
    """Run frontend build and test verification for all targets."""
    ensure_work_workspace()
    print(f"\n{'='*60}")
    print(f"Frontend Build/Test Verification")
    print(f"Environment: {env}")
    print(f"API Base: {api_base}")
    print(f"WS Base: {ws_base}")
    print(f"Skip Web Build: {skip_web_build}")
    print(f"Desktop Build: {desktop_build}")
    if desktop_build:
        print(f"Desktop Platform: {desktop_platform or _default_desktop_platform()}")
    print(f"{'='*60}")

    started = time.time()
    targets = {}

    for name, rel_path, needs_build in FRONTEND_TARGETS:
        print(f"\n==> Checking {name}...")
        result = check_target(
            name=name,
            rel_path=rel_path,
            needs_build=needs_build,
            env=env,
            api_base=api_base,
            ws_base=ws_base,
            skip_web_build=skip_web_build,
            desktop_build=desktop_build,
            desktop_platform=desktop_platform,
        )
        targets[name] = result
        print(f"  {name}: {result['status']}")

    duration = time.time() - started

    # Determine overall status
    statuses = [t["status"] for t in targets.values()]
    if "FAIL" in statuses:
        overall_status = "FAIL"
    elif "NOT RUN" in statuses:
        overall_status = "NOT RUN"
    elif "WARN" in statuses:
        overall_status = "WARN"
    elif "PASS_WITH_NOT_RUN" in statuses:
        overall_status = "PASS_WITH_NOT_RUN"
    else:
        overall_status = "PASS"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": overall_status,
        "duration_seconds": round(duration, 3),
        "targets": targets,
    }


def write_reports(results: dict, output_json: Path, output_md: Path) -> None:
    """Write results as JSON and Markdown."""
    output_json.parent.mkdir(parents=True, exist_ok=True)

    # JSON
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Markdown
    lines = [
        "# Frontend Build/Test Results",
        "",
        f"Generated: {results['generated_at']}",
        f"Overall Status: **{results['status']}**",
        f"Duration: {results['duration_seconds']:.2f}s",
        "",
        "## Targets",
        "",
        "| Target | Status | Steps |",
        "| --- | --- | --- |",
    ]

    for target_name, target_data in results.get("targets", {}).items():
        status = target_data["status"]
        steps_count = len(target_data.get("steps", []))
        lines.append(f"| {target_name} | {status} | {steps_count} steps |")

    lines.extend(["", "---", ""])

    # Detailed results per target
    for target_name, target_data in results.get("targets", {}).items():
        lines.extend([
            f"## {target_name}",
            "",
            f"Status: **{target_data['status']}**",
            "",
        ])

        if target_data.get("error"):
            lines.append(f"Error: {target_data['error']}")
            lines.append("")

        if target_data.get("steps"):
            lines.extend([
                "| Step | Status | Duration | Error |",
                "| --- | --- | ---: | --- |",
            ])
            for step in target_data["steps"]:
                status = step["status"]
                duration = step.get("duration_seconds", 0)
                error = step.get("error", "")
                reason = step.get("reason", "")
                if not error and reason:
                    error = reason
                if not error and step.get("exit_code") and step["exit_code"] != 0:
                    error = f"exit code {step['exit_code']}"
                lines.append(f"| {step['name']} | {status} | {duration:.2f}s | {error} |")
            lines.append("")

    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env",
        default=os.environ.get("APP_ENV", "gray"),
        help="Environment name",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("IM_API_BASE", "http://localhost:8082"),
        help="API base URL",
    )
    parser.add_argument(
        "--ws-base",
        default=os.environ.get("IM_WS_BASE", ""),
        help="WebSocket base URL",
    )
    parser.add_argument(
        "--skip-web-build",
        action="store_true",
        help="Skip web build (diagnostic mode only)",
    )
    parser.add_argument(
        "--desktop-build",
        action="store_true",
        help="Run the desktop build for the current platform (or --desktop-platform)",
    )
    parser.add_argument(
        "--desktop-platform",
        default="",
        help="Desktop build target: windows, macos, or linux (default: infer from sys.platform)",
    )
    parser.add_argument(
        "--output-json",
        default=str(REPORT_DIR / "gray-frontend-build.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--output-md",
        default=str(REPORT_DIR / "gray-frontend-build.md"),
        help="Output Markdown path",
    )

    args = parser.parse_args()

    results = run_frontend_check(
        env=args.env,
        api_base=args.api_base,
        ws_base=args.ws_base,
        skip_web_build=args.skip_web_build,
        desktop_build=args.desktop_build,
        desktop_platform=args.desktop_platform,
    )

    write_reports(results, Path(args.output_json), Path(args.output_md))

    print(f"\n{'='*60}")
    print(f"Overall Status: {results['status']}")
    print(f"Reports written to:\n  JSON: {args.output_json}\n  MD: {args.output_md}")

    return 0 if results["status"] in ("PASS", "PASS_WITH_NOT_RUN") else 1


if __name__ == "__main__":
    raise SystemExit(main())
