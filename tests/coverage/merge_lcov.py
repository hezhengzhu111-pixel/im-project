#!/usr/bin/env python3
"""Helpers for merging multiple LCOV reports."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path


def merge(lcov_paths: list[Path | str], output_path: Path | str) -> int:
    """Merge several LCOV files into one.

    Duplicate source files have their per-line hit counts summed.
    Returns the number of source files in the merged report.
    """
    output_path = Path(output_path)
    records: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for lcov_path in lcov_paths:
        lcov_path = Path(lcov_path)
        if not lcov_path.is_file():
            continue
        current_file: str | None = None
        for raw_line in lcov_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if line.startswith("SF:"):
                current_file = line[3:]
            elif line.startswith("DA:") and current_file is not None:
                parts = line[3:].split(",")
                if len(parts) >= 2:
                    line_no = parts[0]
                    try:
                        count = int(parts[1])
                    except ValueError:
                        continue
                    records[current_file][line_no] += count
            elif line == "end_of_record":
                current_file = None

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as out:
        for file_name, lines in records.items():
            out.write(f"SF:{file_name}\n")
            total_found = len(lines)
            total_hit = sum(1 for count in lines.values() if count > 0)
            for line_no in sorted(lines.keys(), key=int):
                out.write(f"DA:{line_no},{lines[line_no]}\n")
            out.write(f"LF:{total_found}\n")
            out.write(f"LH:{total_hit}\n")
            out.write("end_of_record\n")

    return len(records)
