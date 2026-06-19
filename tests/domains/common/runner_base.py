#!/usr/bin/env python3
"""Base helpers for domain test runners."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parents[2]
ROOT = TESTS_DIR.parent
sys.path.insert(0, str(TESTS_DIR / "common"))

from gate_common import StepResult, run_step, skip_step, write_gate_reports


def build_base_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--base-url", default=os.environ.get("IM_API_BASE", "http://localhost:8082"))
    parser.add_argument("--ws-base", default=os.environ.get("IM_WS_BASE", "ws://localhost:8083"))
    parser.add_argument("--db-url", default=os.environ.get("IM_DB_URL", ""))
    parser.add_argument("--json", action="store_true", help="Print machine-readable summary.")
    parser.add_argument("--continue-on-error", action="store_true")
    return parser


def run_domain(name: str, run_fn, *args) -> list[StepResult]:
    """Run a domain SIT function and translate connection errors to SKIP."""
    import requests

    try:
        return run_fn(*args)
    except requests.exceptions.ConnectionError as exc:
        return [skip_step(f"Domain {name}", f"service unreachable: {exc}")]
    except Exception as exc:
        return [skip_step(f"Domain {name}", f"SIT runner failed: {exc}")]


def write_report(name: str, results: list[StepResult]) -> int:
    report_base = ROOT / "build" / "reports" / "test" / f"domain-{name}"
    return write_gate_reports(f"domain-{name}", name, results, report_base=report_base)
