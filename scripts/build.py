#!/usr/bin/env python3
"""Thin wrapper around imctl.py build for backwards compatibility."""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))


def main() -> None:
    """Delegate to imctl.py build."""
    import subprocess

    # Forward all arguments to imctl.py build
    cmd = [sys.executable, str(SCRIPTS_DIR / "imctl.py"), "build", *sys.argv[1:]]
    result = subprocess.run(cmd)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
