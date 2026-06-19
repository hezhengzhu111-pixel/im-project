#!/usr/bin/env python3
"""E2EE domain test runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from runner_base import build_base_parser, run_domain, write_report
from sit import run_e2ee_sit


def main() -> int:
    parser = build_base_parser("Run E2EE domain tests")
    args = parser.parse_args()
    results = run_domain("e2ee", run_e2ee_sit, args.base_url, args.db_url)
    return write_report("e2ee", results)


if __name__ == "__main__":
    raise SystemExit(main())
