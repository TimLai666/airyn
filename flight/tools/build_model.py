#!/usr/bin/env python3
"""Generate firmware build artifacts from the selected TOML profile."""

from __future__ import annotations

import argparse
import subprocess
import sys

from model_profile import ROOT, display_path, generate_header, load_profile, profile_file


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", default="testbench")
    args = parser.parse_args()

    config = profile_file(args.profile)
    if not config.exists():
        print(f"ERROR: missing {config}", file=sys.stderr)
        return 2

    check = subprocess.run([sys.executable, str(ROOT / "tools" / "check_config.py"), args.profile], cwd=ROOT)
    if check.returncode != 0:
        return check.returncode

    data = load_profile(args.profile)

    output_dir = ROOT / "build" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / "active_model_config.h"
    output.write_text(generate_header(data), encoding="utf-8")

    print(f"Generated {display_path(output)} from {display_path(config)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
