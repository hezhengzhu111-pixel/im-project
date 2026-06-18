#!/usr/bin/env python3
"""Merge LCOV files without requiring the lcov command line tool."""

from __future__ import annotations

import argparse
from pathlib import Path


def merge(paths: list[Path], output: Path) -> int:
    output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output.open("w", encoding="utf-8") as out:
        for path in paths:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if text.strip():
                out.write(text)
                if not text.endswith("\n"):
                    out.write("\n")
                count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output")
    parser.add_argument("inputs", nargs="+")
    args = parser.parse_args()
    count = merge([Path(item) for item in args.inputs], Path(args.output))
    print(f"Merged {count} LCOV files into {args.output}")
    return 0 if count else 1


if __name__ == "__main__":
    raise SystemExit(main())
