#!/usr/bin/env python3
"""Copy an existing profile into a dev editing profile."""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def as_profile_dir(profile: str) -> Path:
    candidate = Path(profile)
    if not candidate.is_absolute():
        candidate = ROOT / "profiles" / profile
    return candidate.resolve()


def default_target(source: str) -> str:
    name = source.strip("/\\").replace("\\", "/").split("/")[-1]
    return f"dev/{name}_edit"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="existing profile, for example stable/quad_x_basic")
    parser.add_argument("--target", help="dev editing profile, defaults to dev/<name>_edit")
    parser.add_argument("--force", action="store_true", help="overwrite target editing profile")
    parser.add_argument("--reason", default="Prepare profile edit")
    args = parser.parse_args()

    target_profile = args.target or default_target(args.source)
    source = as_profile_dir(args.source)
    target = as_profile_dir(target_profile)

    if not (source / "model.toml").exists():
        print(f"ERROR: missing source model.toml: {source}", file=sys.stderr)
        return 2

    if not target_profile.replace("\\", "/").startswith("dev/"):
        print("ERROR: edit target must be under profiles/dev/", file=sys.stderr)
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

    print(f"Copied {args.source} -> {target_profile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
