#!/usr/bin/env python3
"""Validate exact known-test-failure allowlist entries."""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path

from gate_common import ROOT


DEFAULT_DOC = ROOT / "docs" / "testing" / "known-test-failures.md"
REQUIRED = ["test file", "test name", "failure reason", "owner", "first observed", "cleanup condition", "issue"]
WILDCARDS = {"*", ".*", "all", "ALL", "<all>"}


def parse_table(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return (REQUIRED, [])
    rows = []
    headers: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.startswith("|") or "---" in line:
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if not headers:
            headers = [cell.lower() for cell in cells]
            continue
        if len(cells) == len(headers):
            rows.append(dict(zip(headers, cells)))
    return (headers, rows)


def validate(path: Path) -> list[str]:
    headers, rows = parse_table(path)
    errors = []
    for required in REQUIRED:
        if required not in headers:
            errors.append(f"missing required column: {required}")
    for idx, row in enumerate(rows, start=1):
        test_file = row.get("test file", "")
        test_name = row.get("test name", "")
        if not test_file or test_file in WILDCARDS or "*" in test_file:
            errors.append(f"row {idx}: test file must be exact, no wildcards")
        if not test_name or test_name in WILDCARDS or "*" in test_name:
            errors.append(f"row {idx}: test name must be exact, no wildcards")
        for required in REQUIRED:
            if not row.get(required, "").strip():
                errors.append(f"row {idx}: missing {required}")
        observed = row.get("first observed", "")
        if observed and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", observed):
            errors.append(f"row {idx}: first observed must be YYYY-MM-DD")
        cleanup = row.get("cleanup condition", "")
        if cleanup and cleanup.lower() in {"n/a", "none", "never"}:
            errors.append(f"row {idx}: cleanup condition must be actionable")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--doc", default=str(DEFAULT_DOC))
    args = parser.parse_args()
    path = Path(args.doc)
    errors = validate(path)
    if errors:
        print("Known failures allowlist is invalid:")
        for error in errors:
            print(f"- {error}")
        return 1
    _, rows = parse_table(path)
    print(f"Known failures allowlist OK: {len(rows)} entries as of {date.today().isoformat()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
