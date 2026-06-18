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


REPORT_DIR = ROOT / "build" / "reports" / "manifest"
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
COVER_ENDPOINT_RE = r"@coversEndpoint\(\s*['\"]{name}['\"]\s*\)"
COVER_ROUTE_RE = r"@coversRoute\(\s*['\"]{name}['\"]\s*\)"
COVER_SYMBOL_RE = r"@coversSymbol\(\s*['\"]{name}['\"]\s*\)"
ENCODED_FRAGMENT_RE = re.compile(r"%[0-9A-Fa-f]{2}")
SPECIAL_INPUT_RE = re.compile(r"['\"][^'\"]*[/# ?:][^'\"]*['\"]")
GENERATED_PARTS = {"generated", "frb_generated", "build"}
PUBLIC_DART_FILE_HINTS = ("api", "provider", "providers", "notifier")


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
        if any(part in {"build", "target", ".dart_tool", "coverage", "__pycache__"} for part in path.parts):
            continue
        try:
            text = read_text(path)
        except OSError:
            continue
        is_rust_with_inline_tests = path.suffix == ".rs" and ("#[test]" in text or "#[cfg(test)]" in text)
        if "test" in path.name or "tests" in path.parts or path.suffix == ".py" or is_rust_with_inline_tests:
            indexed.append((path, text))
    return indexed


def find_evidence(needles: Iterable[str], index: list[tuple[Path, str]]) -> tuple[str, str]:
    clean_needles = [needle for needle in needles if needle]
    for path, text in index:
        for needle in clean_needles:
            if needle in text:
                return (str(path.relative_to(ROOT)), infer_test_name(text, needle))
    return ("", "")


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _metadata_regex(template: str, name: str) -> re.Pattern[str]:
    return re.compile(template.format(name=re.escape(name)))


def find_metadata_evidence(template: str, name: str, index: list[tuple[Path, str]]) -> tuple[str, str]:
    pattern = _metadata_regex(template, name)
    for path, text in index:
        match = pattern.search(text)
        if match:
            return (_rel(path), infer_test_name(text, match.group(0)))
    return ("", "")


def find_literal_evidence(literal: str, index: list[tuple[Path, str]], *, file_name_contains: str | None = None) -> tuple[str, str]:
    for path, text in index:
        if file_name_contains and file_name_contains not in path.name:
            continue
        if literal in text:
            return (_rel(path), infer_test_name(text, literal))
    return ("", "")


def has_endpoint_const_evidence(class_name: str, member: str, path: str, index: list[tuple[Path, str]]) -> tuple[str, str]:
    metadata = find_metadata_evidence(COVER_ENDPOINT_RE, f"{class_name}.{member}", index)
    if metadata[0]:
        return metadata
    return find_literal_evidence(path, index, file_name_contains="api_endpoints_test")


def has_dynamic_endpoint_evidence(class_name: str, member: str, index: list[tuple[Path, str]]) -> tuple[str, str]:
    metadata = find_metadata_evidence(COVER_ENDPOINT_RE, f"{class_name}.{member}", index)
    call_re = re.compile(rf"\b{re.escape(class_name)}\.{re.escape(member)}\s*\((?P<args>[^)]*)\)", re.DOTALL)
    for path, text in index:
        for match in call_re.finditer(text):
            window_start = max(0, match.start() - 500)
            window_end = min(len(text), match.end() + 500)
            window = text[window_start:window_end]
            if SPECIAL_INPUT_RE.search(match.group("args")) and ENCODED_FRAGMENT_RE.search(window):
                return (_rel(path), infer_test_name(text, match.group(0)))
    if metadata[0]:
        for path, text in index:
            if _metadata_regex(COVER_ENDPOINT_RE, f"{class_name}.{member}").search(text) and ENCODED_FRAGMENT_RE.search(text):
                return (_rel(path), infer_test_name(text, f"{class_name}.{member}"))
    return ("", "")


def has_route_evidence(platform: str, route: str, index: list[tuple[Path, str]]) -> tuple[str, str]:
    metadata = find_metadata_evidence(COVER_ROUTE_RE, f"{platform}:{route}", index)
    if metadata[0]:
        return metadata
    return find_literal_evidence(route, index)


def remove_public_declarations(text: str, symbol: str) -> str:
    text = re.sub(rf"^\s*pub\s+(?:async\s+)?fn\s+{re.escape(symbol)}\s*\([^)]*\)\s*(?:->\s*[^\{{;]+)?", "", text, flags=re.MULTILINE)
    text = re.sub(rf"^\s*(?:Future<[^>]+>|Future|Stream<[^>]+>|[A-Z][A-Za-z0-9_<>, ?]+)\s+{re.escape(symbol)}\s*\([^)]*\)", "", text, flags=re.MULTILINE)
    return text


