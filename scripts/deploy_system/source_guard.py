from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Set

from .sync_config import SOURCE_DIRS, SYNC_EXCLUDED_NAMES, SYNC_EXCLUDED_PATTERNS


def _derive_pollution_patterns() -> List[str]:
    """Derive pollution patterns from the shared sync config.

    Directory names are suffixed with '/' so _matches_pattern treats them as
    directory patterns; file names and file patterns are kept as-is.
    """
    directory_names = {
        "target",
        ".dart_tool",
        "build",
        "ephemeral",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        ".pytest_cache",
        ".cache",
        "coverage",
        "logs",
    }
    patterns: List[str] = []
    for name in sorted(SYNC_EXCLUDED_NAMES):
        patterns.append(f"{name}/" if name in directory_names else name)
    patterns.extend(SYNC_EXCLUDED_PATTERNS)
    # Additional general build artifacts not covered by sync_config.
    patterns.extend([
        "dist/",
        "out/",
        "tests/build/",
        "*.tar",
        "*.tar.gz",
        "*.zip",
    ])
    return patterns


# Patterns that should NOT appear in source directories
POLLUTION_PATTERNS: List[str] = _derive_pollution_patterns()


class PollutionDetector:
    """Detects build artifacts and intermediate files in source directories."""

    def __init__(self, project_root: Path | str):
        self.project_root = Path(project_root)
        self.findings: List[Path] = []

    def scan(self, fix: bool = False) -> List[Path]:
        """Scan source directories for pollution.

        Args:
            fix: If True, remove pollution files. If False, just report.

        Returns:
            List of pollution paths found.
        """
        self.findings = []

        for source_dir in SOURCE_DIRS:
            source_path = self.project_root / source_dir
            if source_path.exists():
                self._scan_directory(source_path)

        if fix and self.findings:
            self._clean_pollution()

        return self.findings

    def _scan_directory(self, directory: Path) -> None:
        """Recursively scan a directory for pollution."""
        try:
            for item in directory.iterdir():
                # Only skip VCS directories; hidden dirs like .dart_tool may be pollution.
                if item.name == '.git':
                    continue

                relative_path = item.relative_to(self.project_root)

                if self._is_pollution(item, relative_path):
                    self.findings.append(item)
                elif item.is_dir() and not self._should_skip_dir(item):
                    self._scan_directory(item)
        except PermissionError:
            pass

    # Paths that match a pattern but are legitimate source, not pollution.
    EXEMPTIONS: Set[str] = {
        "tests/coverage",
        "tests/coverage/",
    }

    def _is_pollution(self, path: Path, relative_path: Path) -> bool:
        """Check if a path matches pollution patterns."""
        path_str = str(relative_path).replace('\\', '/')

        if path_str in self.EXEMPTIONS or f"{path_str}/" in self.EXEMPTIONS:
            return False

        for pattern in POLLUTION_PATTERNS:
            if self._matches_pattern(path, path_str, pattern):
                return True

        return False

    def _matches_pattern(self, path: Path, path_str: str, pattern: str) -> bool:
        """Check if path matches a specific pattern."""
        if pattern.endswith('/'):
            # Directory pattern
            dir_name = pattern.rstrip('/')
            return path.is_dir() and path.name == dir_name
        elif pattern.startswith('*'):
            # Wildcard pattern
            suffix = pattern[1:]
            return path.name.endswith(suffix)
        elif '/' in pattern:
            # Path pattern
            return path_str == pattern or path_str.endswith('/' + pattern)
        else:
            # Exact name
            return path.name == pattern

    def _should_skip_dir(self, path: Path) -> bool:
        """Determine if a directory should be skipped during scanning."""
        # Skip VCS directories
        if path.name == '.git':
            return True

        # Skip node_modules at any level (already detected as pollution)
        if path.name == 'node_modules':
            return True

        return False

    def _clean_pollution(self) -> None:
        """Remove all detected pollution files."""
        import shutil

        for path in self.findings:
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                    print(f"[CLEAN] Removed directory: {self._relative(path)}")
                else:
                    path.unlink()
                    print(f"[CLEAN] Removed file: {self._relative(path)}")
            except Exception as e:
                print(f"[ERROR] Failed to remove {self._relative(path)}: {e}", file=sys.stderr)

    def _relative(self, path: Path) -> str:
        """Return relative path for display."""
        try:
            return str(path.relative_to(self.project_root))
        except ValueError:
            return str(path)


def check_source_pollution(project_root: Path | str, verbose: bool = False) -> bool:
    """Check for source pollution and report findings.

    Args:
        project_root: Root directory of the project.
        verbose: If True, print detailed information.

    Returns:
        True if pollution found, False if clean.
    """
    detector = PollutionDetector(project_root)
    findings = detector.scan(fix=False)

    if findings:
        print(f"[POLLUTION] Found {len(findings)} pollution items in source directories:")
        for path in findings:
            print(f"  - {detector._relative(path)}")
        return True
    else:
        if verbose:
            print("[POLLUTION] No pollution found in source directories.")
        return False


def clean_source_pollution(project_root: Path | str) -> None:
    """Clean source pollution by removing detected artifacts.

    Args:
        project_root: Root directory of the project.
    """
    detector = PollutionDetector(project_root)
    findings = detector.scan(fix=True)

    if findings:
        print(f"\n[CLEAN] Removed {len(findings)} pollution items.")
    else:
        print("[CLEAN] No pollution found.")
