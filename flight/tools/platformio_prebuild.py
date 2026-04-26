"""PlatformIO pre-build hook for selecting an Airyn model profile."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:
    # SCons exec()s this script without setting __file__. PlatformIO always
    # runs prebuild hooks with cwd set to the project directory.
    ROOT = Path.cwd()

PROFILE = os.environ.get("AIRYN_MODEL") or os.environ.get("AIRYN_PROFILE", "testbench")

subprocess.check_call([sys.executable, str(ROOT / "tools" / "build_model.py"), PROFILE], cwd=ROOT)
