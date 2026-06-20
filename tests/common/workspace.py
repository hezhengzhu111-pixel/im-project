"""Shared workspace sync utilities for tests.

Provides the same source-exclusion rules as scripts/build.py so that
tests/test.py and tests/gates/* operate on clean build/work copies
without polluting the source tree.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Must stay in sync with scripts/build.py SYNC_EXCLUDED_NAMES.
SYNC_EXCLUDED_NAMES: set[str] = {
    ".git",
    "build",
    "target",
    ".dart_tool",
    ".flutter-plugins",
    ".flutter-plugins-dependencies",
    "pubspec.lock",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    "coverage",
    "logs",
    ".pytest_cache",
    ".cache",
}

# Must stay in sync with scripts/build.py SYNC_EXCLUDED_PATTERNS.
SYNC_EXCLUDED_PATTERNS: tuple[str, ...] = (
    "*.pyc",
    "*.pyo",
    "*.pyd",
    "*.tmp",
    "*.temp",
    "*.swp",
    "*.swo",
    "*~",
    ".DS_Store",
    "Thumbs.db",
    "*.log",
    "*.dill",
    "*.dill.track.dill",
    "*.cache.dill*",
)


def _copy_ignore(directory: str, contents: list[str]) -> set[str]:
    """shutil.copytree ignore callback using shared exclusion rules."""
    ignored: set[str] = set()
    for name in contents:
        if name in SYNC_EXCLUDED_NAMES:
            ignored.add(name)
            continue
        full = os.path.join(directory, name)
        if os.path.isfile(full):
            import fnmatch
            for pattern in SYNC_EXCLUDED_PATTERNS:
                if fnmatch.fnmatch(name, pattern):
                    ignored.add(name)
                    break
    return ignored


def sync_source_to_work(source: Path, target: Path) -> None:
    """Sync *source* into *target*, excluding build/cache artifacts.

    Removes *target* first so stale files from prior runs do not linger.
    """
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target, ignore=_copy_ignore)


def ensure_work_workspace() -> None:
    """Sync rust/ and flutter/ into build/work/ for test isolation."""
    rust_work = ROOT / "build" / "work" / "rust"
    flutter_work = ROOT / "build" / "work" / "flutter"
    rust_work.parent.mkdir(parents=True, exist_ok=True)
    flutter_work.parent.mkdir(parents=True, exist_ok=True)

    rust_source = ROOT / "rust"
    flutter_source = ROOT / "flutter"

    if rust_source.exists():
        sync_source_to_work(rust_source, rust_work)
    if flutter_source.exists():
        sync_source_to_work(flutter_source, flutter_work)


def setup_isolated_env() -> dict[str, str]:
    """Return an env dict pointing CARGO/PUB_CACHE into build/cache/."""
    env = os.environ.copy()
    env["CARGO_HOME"] = str(ROOT / "build" / "cache" / "cargo-home")
    env["CARGO_TARGET_DIR"] = str(ROOT / "build" / "cache" / "rust-target")
    env["PUB_CACHE"] = str(ROOT / "build" / "cache" / "pub-cache")
    return env
