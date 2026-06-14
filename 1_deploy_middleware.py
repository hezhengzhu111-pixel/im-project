#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from deploy_middleware import main  # noqa: E402


if __name__ == "__main__":
    main()
