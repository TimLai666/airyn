#!/usr/bin/env python3
"""Generate the active model config include for the selected profile."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", default="dev/test_model")
    args = parser.parse_args()

    profile_dir = (ROOT / "profiles" / args.profile).resolve()
    config = profile_dir / "model_config.h"
    if not config.exists():
        print(f"ERROR: missing {config}", file=sys.stderr)
        return 2

    check = subprocess.run([sys.executable, str(ROOT / "tools" / "check_config.py"), args.profile], cwd=ROOT)
    if check.returncode != 0:
        return check.returncode

    output_dir = ROOT / "build" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "active_model_config.h"

    include_path = Path("..") / ".." / "profiles" / args.profile / "model_config.h"
    include_path = include_path.as_posix()
    output.write_text(
        "#pragma once\n"
        f'#include "{include_path}"\n',
        encoding="utf-8",
    )

    print(f"Generated {output.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

