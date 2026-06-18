#!/usr/bin/env python3
"""Generate gray release build info and final report."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from gate_common import ROOT, REPORT_DIR, sanitize

def sanitize_db_url(url: str) -> str:
    """Sanitize database URL: keep scheme/user/host/port/db, mask password."""
    if not url:
        return "N/A"
    try:
        if "@" in url:
            scheme_user, rest = url.split("@", 1)
            scheme = scheme_user.split("://")[0] if "://" in scheme_user else "unknown"
            user = scheme_user.split("://")[1].split(":")[0] if "://" in scheme_user else "unknown"
            host_port_db = rest.split("?")[0]
            return f"{scheme}://{user}:***@{host_port_db}"
        return url
    except Exception:
        return "***"

def get_git_info() -> dict:
    """Get git information."""
    info = {
        "commit_sha": "",
        "branch": "",
        "is_dirty": False,
        "dirty_files": [],
        "last_commit_message": "",
    }
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            info["commit_sha"] = result.stdout.strip()
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            info["branch"] = result.stdout.strip()
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]
            if lines:
                info["is_dirty"] = True
                info["dirty_files"] = lines[:20]
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["git", "log", "-1", "--pretty=format:%s"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            info["last_commit_message"] = result.stdout.strip()
    except Exception:
        pass

    return info

def get_rust_version() -> str:
    """Get Rust toolchain version."""
    try:
        result = subprocess.run(
            ["rustc", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "N/A"

def get_flutter_version() -> str:
    """Get Flutter version."""
    try:
        result = subprocess.run(
            ["flutter", "--version"],
            capture_output=True,
            text=True,
            timeout=30,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0:
            lines = result.stdout.splitlines()
            for line in lines:
                if "Flutter" in line and "Channel" in line:
                    return line.strip()
    except Exception:
        pass
    return "N/A"

def get_python_version() -> str:
    """Get Python version."""
    return f"Python {sys.version.split()[0]}"

def get_app_version() -> str:
    """Extract app version from pubspec.yaml or Cargo.toml."""
    web_pubspec = ROOT / "flutter" / "apps" / "web" / "pubspec.yaml"
    if web_pubspec.exists():
        try:
            with open(web_pubspec, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("version:"):
                        return line.split(":", 1)[1].strip().strip('"')
        except Exception:
            pass
    return "N/A"

def generate_build_info(args: argparse.Namespace) -> dict:
    """Generate build info."""
    git_info = get_git_info()

    # Validation
    issues = []

    # Handle --commit parameter
    candidate_commit = args.commit if args.commit else git_info["commit_sha"]
    if args.commit and args.commit != git_info["commit_sha"]:
        issues.append(f"FAIL: --commit {args.commit[:12]} does not match current HEAD {git_info['commit_sha'][:12]}")
    if not candidate_commit:
        issues.append("FAIL: commit SHA is missing")
    if git_info["is_dirty"]:
        issues.append(f"FAIL: workspace is dirty ({len(git_info['dirty_files'])} files changed)")

    build_info = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_commit": candidate_commit,
        "current_head": git_info["commit_sha"],
        "commit_sha": candidate_commit,  # For backward compatibility
        "branch": git_info["branch"],
        "is_dirty": git_info["is_dirty"],
        "dirty_files": git_info["dirty_files"],
        "last_commit_message": git_info["last_commit_message"],
        "rust_version": get_rust_version(),
        "flutter_version": get_flutter_version(),
        "python_version": get_python_version(),
        "os_platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "app_version": get_app_version(),
        "api_base_url": sanitize(args.api_base) if args.api_base else "N/A",
        "ws_base_url": sanitize(args.ws_base) if args.ws_base else "N/A",
        "db_target": sanitize_db_url(args.db_url) if args.db_url else "N/A",
        "gray_environment": args.env,
        "operator": args.operator,
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "issues": issues,
        "has_critical_issue": len([i for i in issues if i.startswith("FAIL")]) > 0,
    }

    return build_info

def write_build_info_json(info: dict, output_path: Path) -> None:
    """Write build info as JSON."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2, ensure_ascii=False)

