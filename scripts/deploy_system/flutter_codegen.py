"""Flutter code generation helpers for build/test pipelines.

Runs build_runner in isolated build/work copies so that generated
.freezed.dart / .g.dart files are produced without polluting the source tree.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def _run(
    command: list[str],
    cwd: Path,
    env: dict[str, str] | None = None,
    *,
    description: str,
) -> None:
    """Run a command and raise a clear error on failure."""
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    printable = " ".join(command)
    print(f"[FLUTTER_CODEGEN] {description}: $ {printable}")
    try:
        subprocess.run(command, cwd=str(cwd), env=merged_env, check=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"Flutter code generation failed while running:\n  {printable}\n"
            f"in {cwd}\nexit code: {exc.returncode}"
        ) from exc


def generate_flutter_core_code(core_dir: Path, env: dict[str, str] | None = None) -> None:
    """Generate .freezed.dart / .g.dart for the im_core package in build/work.

    This is a no-op if the package does not declare build_runner in its
    dev_dependencies (e.g., when a future refactor removes code generation).

    Args:
        core_dir: Path to build/work/flutter/packages/core.
        env: Optional environment dict (should include PUB_CACHE).
    """
    pubspec = core_dir / "pubspec.yaml"
    if not pubspec.is_file():
        raise RuntimeError(f"im_core pubspec.yaml not found: {core_dir}")

    # Lightweight heuristic: only run if build_runner is listed.
    pubspec_text = pubspec.read_text(encoding="utf-8")
    if "build_runner" not in pubspec_text:
        print("[FLUTTER_CODEGEN] build_runner not in im_core dev_dependencies; skipping code generation")
        return

    flutter = shutil.which("flutter")
    if flutter is None:
        raise RuntimeError("flutter executable not found in PATH")

    _run([flutter, "pub", "get"], cwd=core_dir, env=env, description="Resolving im_core dependencies")
    _run(
        [flutter, "pub", "run", "build_runner", "build", "--delete-conflicting-outputs"],
        cwd=core_dir,
        env=env,
        description="Running build_runner for im_core",
    )
