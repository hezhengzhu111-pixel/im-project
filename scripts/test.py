#!/usr/bin/env python3
"""Deprecated wrapper for the unified test entry point.

Use `python tests/test.py ...` instead. This wrapper exists only for short-term
compatibility and should be removed during the final cleanup batch.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    print(
        "DEPRECATED: use `python tests/test.py ...`; scripts/test.py will be removed in Batch 6.",
        file=sys.stderr,
    )
    sys.argv[0] = str(ROOT / "tests" / "test.py")
    runpy.run_path(sys.argv[0], run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
