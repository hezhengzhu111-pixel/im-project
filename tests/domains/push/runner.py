#!/usr/bin/env python3
"""Push domain test runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from runner_base import build_base_parser, run_domain, write_report
from sit import run_push_sit


def main() -> int:
    parser = build_base_parser("Run push domain tests")
    args = parser.parse_args()
    results = run_domain("push", run_push_sit, args.base_url)
    return write_report("push", results)


if __name__ == "__main__":
    raise SystemExit(main())
