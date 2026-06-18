#!/usr/bin/env python3
"""Check Step 4 test manifest completeness."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from gate_common import ROOT
from test_inventory import generate, write_markdown


REPORT_DIR = ROOT / "build" / "reports"
CRITICAL_SECTIONS = {"backend_routes", "frontend_endpoints", "frontend_page_routes"}
LEGACY_API_RE = re.compile(r"['\"]/(?:user|message|friend|group|file|moments|push|ai|keys|e2ee)(?:/|['\"])", re.IGNORECASE)
SECRET_RE = re.compile(r"(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*['\"][^'\"]{24,}['\"]")


def write_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def scan_text_files(patterns: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for pattern in patterns:
        files.extend(ROOT.rglob(pattern))
    return [
        path
        for path in files
        if not any(part in {".git", "build", "target", ".dart_tool", "coverage"} for part in path.parts)
    ]


def legacy_path_violations() -> list[str]:
    violations = []
    candidate_roots = [
        ROOT / "flutter" / "packages" / "core" / "lib",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "chat" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "contacts" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "group" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "moments" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "push" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "settings" / "data",
        ROOT / "flutter" / "packages" / "shared_features" / "lib" / "src" / "e2ee" / "data",
        ROOT / "flutter" / "apps" / "web" / "lib" / "features" / "chat" / "data",
        ROOT / "flutter" / "apps" / "web" / "lib" / "features" / "group" / "data",
        ROOT / "flutter" / "apps" / "web" / "lib" / "features" / "moments" / "data",
        ROOT / "flutter" / "apps" / "web" / "lib" / "features" / "settings" / "data",
        ROOT / "flutter" / "apps" / "web" / "lib" / "features" / "e2ee" / "data",
        ROOT / "rust" / "apps" / "api-server" / "src" / "routes",
    ]
    files = []
    for root in candidate_roots:
        if root.exists():
            files.extend(root.rglob("*.dart"))
            files.extend(root.rglob("*.rs"))
    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        if LEGACY_API_RE.search(text) and "api_endpoints_test.dart" not in str(path):
            # Negative tests may mention legacy paths explicitly.
            if "legacy" in path.name.lower() or "no legacy" in text.lower():
                continue
            violations.append(str(path.relative_to(ROOT)))
    return sorted(set(violations))


def placeholder_violations() -> list[str]:
    violations = []
    for path in scan_text_files(("app_router.dart", "*.dart")):
        if "flutter" not in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if "PlaceholderPage" in text and "pathMatch" not in text:
            violations.append(str(path.relative_to(ROOT)))
    return sorted(set(violations))


def secret_snapshot_violations() -> list[str]:
    violations = []
    for path in scan_text_files(("*snapshot*.dart", "*snapshot*.rs", "*log*.dart", "*log*.rs", "*logger*.dart", "*logger*.rs")):
        text = path.read_text(encoding="utf-8", errors="replace")
        if SECRET_RE.search(text):
            rel = str(path.relative_to(ROOT))
            if rel in {".env", ".env.bak"} or rel.endswith(".env.example"):
                continue
            violations.append(rel)
    return sorted(set(violations))


def check_manifest(data: dict[str, list[dict[str, str]]]) -> list[str]:
    errors: list[str] = []
    for section, items in data.items():
        for item in items:
            if section in CRITICAL_SECTIONS and item["status"] == "missing":
                errors.append(f"{section}: missing {item['name']} ({item['file']})")
            if item["status"] == "allowed_missing" and not item.get("reason"):
                errors.append(f"{section}: allowed_missing without reason {item['name']}")
    for section, items in data.items():
        for item in items:
            if item["kind"] == "frontend_endpoint" and item.get("category") != "websocket":
                path = item.get("path", "")
                if path and not path.startswith("/api/") and item["status"] != "allowed_missing":
                    errors.append(f"{section}: non-/api endpoint {item['name']} -> {path}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", default=str(REPORT_DIR / "test-manifest.json"))
    parser.add_argument("--md-out", default=str(REPORT_DIR / "test-manifest.md"))
    parser.add_argument("--summary-out", default=str(REPORT_DIR / "test-manifest-check.json"))
    args = parser.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    data = generate()
    write_json(data, Path(args.json_out))
    write_markdown(data, Path(args.md_out))

    errors = check_manifest(data)
    for rel in legacy_path_violations():
        errors.append(f"legacy non-/api path reference: {rel}")
    for rel in placeholder_violations():
        errors.append(f"business placeholder route reference: {rel}")
    for rel in secret_snapshot_violations():
        errors.append(f"possible hardcoded secret/token in tracked text: {rel}")

    counts = {}
    for section, items in data.items():
        counts[section] = {
            "covered": sum(1 for item in items if item["status"] == "covered"),
            "allowed_missing": sum(1 for item in items if item["status"] == "allowed_missing"),
            "missing": sum(1 for item in items if item["status"] == "missing"),
        }
    summary = {"counts": counts, "errors": errors}
    write_json(summary, Path(args.summary_out))
    if errors:
        print("Manifest gate failed:")
        for error in errors[:100]:
            print(f"- {error}")
        if len(errors) > 100:
            print(f"- ... {len(errors) - 100} more")
        return 1
    print("Manifest gate passed.")
    print(json.dumps(counts, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