def write_build_info_md(info: dict, output_path: Path) -> None:
    """Write build info as Markdown."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# Gray Release Build Info",
        "",
        f"Generated: {info['generated_at']}",
        "",
        "## Version Control",
        "",
        f"| Field | Value |",
        f"| --- | --- |",
        f"| Commit SHA | `{info['commit_sha'][:12] if info['commit_sha'] else 'MISSING'}` |",
        f"| Branch | {info['branch']} |",
        f"| Is Dirty | {'YES' if info['is_dirty'] else 'No'} |",
        f"| Last Commit | {info['last_commit_message'][:80]} |",
        "",
        "## Build Environment",
        "",
        f"| Field | Value |",
        f"| --- | --- |",
        f"| Rust Version | {info['rust_version']} |",
        f"| Flutter Version | {info['flutter_version']} |",
        f"| Python Version | {info['python_version']} |",
        f"| OS/Platform | {info['os_platform']} |",
        f"| App Version | {info['app_version']} |",
        "",
        "## Gray Environment",
        "",
        f"| Field | Value |",
        f"| --- | --- |",
        f"| Gray Environment | {info['gray_environment']} |",
        f"| API Base URL | {info['api_base_url']} |",
        f"| WebSocket Base URL | {info['ws_base_url']} |",
        f"| Database Target | {info['db_target']} |",
        f"| Operator | {info['operator']} |",
        "",
    ]

    if info.get("issues"):
        lines.extend([
            "## Issues",
            "",
        ])
        for issue in info["issues"]:
            lines.append(f"- {issue}")
        lines.append("")

    if info.get("has_critical_issue"):
        lines.extend([
            "## ⚠️ CRITICAL ISSUE",
            "",
            "**Build info has critical issues. Review before proceeding with gray release.**",
            "",
        ])

    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

def generate_final_report(
    build_info_path: Path,
    env_check_path: Path | None,
    gate_summary_path: Path | None,
    smoke_path: Path | None,
    coverage_path: Path | None,
    manifest_path: Path | None,
    output_path: Path,
) -> int:
    """Generate final gray release report."""
    # Load build info
    try:
        with open(build_info_path, "r", encoding="utf-8") as f:
            build_info = json.load(f)
    except Exception as e:
        print(f"Error loading build info: {e}", file=sys.stderr)
        return 1

    # Load optional reports
    env_check = {}
    if env_check_path and env_check_path.exists():
        try:
            with open(env_check_path, "r", encoding="utf-8") as f:
                env_check = json.load(f)
        except Exception:
            pass

    gate_summary = {}
    if gate_summary_path and gate_summary_path.exists():
        try:
            with open(gate_summary_path, "r", encoding="utf-8") as f:
                gate_summary = json.load(f)
        except Exception:
            pass

    smoke_results = {}
    if smoke_path and smoke_path.exists():
        try:
            with open(smoke_path, "r", encoding="utf-8") as f:
                smoke_results = json.load(f)
        except Exception:
            pass

    coverage_summary = {}
    if coverage_path and coverage_path.exists():
        try:
            with open(coverage_path, "r", encoding="utf-8") as f:
                coverage_summary = json.load(f)
        except Exception:
            pass

    manifest_summary = {}
    if manifest_path and manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_summary = json.load(f)
        except Exception:
            pass

    # Determine decision
    decision = determine_decision(
        build_info,
        env_check,
        gate_summary,
        smoke_results,
        coverage_summary,
        manifest_summary,
    )

    # Generate report
    report_lines = generate_report_lines(
        build_info,
        env_check,
        gate_summary,
        smoke_results,
        coverage_summary,
        manifest_summary,
        decision,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"\nFinal report generated: {output_path}")
    return 0 if decision["decision"] == "GO" else 1

def infer_gate_status(gate_summary: dict) -> str:
    """Infer gate status from gate summary structure."""
    if not gate_summary:
        return "NOT RUN"

    summary = gate_summary.get("summary", {})
    if not summary:
        return "NOT RUN"

    fail_count = summary.get("fail", 0)
    skip_count = summary.get("skip", 0)
    pass_count = summary.get("pass", 0)

    if fail_count > 0:
        return "FAIL"
    if skip_count > 0:
        # Check if any skipped steps are critical
        steps = gate_summary.get("steps", [])
        critical_skips = [
            s for s in steps
            if s.get("status") == "SKIP" and s.get("critical", False)
        ]
        if critical_skips:
            return "FAIL"
        return "WARN"
    if pass_count > 0 and fail_count == 0 and skip_count == 0:
        return "PASS"

    return "NOT RUN"


def determine_decision(
    build_info: dict,
    env_check: dict,
    gate_summary: dict,
    smoke_results: dict,
    coverage_summary: dict,
    manifest_summary: dict,
) -> dict:
    """Determine GO/NO-GO/HOLD decision."""
    issues = []
    warnings = []

    # Check build info issues
    if build_info.get("has_critical_issue"):
        issues.append("Build info has critical issues")

    # Check environment
    env_status = env_check.get("status", "NOT RUN")
    if env_status == "FAIL":
        issues.append("Environment check FAIL")
    elif env_status == "NOT RUN":
        issues.append("Environment check NOT RUN")
    elif env_status == "WARN":
        warnings.append("Environment check WARN")

    # Check gates
    gate_status = infer_gate_status(gate_summary)
    if gate_status == "FAIL":
        issues.append("Gate check FAIL")
    elif gate_status == "NOT RUN":
        issues.append("Gate check NOT RUN")
    elif gate_status == "WARN":
        warnings.append("Gate check WARN (some steps skipped)")

    # Check smoke tests
    smoke_status = smoke_results.get("overall_status", "NOT RUN")
    smoke_summary = smoke_results.get("summary", {})
    critical_smoke_failures = [
        s for s in smoke_results.get("scenarios", [])
        if s.get("status") == "FAIL" and s.get("critical", False)
    ]
    critical_not_run = [
        s for s in smoke_results.get("scenarios", [])
        if s.get("status") == "NOT RUN" and s.get("critical", False)
    ]

    if smoke_status == "FAIL":
        if critical_smoke_failures:
            issues.append(f"Critical smoke test failures: {len(critical_smoke_failures)}")
        else:
            warnings.append("Smoke tests FAIL (non-critical)")
    elif smoke_status == "NOT RUN":
        issues.append("Smoke tests NOT RUN")
    elif smoke_status == "WARN":
        if critical_not_run:
            issues.append(f"Critical smoke tests NOT RUN: {len(critical_not_run)}")
        elif smoke_summary.get("critical_failures", 0) > 0:
            issues.append(f"Critical smoke failures: {smoke_summary['critical_failures']}")
        elif smoke_summary.get("not_run", 0) > 0:
            warnings.append(f"Smoke tests partially NOT RUN: {smoke_summary['not_run']} scenarios")
        else:
            warnings.append("Smoke tests WARN")

    # Check coverage - compatible with real JSON structure
    if not coverage_summary:
        issues.append("Coverage summary missing")
    else:
        # Check Rust coverage
        rust_summary = coverage_summary.get("rust", {})
        if not rust_summary:
            issues.append("Rust coverage summary missing")
        else:
            # Check all Rust modules for gate_passed/passed
            for module_name, module_data in rust_summary.items():
                if isinstance(module_data, dict):
                    gate_passed = module_data.get("gate_passed")
                    passed = module_data.get("passed")
                    if gate_passed is False or passed is False:
                        issues.append(f"Rust {module_name} coverage FAIL")
                    elif gate_passed is None and passed is None:
                        # No determinable field
                        issues.append(f"Rust {module_name} coverage status unknown")

        # Check Flutter coverage
        flutter_summary = coverage_summary.get("flutter", {})
        if not flutter_summary:
            issues.append("Flutter coverage summary missing")
        else:
            # Check all Flutter packages for gate_passed/passed
            for package_name, package_data in flutter_summary.items():
                if isinstance(package_data, dict):
                    gate_passed = package_data.get("gate_passed")
                    passed = package_data.get("passed")
                    if gate_passed is False or passed is False:
                        issues.append(f"Flutter {package_name} coverage FAIL")
                    elif gate_passed is None and passed is None:
                        # No determinable field
                        issues.append(f"Flutter {package_name} coverage status unknown")

    # Check manifest - compatible with real JSON structure
    if not manifest_summary:
        issues.append("Manifest summary missing")
    else:
        # Check errors field
        errors = manifest_summary.get("errors", [])
        if errors:
            issues.append(f"Manifest has {len(errors)} errors")

        # Check critical sections for missing > 0
        categories = manifest_summary.get("categories", {})
        for category_name, category_data in categories.items():
            if isinstance(category_data, dict):
                missing = category_data.get("missing", 0)
                if missing > 0:
                    issues.append(f"Manifest {category_name} has {missing} missing items")

    # Determine decision
    if issues:
        decision = "NO-GO"
        required_followup = issues
    elif warnings:
        decision = "HOLD"
        required_followup = warnings
    else:
        decision = "GO"
        required_followup = []

    return {
        "decision": decision,
        "issues": issues,
        "warnings": warnings,
        "required_followup": required_followup,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

def generate_report_lines(
    build_info: dict,
    env_check: dict,
    gate_summary: dict,
    smoke_results: dict,
    coverage_summary: dict,
    manifest_summary: dict,
    decision: dict,
) -> list[str]:
    """Generate report lines."""
    lines = [
        "# Gray Release Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "---",
        "",
        "## Decision",
        "",
        f"### {decision['decision']}",
        "",
    ]

    if decision["issues"]:
        lines.extend(["**Issues:**", ""])
        for issue in decision["issues"]:
            lines.append(f"- {issue}")
        lines.append("")

    if decision["warnings"]:
        lines.extend(["**Warnings:**", ""])
        for warning in decision["warnings"]:
            lines.append(f"- {warning}")
        lines.append("")

    if decision["required_followup"]:
        lines.extend(["**Required Follow-up:**", ""])
        for item in decision["required_followup"]:
            lines.append(f"- {item}")
        lines.append("")

    lines.extend([
        "---",
        "",
        "## Build Info",
        "",
        f"| Field | Value |",
        f"| --- | --- |",
        f"| Commit SHA | `{build_info.get('commit_sha', 'N/A')[:12]}` |",
        f"| Branch | {build_info.get('branch', 'N/A')} |",
        f"| Gray Environment | {build_info.get('gray_environment', 'N/A')} |",
        f"| App Version | {build_info.get('app_version', 'N/A')} |",
        f"| API Base URL | {build_info.get('api_base_url', 'N/A')} |",
        f"| WS Base URL | {build_info.get('ws_base_url', 'N/A')} |",
        f"| Operator | {build_info.get('operator', 'N/A')} |",
        "",
        "---",
        "",
    ])

    # Gate Results
    if gate_summary:
        lines.extend([
            "## Gate Results",
            "",
            f"| Gate | Status |",
            f"| --- | --- |",
            f"| Overall | {gate_summary.get('overall_status', 'NOT RUN')} |",
        ])
        for gate_name, gate_data in gate_summary.get("gates", {}).items():
            lines.append(f"| {gate_name} | {gate_data.get('status', 'NOT RUN')} |")
        lines.extend(["", "---", ""])

    # Environment Results
    if env_check:
        lines.extend([
            "## Environment Results",
            "",
            f"| Check | Status |",
            f"| --- | --- |",
            f"| Overall | {env_check.get('status', 'NOT RUN')} |",
        ])
        for check_name, check_data in env_check.get("checks", {}).items():
            lines.append(f"| {check_name} | {check_data.get('status', 'NOT RUN')} |")
        lines.extend(["", "---", ""])

    # Smoke Results
    if smoke_results:
        lines.extend([
            "## Smoke Test Results",
            "",
            f"| Scenario | Status | Critical |",
            f"| --- | --- | --- |",
            f"| Overall | {smoke_results.get('overall_status', 'NOT RUN')} | - |",
        ])
        for scenario in smoke_results.get("scenarios", []):
            critical = "Yes" if scenario.get("critical", False) else "No"
            lines.append(f"| {scenario.get('name', 'N/A')} | {scenario.get('status', 'NOT RUN')} | {critical} |")
        lines.extend(["", "---", ""])

    # Coverage Summary
    if coverage_summary:
        lines.extend([
            "## Coverage Summary",
            "",
            f"| Metric | Value |",
            f"| --- | --- |",
            f"| Gate Passed | {coverage_summary.get('gate_passed', 'N/A')} |",
            f"| Rust Overall | {coverage_summary.get('rust', {}).get('overall', 'N/A')}% |",
            f"| Flutter Overall | {coverage_summary.get('flutter', {}).get('overall', 'N/A')}% |",
            "",
            "---",
            "",
        ])

    # Manifest Summary
    if manifest_summary:
        lines.extend([
            "## Manifest Summary",
            "",
            f"| Category | Covered | Missing | Passed |",
            f"| --- | ---: | ---: | --- |",
        ])
        for category, data in manifest_summary.get("categories", {}).items():
            lines.append(
                f"| {category} | {data.get('covered', 0)} | {data.get('missing', 0)} | "
                f"{'✓' if data.get('passed', False) else '✗'} |"
            )
        lines.extend(["", "---", ""])

    # Known Failures
    lines.extend([
        "## Known Failures",
        "",
        "No known failures (empty allowlist).",
        "",
        "---",
        "",
        "## Risks",
        "",
    ])

    if decision["issues"]:
        lines.extend(["**Unresolved Issues:**", ""])
        for issue in decision["issues"]:
            lines.append(f"- {issue}")
        lines.append("")

    if decision["warnings"]:
        lines.extend(["**Warnings:**", ""])
        for warning in decision["warnings"]:
            lines.append(f"- {warning}")
        lines.append("")

    lines.extend([
        "---",
        "",
        "## Rollback",
        "",
        "See [rollback-runbook.md](rollback-runbook.md) for detailed rollback procedures.",
        "",
        "---",
        "",
        f"*Report generated at {decision['timestamp']}*",
        "",
    ])

    return lines

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # build-info command
    build_info_parser = subparsers.add_parser("build-info", help="Generate build info")
    build_info_parser.add_argument(
        "--env",
        required=True,
        help="Gray environment name (e.g., local-gray, staging, personal-gray)",
    )
    build_info_parser.add_argument(
        "--api-base",
        default=os.environ.get("IM_API_BASE", ""),
        help="API base URL",
    )
    build_info_parser.add_argument(
        "--ws-base",
        default=os.environ.get("IM_WS_BASE", ""),
        help="WebSocket base URL",
    )
    build_info_parser.add_argument(
        "--db-url",
        default=os.environ.get("IM_DB_URL", ""),
        help="Database URL (will be sanitized)",
    )
    build_info_parser.add_argument(
        "--commit",
        default="",
        help="Commit SHA override",
    )
    build_info_parser.add_argument(
        "--operator",
        default=os.environ.get("USER", os.environ.get("USERNAME", "unknown")),
        help="Operator name",
    )
    build_info_parser.add_argument(
        "--output-json",
        default=str(REPORT_DIR / "gray-build-info.json"),
        help="Output JSON path",
    )
    build_info_parser.add_argument(
        "--output-md",
        default=str(REPORT_DIR / "gray-build-info.md"),
        help="Output Markdown path",
    )

    # finalize command
    finalize_parser = subparsers.add_parser("finalize", help="Generate final gray release report")
    finalize_parser.add_argument("--build-info", required=True, help="Build info JSON path")
    finalize_parser.add_argument("--env-check", help="Environment check JSON path")
    finalize_parser.add_argument("--gate-summary", help="Gate summary JSON path")
    finalize_parser.add_argument("--smoke", help="Smoke test results JSON path")
    finalize_parser.add_argument("--coverage", help="Coverage summary JSON path")
    finalize_parser.add_argument("--manifest", help="Manifest summary JSON path")
    finalize_parser.add_argument(
        "--out",
        default=str(REPORT_DIR / "gray-release-report.md"),
        help="Output report path",
    )

    args = parser.parse_args()

    if args.command == "build-info":
        if args.commit:
            # Override git commit if provided
            pass
        build_info = generate_build_info(args)
        write_build_info_json(build_info, Path(args.output_json))
        write_build_info_md(build_info, Path(args.output_md))
        print(f"\nBuild info written to:\n  JSON: {args.output_json}\n  MD: {args.output_md}")
        return 1 if build_info.get("has_critical_issue") else 0

    elif args.command == "finalize":
        return generate_final_report(
            Path(args.build_info),
            Path(args.env_check) if args.env_check else None,
            Path(args.gate_summary) if args.gate_summary else None,
            Path(args.smoke) if args.smoke else None,
            Path(args.coverage) if args.coverage else None,
            Path(args.manifest) if args.manifest else None,
            Path(args.out),
        )

    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
