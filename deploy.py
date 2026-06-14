#!/usr/bin/env python3
from __future__ import annotations

import runpy
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))


def main() -> None:
    runpy.run_path(str(SCRIPTS_DIR / "deploy.py"), run_name="__main__")


if __name__ == "__main__":
    main()
