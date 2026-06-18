#!/usr/bin/env python3
"""Generate Flutter coverage for each package/app and aggregate summaries."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from coverage.check_lcov_thresholds import parse_lcov  # noqa: E402
from coverage.merge_lcov import merge  # noqa: E402
from gate_common import ROOT, run_step, skip_step, write_gate_reports  # noqa: E402


FLUTTER_ROOT = ROOT / "flutter"
OUT_DIR = ROOT / "build" / "coverage" / "flutter"
TARGETS = {
    "core": FLUTTER_ROOT / "packages" / "core",
    "core_flutter": FLUTTER_ROOT / "packages" / "core_flutter",
    "shared_features": FLUTTER_ROOT / "packages" / "shared_features",
    "web": FLUTTER_ROOT / "apps" / "web",
    "mobile": FLUTTER_ROOT / "apps" / "mobile",
    "desktop": FLUTTER_ROOT / "apps" / "desktop",
}
THRESHOLDS = {
    "core": 85.0,
    "core_flutter": 75.0,
    "shared_features": 75.0,
    "web": 60.0,
    "mobile": 60.0,
    "desktop": 60.0,
    "overall": 70.0,
}
BASELINE_EPSILON = 0.01


def write_summary_md(summary: dict[str, dict], path: Path) -> None:
    lines = [
        "# Flutter Coverage Summary",
        "",
    ]
    if any(isinstance(item, dict) and item.get("baseline_created") for item in summary.values()):
        lines.extend(["BASELINE CREATED: this does not mean target threshold was met.", ""])
    lines.extend(
        [
            "| target | lines hit | lines found | line % | threshold | target_passed | baseline_passed | gate_passed | mode |",
            "| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
        ]
    )
    for target, item in summary.items():
        if target == "files":
            continue
        lines.append(
            f"| {target} | {item['line_hit']} | {item['line_found']} | {item['line_percent']:.2f} | "
            f"{item['threshold']:.2f} | {item['target_passed']} | {item['baseline_passed']} | "
            f"{item['gate_passed']} | {item['mode']} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_baseline(summary: dict[str, dict], path: Path) -> None:
    baseline = {
        target: {
            "line_percent": item["line_percent"],
            "line_found": item["line_found"],
            "line_hit": item["line_hit"],
            "target_threshold": item["threshold"],
            "policy": "baseline must not decrease until target threshold is reached",
        }
        for target, item in summary.items()
        if isinstance(item, dict) and "line_percent" in item
    }
    path.write_text(json.dumps(baseline, indent=2, ensure_ascii=False), encoding="utf-8")


def read_existing_baseline(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def apply_baseline_policy(summary: dict[str, dict], baseline: dict[str, dict]) -> list[str]:
    failed: list[str] = []
    for target, item in summary.items():
        if not isinstance(item, dict) or "line_percent" not in item:
            continue
        target_passed = item["line_percent"] >= item["threshold"]
        baseline_item = baseline.get(target)
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
            failed.append(target)
    return failed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-run", action="store_true", help="Only parse existing lcov.info files.")
    args = parser.parse_args()
    if shutil.which("flutter") is None and not args.skip_run:
        print("flutter is required for Flutter coverage")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    baseline_path = OUT_DIR / "baseline.json"
    existing_baseline = read_existing_baseline(baseline_path)
    results = []
    lcovs: list[Path] = []
    summary: dict[str, dict] = {}
    for target, target_dir in TARGETS.items():
        if not target_dir.exists():
            results.append(skip_step(f"Flutter coverage {target}", f"missing target path {target_dir}", critical=True))
            continue
        if not args.skip_run:
            results.append(run_step(f"Flutter coverage {target}", ["flutter", "test", "--coverage"], cwd=target_dir, timeout=1200))
            if results[-1].status == "FAIL":
                continue
        lcov_path = target_dir / "coverage" / "lcov.info"
        if not lcov_path.exists():
            print(f"Missing coverage file: {lcov_path}")
            return 1
        target_out = OUT_DIR / target / "lcov.info"
        target_out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(lcov_path, target_out)
        lcovs.append(target_out)
        item = parse_lcov(target_out)
        item["threshold"] = THRESHOLDS[target]
        summary[target] = item
    combined = OUT_DIR / "combined_lcov.info"
    if not lcovs or merge(lcovs, combined) == 0:
        return 1
    overall = parse_lcov(combined)
    overall["threshold"] = THRESHOLDS["overall"]
    summary["overall"] = overall
    threshold_failed = apply_baseline_policy(summary, existing_baseline)
    if not existing_baseline:
        write_baseline(summary, baseline_path)
        threshold_failed = []
        for item in summary.values():
            if not isinstance(item, dict) or "line_percent" not in item:
                continue
            target_passed = item["line_percent"] >= item["threshold"]
            item["target_passed"] = target_passed
            item["baseline_percent"] = item["line_percent"]
            item["baseline_passed"] = True
            item["gate_passed"] = True
            item["passed"] = True
            item["mode"] = "threshold" if target_passed else "baseline"
            item["baseline_created"] = True
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    write_summary_md(summary, OUT_DIR / "coverage_summary.md")
    exit_code = write_gate_reports("flutter-coverage", "coverage", results)
    if threshold_failed:
        print(f"Flutter coverage baseline/threshold failed: {', '.join(threshold_failed)}")
        return 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
