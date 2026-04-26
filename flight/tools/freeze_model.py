#!/usr/bin/env python3
"""Freeze or update a dev profile into a stable or experimental profile."""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys

from model_profile import (
    DEFAULT_FREEZE_TIER,
    MODELS_ROOT,
    MODEL_TIERS,
    _normalize_profile,
    display_path,
    profile_dir,
    profile_tier,
    update_toml_name,
)


def model_name_from_profile(profile: str) -> str:
    return _normalize_profile(profile).split("/")[-1]


def resolve_target(target: str, tier: str):
    """Resolve a target profile to an absolute path under models/<tier>/."""
    normalized = _normalize_profile(target)
    parts = normalized.split("/")
    if len(parts) >= 2 and parts[0] in MODEL_TIERS:
        return profile_dir(target), parts[0]
    return profile_dir(f"{tier}/{normalized}"), tier


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="source model, for example testbench or dev/testbench")
    parser.add_argument("target", help="target model name, for example quad-x-250")
    parser.add_argument(
        "--tier",
        choices=MODEL_TIERS,
        default=DEFAULT_FREEZE_TIER,
        help=f"target tier when target has no tier prefix (default: {DEFAULT_FREEZE_TIER})",
    )
    parser.add_argument("--force", action="store_true", help="overwrite target profile")
    parser.add_argument("--update", action="store_true", help="alias for --force when updating an existing profile")
    parser.add_argument("--reason", default="Freeze from development profile")
    args = parser.parse_args()

    source = profile_dir(args.source)
    target, target_tier = resolve_target(args.target, args.tier)

    if not (source / "model.toml").exists():
        print(f"ERROR: missing source model.toml: {source}", file=sys.stderr)
        return 2

    try:
        target.relative_to(MODELS_ROOT)
    except ValueError:
        print("ERROR: target model must be under repository models/", file=sys.stderr)
        return 2

    source_tier = profile_tier(args.source)
    if source_tier is None:
        print(f"WARN: source {display_path(source)} is not in a known tier", file=sys.stderr)
    elif source_tier != "dev":
        print(
            f"WARN: source {display_path(source)} is in '{source_tier}' tier (expected 'dev')",
            file=sys.stderr,
        )

    replacing_existing = target.exists()
    if replacing_existing:
        if not (args.force or args.update):
            print(f"ERROR: target exists, pass --force to overwrite: {target}", file=sys.stderr)
            return 2
        shutil.rmtree(target)

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)

    config = target / "model.toml"
    text = config.read_text(encoding="utf-8")
    name = model_name_from_profile(args.target)
    text = update_toml_name(text, name)
    config.write_text(text, encoding="utf-8")

    notes = target / "notes.md"
    date = dt.date.today().isoformat()
    with notes.open("a", encoding="utf-8") as handle:
        action = "Update" if replacing_existing else "Freeze"
        handle.write(f"\n## {date} {action}\n\n")
        handle.write(f"- Source: `{display_path(source)}`\n")
        handle.write(f"- Target tier: `{target_tier}`\n")
        handle.write(f"- Reason: {args.reason}\n")

    verb = "Updated" if replacing_existing else "Frozen"
    print(f"{verb} {display_path(source)} -> {display_path(target)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
