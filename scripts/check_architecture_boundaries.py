#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {
    ".dart_tool",
    ".git",
    ".git.backup",
    "build",
    "target",
    ".idea",
    ".vscode",
    ".melos_tool",
}


def main() -> int:
    violations: list[str] = []
    violations.extend(check_forbidden_text("flutter/packages/core", [
        "flutter_rust_bridge",
        "RustLib",
        "frb_generated",
        "src/generated",
    ]))
    violations.extend(check_forbidden_text_multi([
        "flutter/apps",
        "flutter/packages/shared_features",
        "flutter/packages/core_flutter",
    ], [
        "package:im_rust_bridge/src/generated",
        "package:im_core/src/generated",
        "RustLib",
    ]))
    violations.extend(check_generated_location())
    violations.extend(check_bridge_exports())
    violations.extend(check_melos())
    violations.extend(check_package_dependencies())
    violations.extend(check_old_rust_paths())

    if violations:
        print("Architecture boundary check failed:")
        for item in violations:
            print(f"- {item}")
        return 1

    print("Architecture boundary check passed.")
    return 0


def check_forbidden_text(root: str, patterns: list[str]) -> list[str]:
    return check_forbidden_text_multi([root], patterns)


def check_forbidden_text_multi(roots: list[str], patterns: list[str]) -> list[str]:
    violations: list[str] = []
    for root in roots:
        base = REPO_ROOT / root
        if not base.exists():
            continue
        for path in iter_files(base):
            text = read_text(path)
            for pattern in patterns:
                if pattern in text:
                    violations.append(f"{rel(path)} contains forbidden {pattern!r}")
    return violations


def check_generated_location() -> list[str]:
    allowed = (
        REPO_ROOT
        / "flutter"
        / "packages"
        / "rust_bridge"
        / "lib"
        / "src"
        / "generated"
    )
    violations: list[str] = []
    flutter_root = REPO_ROOT / "flutter"
    for path in iter_files(flutter_root):
        parts = set(path.parts)
        if "generated" not in parts:
            continue
        if is_relative_to(path, allowed):
            continue
        if path.suffix in {".arb", ".dart"}:
            # Flutter l10n generated files are allowed outside Rust bridge.
            if "l10n" in parts or "generated_plugin_registrant" in path.name:
                continue
        text = read_text(path)
        if "flutter_rust_bridge" in text or "RustLib" in text:
            violations.append(f"{rel(path)} is generated Rust bridge code outside rust_bridge")
    return violations


def check_bridge_exports() -> list[str]:
    violations: list[str] = []
    mod_rs = REPO_ROOT / "rust/crates/im-flutter-bridge/src/api/mod.rs"
    text = read_text(mod_rs)
    for module in ("network", "storage", "secure_storage"):
        if f"pub mod {module}" in text:
            violations.append(f"{rel(mod_rs)} exposes non-E2EE module {module}")

    generated_api = (
        REPO_ROOT
        / "flutter/packages/rust_bridge/lib/src/generated/api"
    )
    for name in ("network.dart", "storage.dart", "secure_storage.dart"):
        path = generated_api / name
        if path.exists():
            violations.append(f"{rel(path)} must not exist")
    return violations


def check_melos() -> list[str]:
    path = REPO_ROOT / "flutter/melos.yaml"
    text = read_text(path)
    violations: list[str] = []
    forbidden = [
        "D:/project",
        "D:\\project",
        "C:\\",
        "powershell",
        "rust_bridge_smoke.ps1",
    ]
    for pattern in forbidden:
        if pattern in text:
            violations.append(f"{rel(path)} contains forbidden {pattern!r}")
    return violations


def check_package_dependencies() -> list[str]:
    violations: list[str] = []
    for path in [
        REPO_ROOT / "flutter/packages/shared_features/pubspec.yaml",
        REPO_ROOT / "flutter/packages/core_flutter/pubspec.yaml",
    ]:
        if path.exists() and "im_rust_bridge" in read_text(path):
            violations.append(f"{rel(path)} must not depend on im_rust_bridge")
    return violations


def check_old_rust_paths() -> list[str]:
    patterns = [
        "flutter/native/rust",
        "backend/e2ee-core",
        "backend/e2ee-ffi",
        "backend/e2ee-wasm",
        "backend/api-server-rs",
        "backend/im-server-rs",
    ]
    violations: list[str] = []
    for path in iter_files(REPO_ROOT):
        if path == Path(__file__).resolve():
            continue
        if is_relative_to(path, REPO_ROOT / "docs"):
            continue
        text = read_text(path)
        for pattern in patterns:
            if pattern in text:
                violations.append(f"{rel(path)} contains old Rust path {pattern!r}")
    return violations


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    sys.exit(main())
