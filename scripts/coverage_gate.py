#!/usr/bin/env python3
"""Run Rust and Flutter coverage generation and aggregate summaries."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from gate_common import ROOT, run_step, write_gate_reports


PYTHON = sys.executable
OUT_DIR = ROOT / "build" / "reports" / "coverage"
REPORT_DIR = ROOT / "build" / "reports" / "coverage"


def write_combined_summary() -> None:
    rust = OUT_DIR / "rust" / "summary.json"
    flutter = OUT_DIR / "flutter" / "summary.json"
    payload = {
        "rust": json.loads(rust.read_text(encoding="utf-8")) if rust.exists() else None,
        "flutter": json.loads(flutter.read_text(encoding="utf-8")) if flutter.exists() else None,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    (REPORT_DIR / "coverage-summary.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = ["# Coverage Summary", ""]
    if payload["rust"]:
        rust_item = payload["rust"]["overall"]
        lines.append(
            f"- Rust overall: {rust_item['line_percent']:.2f}% "
            f"(threshold {rust_item['threshold']:.2f}%)"
        )
        for module, item in payload["rust"].items():
            if module == "overall":
                continue
            lines.append(
                f"- Rust {module}: {item['line_percent']:.2f}% "
                f"(threshold {item['threshold']:.2f}%)"
            )
    if payload["flutter"]:
        for target, item in payload["flutter"].items():
            if target == "files":
                continue
            lines.append(
                f"- Flutter {target}: {item['line_percent']:.2f}% "
                f"(threshold {item['threshold']:.2f}%)"
            )
    (REPORT_DIR / "coverage-summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-rust", action="store_true")
    parser.add_argument("--skip-flutter", action="store_true")
    args = parser.parse_args()
    results = []
    if not args.skip_rust:
        results.append(
            run_step(
                "Rust coverage",
                [PYTHON, str(ROOT / "scripts" / "coverage" / "rust_coverage.py")],
                cwd=ROOT,
                timeout=3600,
            )
        )
    if not args.skip_flutter:
        results.append(
            run_step(
                "Flutter coverage",
                [PYTHON, str(ROOT / "scripts" / "coverage" / "flutter_coverage.py")],
                cwd=ROOT,
                timeout=7200,
            )
        )
    if all(result.status == "PASS" for result in results):
        write_combined_summary()
    return write_gate_reports("coverage-gate", "coverage", results)


if __name__ == "__main__":
    raise SystemExit(main())