def has_symbol_evidence(symbol: str, source_path: Path, class_name: str, index: list[tuple[Path, str]]) -> tuple[str, str]:
    metadata = find_metadata_evidence(COVER_SYMBOL_RE, symbol, index)
    if metadata[0]:
        return metadata
    source_stem = source_path.stem.replace("_test", "")
    class_lc = class_name.lower()
    symbol_call = re.compile(rf"\b{re.escape(symbol)}\s*\(")
    for path, text in index:
        test_name = infer_test_name(text, symbol)
        if symbol in test_name:
            return (_rel(path), test_name)
        searchable = remove_public_declarations(text, symbol)
        if not symbol_call.search(searchable):
            continue
        path_lc = path.stem.lower()
        test_name_lc = test_name.lower()
        text_lc = text.lower()
        if source_stem.lower() in path_lc or class_lc in path_lc or class_lc in test_name_lc or class_lc in text_lc:
            return (_rel(path), test_name)
    return ("", "")


def nearest_class_name(text: str, offset: int) -> str:
    matches = list(re.finditer(r"\bclass\s+([A-Za-z0-9_]+)", text[:offset]))
    return matches[-1].group(1) if matches else ""


def is_generated_file(path: Path) -> bool:
    name = path.name
    if name.endswith((".g.dart", ".freezed.dart")) or name in {"frb_generated.dart", "frb_generated.rs"}:
        return True
    return any(part in GENERATED_PARTS or part.startswith("frb_generated") for part in path.parts)


def should_scan_public_dart_file(path: Path) -> bool:
    stem = path.stem.lower()
    return any(hint in stem for hint in PUBLIC_DART_FILE_HINTS)


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
            test_file, test_name = has_endpoint_const_evidence(class_name, name, path, index)
            if not test_file and status == "covered":
                status = "missing"
            items.append(
                ManifestItem(
                    kind="frontend_endpoint",
                    name=f"{class_name}.{name}",
                    file=str(ENDPOINT_FILE.relative_to(ROOT)),
                    path=path,
                    category="websocket" if class_name == "WsEndpoints" else ("internal_admin" if class_name == "AdminEndpoints" else "rest"),
                    test_file=test_file,
                    test_name=test_name,
                    status=status,
                    reason=reason,
                )
            )
        for name, params, expr in BUILDER_RE.findall(body):
            expr_path = re.search(r"'([^']*)'", expr)
            path_prefix = expr_path.group(1) if expr_path else ""
            test_file, test_name = has_dynamic_endpoint_evidence(class_name, name, index)
            status = "covered" if test_file and "Uri.encodeComponent" in expr else "missing"
            reason = ""
            if "Uri.encodeComponent" not in expr:
                reason = "dynamic builder must use Uri.encodeComponent"
            elif not test_file:
                reason = "dynamic endpoint must have special-character encode coverage or @coversEndpoint metadata"
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
            test_file, test_name = has_route_evidence(platform, route, index)
            status = "covered" if test_file or is_fallback else "missing"
            reason = "fallback route" if is_fallback else ""
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
        (ROOT / "rust" / "crates" / "im-e2ee-core" / "src", "*.rs", "rust_e2ee"),
        (ROOT / "rust" / "crates" / "im-e2ee-ffi" / "src", "*.rs", "rust_e2ee"),
        (ROOT / "rust" / "crates" / "im-flutter-bridge" / "src", "*.rs", "rust_bridge"),
        (ROOT / "rust" / "crates" / "im-common" / "src", "*.rs", "rust_common"),
    ]
    items: list[ManifestItem] = []
    for root, pattern, category in roots:
        for path in root.rglob(pattern):
            if is_generated_file(path):
                continue
            if path.suffix == ".dart" and not should_scan_public_dart_file(path):
                continue
            text = read_text(path)
            regex = PUBLIC_RUST_FN_RE if path.suffix == ".rs" else PUBLIC_DART_METHOD_RE
            for match in sorted(regex.finditer(text), key=lambda item: item.group(1)):
                symbol = match.group(1)
                if symbol.startswith("_") or symbol in {"build", "copyWith", "toJson", "fromJson"}:
                    continue
                class_name = nearest_class_name(text, match.start())
                test_file, test_name = has_symbol_evidence(symbol, path, class_name, index)
                status = "covered" if test_file else "missing"
                reason = "" if test_file else "public API requires symbol-level test evidence"
                items.append(
                    ManifestItem(
                        kind="public_api",
                        name=f"{class_name}.{symbol}" if class_name else symbol,
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
