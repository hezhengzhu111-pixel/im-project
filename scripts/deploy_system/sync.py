from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional, Set


@dataclass
class SyncStats:
    """Statistics from a sync operation."""
    copied: int = 0
    updated: int = 0
    deleted: int = 0
    skipped: int = 0

    def __str__(self) -> str:
        return f"copied={self.copied}, updated={self.updated}, deleted={self.deleted}, skipped={self.skipped}"


def sync_directories(
    source: Path,
    target: Path,
    *,
    ignore_patterns: Optional[List[str]] = None,
    delete: bool = True,
    verbose: bool = False,
    dry_run: bool = False,
) -> SyncStats:
    """Synchronize source directory to target with incremental updates.

    Args:
        source: Source directory to sync from.
        target: Target directory to sync to.
        ignore_patterns: List of glob patterns to ignore.
        delete: If True, delete files in target that don't exist in source.
        verbose: If True, print detailed information.
        dry_run: If True, only show what would be done.

    Returns:
        SyncStats with counts of operations performed.
    """
    if not source.exists():
        raise ValueError(f"Source directory does not exist: {source}")

    ignore_set = set(ignore_patterns or [])
    stats = SyncStats()

    # Ensure target directory exists
    if not dry_run:
        target.mkdir(parents=True, exist_ok=True)

    # Collect all source files
    source_files: Set[Path] = set()
    for source_file in source.rglob("*"):
        if source_file.is_file():
            relative_path = source_file.relative_to(source)
            if not _should_ignore(relative_path, ignore_set):
                source_files.add(relative_path)

    # Sync files from source to target
    for relative_path in source_files:
        source_file = source / relative_path
        target_file = target / relative_path

        if not target_file.exists():
            # File doesn't exist in target - copy it
            if dry_run:
                print(f"[DRY-RUN] Would copy: {relative_path}")
            else:
                _copy_file(source_file, target_file, verbose)
            stats.copied += 1
        else:
            # File exists - check if it needs updating
            source_mtime = source_file.stat().st_mtime
            target_mtime = target_file.stat().st_mtime

            if source_mtime > target_mtime:
                # Source is newer - update
                if dry_run:
                    print(f"[DRY-RUN] Would update: {relative_path}")
                else:
                    _copy_file(source_file, target_file, verbose)
                stats.updated += 1
            else:
                # Target is up to date - skip
                stats.skipped += 1

    # Delete files in target that don't exist in source
    if delete:
        target_files: Set[Path] = set()
        for target_file in target.rglob("*"):
            if target_file.is_file():
                relative_path = target_file.relative_to(target)
                target_files.add(relative_path)

        # Find files to delete
        files_to_delete = target_files - source_files

        for relative_path in files_to_delete:
            target_file = target / relative_path

            if dry_run:
                print(f"[DRY-RUN] Would delete: {relative_path}")
            else:
                try:
                    target_file.unlink()
                    if verbose:
                        print(f"[SYNC] Deleted: {relative_path}")
                except Exception as e:
                    print(f"[ERROR] Failed to delete {relative_path}: {e}", file=sys.stderr)
            stats.deleted += 1

    # Clean up empty directories in target
    if delete and not dry_run:
        _clean_empty_dirs(target, verbose)

    return stats


def _copy_file(source: Path, target: Path, verbose: bool) -> None:
    """Copy a file from source to target, creating parent directories."""
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if verbose:
        print(f"[SYNC] Copied: {source.name}")


def _should_ignore(relative_path: Path, ignore_patterns: Set[str]) -> bool:
    """Check if a relative path should be ignored."""
    path_str = str(relative_path).replace('\\', '/')

    for pattern in ignore_patterns:
        if _matches_pattern(path_str, pattern):
            return True

    return False


def _matches_pattern(path_str: str, pattern: str) -> bool:
    """Check if a path matches a pattern."""
    if pattern.startswith('*'):
        # Wildcard suffix pattern
        suffix = pattern[1:]
        return path_str.endswith(suffix)
    elif pattern.endswith('/'):
        # Directory pattern
        dir_name = pattern.rstrip('/')
        return f"/{dir_name}/" in f"/{path_str}" or path_str.startswith(f"{dir_name}/")
    elif '*' in pattern:
        # Complex wildcard pattern
        import fnmatch
        return fnmatch.fnmatch(path_str, pattern)
    else:
        # Exact match
        return path_str == pattern


def _clean_empty_dirs(directory: Path, verbose: bool) -> None:
    """Recursively remove empty directories."""
    if not directory.is_dir():
        return

    # Process children first
    for child in list(directory.iterdir()):
        if child.is_dir():
            _clean_empty_dirs(child, verbose)

            # Check if directory is now empty
            try:
                if not any(child.iterdir()):
                    child.rmdir()
                    if verbose:
                        print(f"[SYNC] Removed empty directory: {child.relative_to(directory)}")
            except OSError:
                pass


def sync_rust_source(
    source: Path,
    target: Path,
    *,
    verbose: bool = False,
    dry_run: bool = False,
) -> SyncStats:
    """Sync Rust source code with appropriate ignore patterns."""
    ignore_patterns = [
        "target/",
        "vendor/",
        "*.pdb",
        "*.rlib",
        "*.lib",
        ".git/",
    ]

    return sync_directories(
        source,
        target,
        ignore_patterns=ignore_patterns,
        delete=True,
        verbose=verbose,
        dry_run=dry_run,
    )


def sync_flutter_source(
    source: Path,
    target: Path,
    *,
    verbose: bool = False,
    dry_run: bool = False,
) -> SyncStats:
    """Sync Flutter source code with appropriate ignore patterns."""
    ignore_patterns = [
        ".dart_tool/",
        ".packages",
        ".flutter-plugins",
        ".flutter-plugins-dependencies",
        "pubspec.lock",
        "build/",
        ".git/",
        "*.iml",
    ]

    return sync_directories(
        source,
        target,
        ignore_patterns=ignore_patterns,
        delete=True,
        verbose=verbose,
        dry_run=dry_run,
    )


def sync_spring_ai_source(
    source: Path,
    target: Path,
    *,
    verbose: bool = False,
    dry_run: bool = False,
) -> SyncStats:
    """Sync Spring AI source code with appropriate ignore patterns."""
    ignore_patterns = [
        "target/",
        "*.class",
        "*.jar",
        ".mvn/",
        ".git/",
    ]

    return sync_directories(
        source,
        target,
        ignore_patterns=ignore_patterns,
        delete=True,
        verbose=verbose,
        dry_run=dry_run,
    )
