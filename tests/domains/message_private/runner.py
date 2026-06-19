#!/usr/bin/env python3
"""Private message domain test runner."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from runner_base import build_base_parser, run_domain, write_report
from sit import run_private_message_sit


def main() -> int:
    parser = build_base_parser("Run private message domain tests")
    args = parser.parse_args()
    results = run_domain("message-private", run_private_message_sit, args.base_url)
    return write_report("message-private", results)


if __name__ == "__main__":
    raise SystemExit(main())
