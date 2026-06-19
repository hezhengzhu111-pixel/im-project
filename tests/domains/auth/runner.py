#!/usr/bin/env python3
"""Auth domain test runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from runner_base import build_base_parser, run_domain, write_report
from sit import run_auth_sit


def main() -> int:
    parser = build_base_parser("Run auth domain tests")
    args = parser.parse_args()
    results = run_domain("auth", run_auth_sit, args.base_url)
    return write_report("auth", results)


if __name__ == "__main__":
    raise SystemExit(main())
