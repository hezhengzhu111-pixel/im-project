#!/usr/bin/env python3
"""Generate Rust workspace coverage with cargo-llvm-cov."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from coverage.check_lcov_thresholds import parse_lcov  # noqa: E402
from gate_common import ROOT, run_step, skip_step, write_gate_reports  # noqa: E402


RUST_ROOT = ROOT / "rust"
OUT_DIR = ROOT / "build" / "coverage" / "rust"
THRESHOLDS = {
    "overall": 65.0,
    "api-server": 60.0,
    "im-common": 75.0,
    "im-e2ee-core": 85.0,
    "im-e2ee-ffi": 75.0,
    "im-flutter-bridge": 70.0,
}
MODULE_MARKERS = {
    "api-server": "apps/api-server/",
    "im-common": "crates/im-common/",
    "im-e2ee-core": "crates/im-e2ee-core/",
    "im-e2ee-ffi": "crates/im-e2ee-ffi/",
    "im-flutter-bridge": "crates/im-flutter-bridge/",
}
BASELINE_EPSILON = 0.01


def read_existing_baseline(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def write_baseline(summary: dict[str, dict], path: Path) -> None:
    baseline = {
        module: {
            "line_percent": item["line_percent"],
            "line_found": item["line_found"],
            "line_hit": item["line_hit"],
            "target_threshold": item["threshold"],
            "policy": "baseline must not decrease until target threshold is reached",
        }
        for module, item in summary.items()
    }
    path.write_text(json.dumps(baseline, indent=2, ensure_ascii=False), encoding="utf-8")


def apply_baseline_policy(summary: dict[str, dict], baseline: dict[str, dict]) -> list[str]:
    failed: list[str] = []
    for module, item in summary.items():
        target_passed = item["line_percent"] >= item["threshold"]
        baseline_item = baseline.get(module)
        baseline_percent = (
            float(baseline_item["line_percent"])
            if isinstance(baseline_item, dict) and "line_percent" in baseline_item
            else None
        )
        baseline_passed = baseline_percent is not None and item["line_percent"] + BASELINE_EPSILON >= baseline_percent
        item["target_passed"] = target_passed
        item["baseline_percent"] = baseline_percent
        item["baseline_passed"] = baseline_passed
        item["gate_passed"] = target_passed or baseline_passed
        item["passed"] = item["gate_passed"]
        item["mode"] = "threshold" if target_passed else "baseline"
        item["policy"] = "target threshold met" if target_passed else "baseline must not decrease until target threshold is reached"
        item["baseline_created"] = False
        if not item["gate_passed"]:
            failed.append(module)
    return failed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threshold", type=float, default=65.0)
    parser.add_argument(
        "--install-tools",
        action="store_true",
        help="Install missing cargo-llvm-cov/llvm-tools-preview instead of failing with instructions.",
    )
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    baseline_path = OUT_DIR / "baseline.json"
    existing_baseline = read_existing_baseline(baseline_path)
    results = []
    if shutil.which("cargo") is None:
        results.append(skip_step("Rust coverage prerequisites", "cargo is required for Rust coverage", critical=True))
        return write_gate_reports("rust-coverage", "coverage", results)

    if shutil.which("cargo-llvm-cov") is None:
        if not args.install_tools:
            results.append(
                skip_step(
                    "Rust coverage prerequisites",
                    "cargo-llvm-cov is missing; install with `cargo install cargo-llvm-cov --locked`",
                    critical=True,
                )
            )
            return write_gate_reports("rust-coverage", "coverage", results)
        results.append(
            run_step(
                "Install cargo-llvm-cov",
                ["cargo", "install", "cargo-llvm-cov", "--locked"],
                cwd=RUST_ROOT,
                timeout=1800,
            )
        )
        if results[-1].status == "FAIL":
            return write_gate_reports("rust-coverage", "coverage", results)

    component_check = run_step(
        "Check llvm-tools-preview",
        ["rustup", "component", "list", "--installed"],
        cwd=RUST_ROOT,
        timeout=60,
    )
    results.append(component_check)
    installed = "\n".join(component_check.stdout_tail or [])
    if component_check.status != "PASS":
        return write_gate_reports("rust-coverage", "coverage", results)
    if "llvm-tools" not in installed:
        if not args.install_tools:
            results.append(
                skip_step(
                    "Rust coverage prerequisites",
                    "llvm-tools-preview is missing; install with `rustup component add llvm-tools-preview`",
                    critical=True,
                )
            )
            return write_gate_reports("rust-coverage", "coverage", results)
        results.append(
            run_step(
                "Install llvm-tools-preview",
                ["rustup", "component", "add", "llvm-tools-preview"],
                cwd=RUST_ROOT,
                timeout=600,
            )
        )
        if results[-1].status == "FAIL":
            return write_gate_reports("rust-coverage", "coverage", results)
    lcov_path = OUT_DIR / "lcov.info"
    results.append(run_step("Rust coverage clean", ["cargo", "llvm-cov", "clean", "--workspace"], cwd=RUST_ROOT))
    if results[-1].status == "PASS":
        results.append(
            run_step(
                "Rust coverage lcov",
                ["cargo", "llvm-cov", "--workspace", "--lcov", "--output-path", str(lcov_path)],
                cwd=RUST_ROOT,
                timeout=2400,
            )
        )
    if results[-1].status == "PASS":
        results.append(run_step("Rust coverage report", ["cargo", "llvm-cov", "report"], cwd=RUST_ROOT))
    exit_code = write_gate_reports("rust-coverage", "coverage", results)
    if exit_code != 0:
        return exit_code
    parsed = parse_lcov(lcov_path)
    summary = {
        "overall": {
            "line_found": parsed["line_found"],
            "line_hit": parsed["line_hit"],
            "line_percent": parsed["line_percent"],
            "threshold": args.threshold,
            "passed": parsed["line_percent"] >= args.threshold,
        }
    }
    for module, marker in MODULE_MARKERS.items():
        found = 0
        hit = 0
        for file_name, file_summary in parsed["files"].items():
            normalized = file_name.replace("\\", "/")
            if marker in normalized:
                found += file_summary["found"]
                hit += file_summary["hit"]
        pct = 100.0 if found == 0 else round((hit / found) * 100.0, 2)
        threshold = THRESHOLDS[module]
        summary[module] = {
            "line_found": found,
            "line_hit": hit,
            "line_percent": pct,
            "threshold": threshold,
        }
    failed = apply_baseline_policy(summary, existing_baseline)
    if not existing_baseline:
        write_baseline(summary, baseline_path)
        failed = []
        for item in summary.values():
            target_passed = item["line_percent"] >= item["threshold"]
            item["target_passed"] = target_passed
            item["baseline_percent"] = item["line_percent"]
            item["baseline_passed"] = True
            item["gate_passed"] = True
            item["passed"] = True
            item["mode"] = "threshold" if target_passed else "baseline"
            item["baseline_created"] = True
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = ["# Rust Coverage Summary", ""]
    if not existing_baseline:
        lines.extend(["BASELINE CREATED: this does not mean target threshold was met.", ""])
    lines.extend(
        [
            "| module | lines hit | lines found | line % | threshold | target_passed | baseline_passed | gate_passed | mode |",
            "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
        ]
    )
    for module, item in summary.items():
        lines.append(
            f"| {module} | {item['line_hit']} | {item['line_found']} | {item['line_percent']:.2f} | "
            f"{item['threshold']:.2f} | {item['target_passed']} | {item['baseline_passed']} | "
            f"{item['gate_passed']} | {item['mode']} |"
        )
    (OUT_DIR / "coverage_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if failed:
        print(f"Rust coverage baseline/threshold failed: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
