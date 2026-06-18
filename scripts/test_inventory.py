#!/usr/bin/env python3
"""Generate conservative test inventory manifests for Step 4 gates."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

from gate_common import ROOT


REPORT_DIR = ROOT / "build" / "reports"
ROUTE_DIR = ROOT / "rust" / "apps" / "api-server" / "src" / "routes"
ENDPOINT_FILE = ROOT / "flutter" / "packages" / "core" / "lib" / "src" / "contracts" / "api_endpoints.dart"
APP_ROUTERS = {
    "web": ROOT / "flutter" / "apps" / "web" / "lib" / "core" / "router" / "app_router.dart",
    "mobile": ROOT / "flutter" / "apps" / "mobile" / "lib" / "core" / "router" / "app_router.dart",
    "desktop": ROOT / "flutter" / "apps" / "desktop" / "lib" / "core" / "router" / "app_router.dart",
}
TEST_ROOTS = [
    ROOT / "rust" / "apps" / "api-server" / "tests",
    ROOT / "rust" / "apps" / "api-server" / "src",
    ROOT / "rust" / "crates",
    ROOT / "flutter" / "packages",
    ROOT / "flutter" / "apps",
    ROOT / "tests",
    ROOT / "scripts" / "sit_backend_api.py",
]


@dataclass
class ManifestItem:
    kind: str
    name: str
    file: str
    path: str = ""
    method: str = ""
    handler: str = ""
    category: str = ""
    test_file: str = ""
    test_name: str = ""
    status: str = "missing"
    reason: str = ""


METHOD_RE = re.compile(r"\b(get|post|put|delete|patch)\s*\(\s*([A-Za-z0-9_:]+)", re.MULTILINE)
ROUTE_RE = re.compile(r"\.route\s*\(\s*\"([^\"]+)\"\s*,(.*?)(?=\n\s*\.route|\n\s*\))", re.DOTALL)
CLASS_RE = re.compile(r"class\s+([A-Za-z0-9_]+)\s*\{(.*?)\n\}", re.DOTALL)
CONST_RE = re.compile(r"static\s+const\s+([A-Za-z0-9_]+)\s*=\s*'([^']+)';")
BUILDER_RE = re.compile(r"static\s+String\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*=>\s*([^;]+);", re.DOTALL)
GOROUTE_RE = re.compile(r"path:\s*'([^']+)'")
PUBLIC_DART_METHOD_RE = re.compile(r"^\s*(?:Future<[^>]+>|Future|Stream<[^>]+>|[A-Z][A-Za-z0-9_<>, ?]+)\s+([a-z][A-Za-z0-9_]*)\s*\(", re.MULTILINE)
PUBLIC_RUST_FN_RE = re.compile(r"^\s*pub\s+(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\(", re.MULTILINE)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def iter_files(paths: Iterable[Path], patterns: tuple[str, ...]) -> Iterable[Path]:
    for root in paths:
        if root.is_file():
            yield root
            continue
        if not root.exists():
            continue
        for pattern in patterns:
            yield from root.rglob(pattern)


def build_test_index() -> list[tuple[Path, str]]:
    indexed = []
    for path in iter_files(TEST_ROOTS, ("*_test.dart", "*.rs", "*.py")):
        if any(part in {"build", "target", ".dart_tool", "coverage", "frb_generated.dart"} for part in path.parts):
            continue
        try:
            text = read_text(path)
        except OSError:
            continue
        if "test" in path.name or "tests" in path.parts or path.suffix == ".py":
            indexed.append((path, text))
    return indexed


def find_evidence(needles: Iterable[str], index: list[tuple[Path, str]]) -> tuple[str, str]:
    clean_needles = [needle for needle in needles if needle]
    for path, text in index:
        for needle in clean_needles:
            if needle in text:
                return (str(path.relative_to(ROOT)), infer_test_name(text, needle))
    return ("", "")


def infer_test_name(text: str, needle: str) -> str:
    pos = text.find(needle)
    prefix = text[:pos]
    matches = list(re.finditer(r"(?:test|group)\s*\(\s*['\"]([^'\"]+)['\"]", prefix))
    return matches[-1].group(1) if matches else ""


def normalize_dynamic_path(path: str) -> str:
    return re.sub(r":[A-Za-z0-9_]+", "sample-id", path)


def dynamic_path_variants(path: str) -> list[str]:
    return [
        path,
        normalize_dynamic_path(path),
        re.sub(r":([A-Za-z0-9_]+)", r"{\1}", path),
        re.sub(r":([A-Za-z0-9_]+)", "{}", path),
    ]


def route_manifest(index: list[tuple[Path, str]]) -> list[ManifestItem]:
    items: list[ManifestItem] = []
    for route_file in sorted(ROUTE_DIR.glob("*.rs")):
        if route_file.name == "mod.rs":
            continue
        text = read_text(route_file)
        for path, route_body in ROUTE_RE.findall(text):
            methods = METHOD_RE.findall(route_body)
            if not methods:
                continue
            for method, handler in methods:
                test_file, test_name = find_evidence(
                    [*dynamic_path_variants(path), handler.rsplit("::", 1)[-1]],
                    index,
                )
                status = "covered" if test_file else "missing"
                reason = ""
                if "/internal/" in path and status == "missing":
                    status = "allowed_missing"
                    reason = "internal service-to-service route"
                items.append(
                    ManifestItem(
                        kind="backend_route",
                        name=f"{method.upper()} {path}",
                        file=str(route_file.relative_to(ROOT)),
                        path=path,
                        method=method.upper(),
                        handler=handler,
                        category="internal" if "/internal/" in path else "business",
                        test_file=test_file,
                        test_name=test_name,
                        status=status,
                        reason=reason,
                    )
                )
    return items


def endpoint_manifest(index: list[tuple[Path, str]]) -> list[ManifestItem]:
    items: list[ManifestItem] = []
    text = read_text(ENDPOINT_FILE)
    for class_name, body in CLASS_RE.findall(text):
        for name, path in CONST_RE.findall(body):
            status = "covered"
            reason = ""
            if not path.startswith("/api/") and class_name not in {"WsEndpoints"}:
                status = "allowed_missing" if class_name == "AdminEndpoints" else "missing"
                reason = "admin/internal non-business endpoint" if class_name == "AdminEndpoints" else "REST endpoint must start with /api/"
            test_file, test_name = find_evidence([f"{class_name}", name, path], index)
            if not test_file and status == "covered":
                status = "missing"
            items.append(
                ManifestItem(
                    kind="frontend_endpoint",
                    name=f"{class_name}.{name}",
                    file=str(ENDPOINT_FILE.relative_to(ROOT)),
                    path=path,
                    category="websocket" if class_name == "WsEndpoints" else "rest",
                    test_file=test_file,
                    test_name=test_name,
                    status=status,
                    reason=reason,
                )
            )
        for name, params, expr in BUILDER_RE.findall(body):
            expr_path = re.search(r"'([^']*)'", expr)
            path_prefix = expr_path.group(1) if expr_path else ""
            test_file, test_name = find_evidence(
                [f"{class_name}.{name} encodes", f"{name} encodes", name],
                index,
            )
            status = "covered" if test_file and "Uri.encodeComponent" in expr else "missing"
            reason = "" if "Uri.encodeComponent" in expr else "dynamic builder must use Uri.encodeComponent"
            items.append(
                ManifestItem(
                    kind="frontend_endpoint",
                    name=f"{class_name}.{name}",
                    file=str(ENDPOINT_FILE.relative_to(ROOT)),
                    path=path_prefix,
                    category="dynamic_rest",
                    test_file=test_file,
                    test_name=test_name,
                    status=status,
                    reason=reason,
                )
            )
    return items


def page_manifest(index: list[tuple[Path, str]]) -> list[ManifestItem]:
    items: list[ManifestItem] = []
    for platform, router_file in APP_ROUTERS.items():
        text = read_text(router_file)
        for route in GOROUTE_RE.findall(text):
            is_fallback = "pathMatch" in route
            test_file, test_name = find_evidence([route, f"{platform}_route_test", "route tests"], index)
            status = "covered" if test_file or is_fallback else "missing"
            reason = ""
            placeholder_status = "fallback" if is_fallback else "none"
            items.append(
                ManifestItem(
                    kind="frontend_page_route",
                    name=f"{platform}:{route}",
                    file=str(router_file.relative_to(ROOT)),
                    path=route,
                    category=placeholder_status,
                    test_file=test_file,
                    test_name=test_name,
                    status=status,
                    reason=reason,
                )
            )
    return items


def public_api_manifest(index: list[tuple[Path, str]]) -> list[ManifestItem]:
    roots = [
        (ROOT / "flutter" / "packages" / "shared_features" / "lib", "*.dart", "flutter_public"),
        (ROOT / "flutter" / "apps" / "web" / "lib" / "features", "*.dart", "flutter_web_public"),
        (ROOT / "rust" / "crates" / "im-e2ee-core" / "src", "*.rs", "rust_e2ee"),
        (ROOT / "rust" / "crates" / "im-e2ee-ffi" / "src", "*.rs", "rust_e2ee"),
        (ROOT / "rust" / "crates" / "im-flutter-bridge" / "src", "*.rs", "rust_bridge"),
        (ROOT / "rust" / "crates" / "im-common" / "src", "*.rs", "rust_common"),
    ]
    items: list[ManifestItem] = []
    for root, pattern, category in roots:
        for path in root.rglob(pattern):
            if any(part in {"generated", "frb_generated.rs"} for part in path.parts) or path.name.endswith((".g.dart", ".freezed.dart")):
                continue
            text = read_text(path)
            regex = PUBLIC_RUST_FN_RE if path.suffix == ".rs" else PUBLIC_DART_METHOD_RE
            for symbol in sorted(set(regex.findall(text))):
                if symbol.startswith("_") or symbol in {"build", "copyWith", "toJson", "fromJson"}:
                    continue
                test_file, test_name = find_evidence([symbol, path.stem], index)
                status = "covered" if test_file else "allowed_missing"
                reason = "" if test_file else "public symbol inventory baseline; promote to covered as tests are added"
                items.append(
                    ManifestItem(
                        kind="public_api",
                        name=symbol,
                        file=str(path.relative_to(ROOT)),
                        category=category,
                        test_file=test_file,
                        test_name=test_name,
                        status=status,
                        reason=reason,
                    )
                )
    return items


def generate() -> dict[str, list[dict[str, str]]]:
    index = build_test_index()
    sections = {
        "backend_routes": route_manifest(index),
        "frontend_endpoints": endpoint_manifest(index),
        "frontend_page_routes": page_manifest(index),
        "public_api": public_api_manifest(index),
    }
    return {name: [asdict(item) for item in items] for name, items in sections.items()}


def write_markdown(data: dict[str, list[dict[str, str]]], path: Path) -> None:
    lines = ["# Test Manifest", ""]
    for section, items in data.items():
        lines.extend([f"## {section}", "", "| name | status | file | test | reason |", "| --- | --- | --- | --- | --- |"])
        for item in items:
            test = item.get("test_file") or ""
            if item.get("test_name"):
                test = f"{test}::{item['test_name']}"
            lines.append(
                f"| {item['name']} | {item['status']} | {item['file']} | {test} | {item.get('reason', '')} |"
            )
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", default=str(REPORT_DIR / "test-manifest.json"))
    parser.add_argument("--md-out", default=str(REPORT_DIR / "test-manifest.md"))
    args = parser.parse_args()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    data = generate()
    json_path = Path(args.json_out)
    md_path = Path(args.md_out)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(data, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
