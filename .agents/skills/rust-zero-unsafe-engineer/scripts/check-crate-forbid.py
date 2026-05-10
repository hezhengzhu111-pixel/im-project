#!/usr/bin/env python3

from __future__ import annotations

import pathlib
import sys

try:
    import tomllib
except ModuleNotFoundError:
    tomllib = None


ROOT = pathlib.Path.cwd()

EXCLUDED_DIR_NAMES = {
    "target",
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "dist",
    "build",
}

FORBID_LINE = "#![forbid(unsafe_code)]"

WEAKENING_PATTERNS = [
    "#![allow(unsafe_code)]",
    "#![warn(unsafe_code)]",
    "#![deny(unsafe_code)]",
    "#[allow(unsafe_code)]",
    "#[warn(unsafe_code)]",
    "#[deny(unsafe_code)]",
]


def is_excluded(path: pathlib.Path) -> bool:
    return any(part in EXCLUDED_DIR_NAMES for part in path.parts)


def find_cargo_tomls() -> list[pathlib.Path]:
    result: list[pathlib.Path] = []

    for path in ROOT.rglob("Cargo.toml"):
        if is_excluded(path):
            continue
        result.append(path)

    return sorted(result)


def read_cargo_toml(path: pathlib.Path) -> dict:
    if tomllib is None:
        return {}

    try:
        with path.open("rb") as file:
            return tomllib.load(file)
    except Exception:
        return {}


def add_if_exists(candidates: list[pathlib.Path], path: pathlib.Path) -> None:
    if path.exists() and path.suffix == ".rs" and path not in candidates:
        candidates.append(path)


def candidate_roots(crate_dir: pathlib.Path, cargo_toml: pathlib.Path) -> list[pathlib.Path]:
    candidates: list[pathlib.Path] = []

    data = read_cargo_toml(cargo_toml)

    lib_config = data.get("lib")
    if isinstance(lib_config, dict):
        lib_path = lib_config.get("path")
        if isinstance(lib_path, str):
            add_if_exists(candidates, crate_dir / lib_path)

    bin_configs = data.get("bin")
    if isinstance(bin_configs, list):
        for bin_config in bin_configs:
            if isinstance(bin_config, dict):
                bin_path = bin_config.get("path")
                if isinstance(bin_path, str):
                    add_if_exists(candidates, crate_dir / bin_path)

    example_configs = data.get("example")
    if isinstance(example_configs, list):
        for example_config in example_configs:
            if isinstance(example_config, dict):
                example_path = example_config.get("path")
                if isinstance(example_path, str):
                    add_if_exists(candidates, crate_dir / example_path)

    bench_configs = data.get("bench")
    if isinstance(bench_configs, list):
        for bench_config in bench_configs:
            if isinstance(bench_config, dict):
                bench_path = bench_config.get("path")
                if isinstance(bench_path, str):
                    add_if_exists(candidates, crate_dir / bench_path)

    add_if_exists(candidates, crate_dir / "src" / "lib.rs")
    add_if_exists(candidates, crate_dir / "src" / "main.rs")

    bin_dir = crate_dir / "src" / "bin"
    if bin_dir.exists():
        for path in sorted(bin_dir.glob("*.rs")):
            add_if_exists(candidates, path)

    examples_dir = crate_dir / "examples"
    if examples_dir.exists():
        for path in sorted(examples_dir.glob("*.rs")):
            add_if_exists(candidates, path)

    benches_dir = crate_dir / "benches"
    if benches_dir.exists():
        for path in sorted(benches_dir.glob("*.rs")):
            add_if_exists(candidates, path)

    return candidates


def check_file(path: pathlib.Path) -> list[str]:
    errors: list[str] = []

    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{path}: cannot read file as UTF-8")
        return errors

    for pattern in WEAKENING_PATTERNS:
        if pattern in text:
            errors.append(
                f"{path}: forbidden unsafe_code lint weakening found: {pattern}"
            )

    if FORBID_LINE not in text:
        errors.append(
            f"{path}: missing required crate-level lint: {FORBID_LINE}"
        )

    return errors


def main() -> int:
    cargo_tomls = find_cargo_tomls()

    if not cargo_tomls:
        print("WARN: no Cargo.toml found.")
        return 0

    all_errors: list[str] = []
    checked_files: list[pathlib.Path] = []

    for cargo_toml in cargo_tomls:
        crate_dir = cargo_toml.parent
        roots = candidate_roots(crate_dir, cargo_toml)

        for root in roots:
            checked_files.append(root)
            all_errors.extend(check_file(root))

    if not checked_files:
        print("WARN: Cargo.toml files found, but no Rust crate roots found.")
        return 0

    if all_errors:
        print("ERROR: crate root unsafe policy check failed.")
        for error in all_errors:
            print(f"- {error}")
        return 1

    print("PASS: all discovered Rust crate roots contain #![forbid(unsafe_code)].")
    return 0


if __name__ == "__main__":
    sys.exit(main())