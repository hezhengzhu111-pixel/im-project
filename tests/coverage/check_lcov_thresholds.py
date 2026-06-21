#!/usr/bin/env python3
"""Helpers for parsing LCOV coverage reports."""
from __future__ import annotations

from pathlib import Path


def parse_lcov(lcov_path: Path | str) -> dict:
    """Parse an LCOV file and return a summary dict.

    Returns:
        {
            "line_found": int,
            "line_hit": int,
            "line_percent": float,
            "files": {
                "path/to/file.dart": {"found": int, "hit": int, "percent": float},
                ...
            },
        }
    """
    lcov_path = Path(lcov_path)
    if not lcov_path.is_file():
        return {"line_found": 0, "line_hit": 0, "line_percent": 0.0, "files": {}}

    text = lcov_path.read_text(encoding="utf-8", errors="replace")
    files: dict[str, dict] = {}
    current_file: str | None = None
    current_found = 0
    current_hit = 0

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("SF:"):
            current_file = line[3:]
            current_found = 0
            current_hit = 0
        elif line.startswith("DA:") and current_file is not None:
            # DA:<line>,<count>[,<checksum>]
            parts = line[3:].split(",")
            if len(parts) >= 2:
                try:
                    count = int(parts[1])
                except ValueError:
                    continue
                current_found += 1
                if count > 0:
                    current_hit += 1
        elif line.startswith("LF:") and current_file is not None:
            try:
                current_found = int(line[3:])
            except ValueError:
                pass
        elif line.startswith("LH:") and current_file is not None:
            try:
                current_hit = int(line[3:])
            except ValueError:
                pass
        elif line == "end_of_record" and current_file is not None:
            pct = 100.0 if current_found == 0 else round((current_hit / current_found) * 100.0, 2)
            files[current_file] = {
                "found": current_found,
                "hit": current_hit,
                "percent": pct,
            }
            current_file = None

    total_found = sum(f["found"] for f in files.values())
    total_hit = sum(f["hit"] for f in files.values())
    total_pct = 100.0 if total_found == 0 else round((total_hit / total_found) * 100.0, 2)
    return {
        "line_found": total_found,
        "line_hit": total_hit,
        "line_percent": total_pct,
        "files": files,
    }
