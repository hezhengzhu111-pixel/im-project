#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

# Verify the only non-stdlib runtime dependency before loading the rest of the
# deployment toolkit, so that servers with only docker + python3 get a clear,
# actionable error message instead of a raw ModuleNotFoundError traceback.
try:
    import yaml  # noqa: F401
except ImportError:  # pragma: no cover - depends on target environment
    print(
        "ERROR: PyYAML is required to run the deployment scripts.\n"
        "Install it with one of the following commands and try again:\n"
        "  pip3 install -r scripts/requirements.txt\n"
        "  pip3 install PyYAML\n"
        "  apt-get install -y python3-yaml  # Debian/Ubuntu",
        file=sys.stderr,
    )
    sys.exit(1)

from deploy_system.cli import main  # noqa: E402


if __name__ == "__main__":
    main()
