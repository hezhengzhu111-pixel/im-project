#!/usr/bin/env python3
"""Parse LCOV files and enforce line coverage thresholds."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_EXCLUDES = (
    ".g.dart",
    ".freezed.dart",
    ".gen.dart",
    "generated/",
    "frb_generated",
    "/l10n/",
    "\\l10n\\",
    "main.dart",
)


def parse_lcov(path: Path, excludes: tuple[str, ...] = DEFAULT_EXCLUDES) -> dict:
    files: dict[str, dict[str, int]] = {}
    current = ""
    found = 0
    hit = 0
    if not path.exists():
        raise FileNotFoundError(path)
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if line.startswith("SF:"):
            current = line[3:]
            found = 0
            hit = 0
        elif line.startswith("DA:") and current:
            try:
                _, count = line[3:].split(",", 1)
                found += 1
                if int(count) > 0:
                    hit += 1
            except ValueError:
                continue
        elif line == "end_of_record" and current:
            if not any(exclude in current for exclude in excludes):
                files[current] = {"found": files.get(current, {}).get("found", 0) + found, "hit": files.get(current, {}).get("hit", 0) + hit}
            current = ""
    total_found = sum(item["found"] for item in files.values())
    total_hit = sum(item["hit"] for item in files.values())
    pct = 100.0 if total_found == 0 else (total_hit / total_found) * 100.0
    return {"line_found": total_found, "line_hit": total_hit, "line_percent": round(pct, 2), "files": files}


def check_threshold(summary: dict, threshold: float) -> bool:
    return float(summary["line_percent"]) + 1e-9 >= threshold


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lcov")
    parser.add_argument("--threshold", type=float, required=True)
    parser.add_argument("--json-out")
    args = parser.parse_args()
    summary = parse_lcov(Path(args.lcov))
    summary["threshold"] = args.threshold
    summary["passed"] = check_threshold(summary, args.threshold)
    if args.json_out:
        out = Path(args.json_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "files"}, indent=2))
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
