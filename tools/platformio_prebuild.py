"""PlatformIO pre-build hook for selecting an Airyn model profile."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE = os.environ.get("AIRYN_PROFILE", "dev/test_model")

subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_model.py"), PROFILE], cwd=ROOT)

