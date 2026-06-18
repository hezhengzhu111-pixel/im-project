#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from deploy_system.legacy import legacy_init_db  # noqa: E402


if __name__ == "__main__":
    legacy_init_db(sys.argv[1:])
