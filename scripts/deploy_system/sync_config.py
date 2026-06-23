"""Shared exclusion rules for source-to-work sync and source-pollution guard.

This module is the single source of truth for:
- patterns that must never be copied from source into build/work/
- patterns that must never appear in source directories

Both scripts/deploy_system/sync.py and tests/common/workspace.py import from here
so that build and test pipelines use identical rules.
"""
from __future__ import annotations

# Directory / file names that must be excluded when syncing source -> build/work
# and that the source-pollution guard will flag if found in source directories.
SYNC_EXCLUDED_NAMES: set[str] = {
    # VCS / tooling
    ".git",
    # Rust build output (note: rust/vendor contains committed vendored source and
    # must NOT be listed here, otherwise legitimate source files are excluded).
    "target",
    # Flutter / Dart
    ".dart_tool",
    ".flutter-plugins",
    ".flutter-plugins-dependencies",
    "pubspec.lock",
    "pubspec_overrides.yaml",
    "build",
    "ephemeral",  # Flutter Windows/macOS ephemeral build output
    # Python
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".cache",
    # Node
    "node_modules",
    # General
    "coverage",
    "logs",
}

# File-name patterns excluded from sync and flagged as pollution.
SYNC_EXCLUDED_PATTERNS: tuple[str, ...] = (
    # Python
    "*.pyc",
    "*.pyo",
    "*.pyd",
    # Temp / swap
    "*.tmp",
    "*.temp",
    "*.swp",
    "*.swo",
    "*~",
    ".DS_Store",
    "Thumbs.db",
    # Logs / build artifacts
    "*.log",
    "*.dill",
    "*.dill.track.dill",
    "*.cache.dill*",
    # IDE
    "*.iml",
    "*.ipr",
    "*.iws",
    # Flutter generated native plugin registrant (various casings)
    "GeneratedPluginRegistrant.java",
    "generated_plugin_registrant.*",
    # Java
    "*.class",
    "*.jar",
)

# Directories considered source directories by the pollution guard.
# Keep in sync with AGENTS.md section "源码目录不可变性".
SOURCE_DIRS: tuple[str, ...] = (
    "rust",
    "flutter",
    "spring-ai",
    "sql",
    "tests",
)
