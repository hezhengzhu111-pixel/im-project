#!/usr/bin/env python3
from __future__ import annotations

import json
import platform
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = PROJECT_ROOT / "build"
DIST_DIR = BUILD_DIR / "dist"


def main() -> None:
    missing: list[str] = []
    manifest_path = BUILD_DIR / "manifest.json"
    manifest = load_manifest(manifest_path, missing)

    required = [
        backend_artifact("api-server"),
        backend_artifact("im-server"),
        DIST_DIR / "frontend" / "web" / "index.html",
        DIST_DIR / "frontend" / "web" / "pkg" / "im_rust_bridge.js",
        DIST_DIR / "frontend" / "web" / "pkg" / "im_rust_bridge_bg.wasm",
        bridge_artifact(),
    ]
    required.extend(flutter_main_js_files())

    for path in required:
        if not path.is_file():
            missing.append(relative(path))

    docker_images = manifest.get("docker_images", {}) if isinstance(manifest, dict) else {}
    if docker_images:
        for rel_path in docker_images.values():
            path = PROJECT_ROOT / rel_path
            if not path.is_file():
                missing.append(relative(path))

    print("Build outputs:")
    for path in required:
        print_size(path)
    if docker_images:
        for rel_path in docker_images.values():
            print_size(PROJECT_ROOT / rel_path)
    print_size(manifest_path)

    if missing:
        print("Missing build outputs:", file=sys.stderr)
        for item in missing:
            print(f"  {item}", file=sys.stderr)
        sys.exit(1)


def load_manifest(manifest_path: Path, missing: list[str]) -> dict:
    if not manifest_path.is_file():
        missing.append(relative(manifest_path))
        return {}
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Invalid manifest JSON: {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print("Invalid manifest JSON: top-level value must be an object", file=sys.stderr)
        sys.exit(1)
    return data


def flutter_main_js_files() -> list[Path]:
    web_dir = DIST_DIR / "frontend" / "web"
    main_dart_js = web_dir / "main.dart.js"
    if main_dart_js.is_file():
        return [main_dart_js]
    candidates = sorted(path for path in web_dir.glob("*.js") if path.is_file())
    if candidates:
        return candidates
    return [main_dart_js]


def backend_artifact(name: str) -> Path:
    suffix = ".exe" if platform.system() == "Windows" else ""
    return DIST_DIR / "backend" / name / f"{name}{suffix}"


def bridge_artifact() -> Path:
    system = platform.system()
    if system == "Windows":
        filename = "im_rust_bridge.dll"
    elif system == "Darwin":
        filename = "libim_rust_bridge.dylib"
    else:
        filename = "libim_rust_bridge.so"
    return DIST_DIR / "rust_bridge" / filename


def print_size(path: Path) -> None:
    if path.is_file():
        print(f"  {relative(path)} ({path.stat().st_size} bytes)")
    else:
        print(f"  {relative(path)} (missing)")


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)


if __name__ == "__main__":
    main()
