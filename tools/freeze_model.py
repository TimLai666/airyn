#!/usr/bin/env python3
"""Copy a dev profile into a stable or experimental profile."""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def as_profile_dir(profile: str) -> Path:
    candidate = Path(profile)
    if not candidate.is_absolute():
        candidate = ROOT / "profiles" / profile
    return candidate.resolve()


def model_name_from_profile(profile: str) -> str:
    return profile.strip("/\\").replace("\\", "/").split("/")[-1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="source profile, for example dev/test_model")
    parser.add_argument("target", help="target profile, for example stable/quad_x_basic")
    parser.add_argument("--force", action="store_true", help="overwrite target profile")
    parser.add_argument("--reason", default="Freeze from development profile")
    args = parser.parse_args()

    source = as_profile_dir(args.source)
    target = as_profile_dir(args.target)

    if not (source / "model_config.h").exists():
        print(f"ERROR: missing source model_config.h: {source}", file=sys.stderr)
        return 2

    if target.exists():
        if not args.force:
            print(f"ERROR: target exists, pass --force to overwrite: {target}", file=sys.stderr)
            return 2
        shutil.rmtree(target)

    shutil.copytree(source, target)

    config = target / "model_config.h"
    text = config.read_text(encoding="utf-8")
    name = model_name_from_profile(args.target)
    text = re.sub(r'#define\s+MODEL_NAME\s+".*?"', f'#define MODEL_NAME "{name}"', text)
    config.write_text(text, encoding="utf-8")

    notes = target / "notes.md"
    date = dt.date.today().isoformat()
    with notes.open("a", encoding="utf-8") as handle:
        handle.write(f"\n## {date} Freeze\n\n")
        handle.write(f"- Source: `{args.source}`\n")
        handle.write(f"- Reason: {args.reason}\n")

    print(f"Frozen {args.source} -> {args.target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

