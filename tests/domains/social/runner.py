#!/usr/bin/env python3
"""Social domain test runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from runner_base import build_base_parser, run_domain, write_report
from sit import run_social_sit


def main() -> int:
    parser = build_base_parser("Run social domain tests")
    args = parser.parse_args()
    results = run_domain("social", run_social_sit, args.base_url)
    return write_report("social", results)


if __name__ == "__main__":
    raise SystemExit(main())
