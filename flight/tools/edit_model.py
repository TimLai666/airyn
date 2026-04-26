#!/usr/bin/env python3
"""Copy an existing profile into a dev editing profile."""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys

from model_profile import MODELS_ROOT, display_path, profile_dir


def default_target(source: str) -> str:
    name = source.strip("/\\").replace("\\", "/").split("/")[-1]
    return f"{name}_edit"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="existing model, for example testbench or quad-x-250")
    parser.add_argument("--target", help="editing model name, defaults to <name>_edit")
    parser.add_argument("--force", action="store_true", help="overwrite target editing profile")
    parser.add_argument("--reason", default="Prepare profile edit")
    args = parser.parse_args()

    target_profile = args.target or default_target(args.source)
    source = profile_dir(args.source)
    target = profile_dir(target_profile)

    if not (source / "model.toml").exists():
        print(f"ERROR: missing source model.toml: {source}", file=sys.stderr)
        return 2

    try:
        target.relative_to(MODELS_ROOT)
    except ValueError:
        print("ERROR: edit target must be under repository models/", file=sys.stderr)
        return 2

    if target.exists():
        if not args.force:
            print(f"ERROR: target exists, pass --force to overwrite: {target}", file=sys.stderr)
            return 2
        shutil.rmtree(target)

    shutil.copytree(source, target)

    notes = target / "notes.md"
    date = dt.date.today().isoformat()
    with notes.open("a", encoding="utf-8") as handle:
        handle.write(f"\n## {date} Edit Session\n\n")
        handle.write(f"- Source: `{args.source}`\n")
        handle.write(f"- Reason: {args.reason}\n")
        handle.write("- Status: editing copy, not yet written back to stable.\n")

    print(f"Copied {display_path(source)} -> {display_path(target)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
