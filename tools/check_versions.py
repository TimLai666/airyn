#!/usr/bin/env python3
"""Check that each Airyn project version is explicit and synchronized."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$")


def read_version(path: Path) -> str:
    version = path.read_text(encoding="utf-8").strip()
    if not VERSION_RE.match(version):
        raise ValueError(f"{path.relative_to(ROOT)} has invalid version {version!r}")
    return version


def require_equal(name: str, left: str, right: str, right_name: str) -> None:
    if left != right:
        raise ValueError(f"{name} version {left!r} does not match {right_name} {right!r}")


def main() -> int:
    try:
        flight = read_version(ROOT / "flight" / "VERSION")
        mission = read_version(ROOT / "mission" / "VERSION")
        ground = read_version(ROOT / "ground" / "VERSION")

        mission_source = (ROOT / "mission" / "internal" / "app" / "version.go").read_text(encoding="utf-8")
        mission_match = re.search(r'const Version = "([^"]+)"', mission_source)
        if not mission_match:
            raise ValueError("mission/internal/app/version.go does not define const Version")
        require_equal("mission/VERSION", mission, mission_match.group(1), "mission app Version")

        package_json = json.loads((ROOT / "ground" / "package.json").read_text(encoding="utf-8"))
        require_equal("ground/VERSION", ground, package_json["version"], "ground/package.json")

        ground_config = (ROOT / "ground" / "electrobun.config.ts").read_text(encoding="utf-8")
        ground_match = re.search(r'version:\s*"([^"]+)"', ground_config)
        if not ground_match:
            raise ValueError("ground/electrobun.config.ts does not define app.version")
        require_equal("ground/VERSION", ground, ground_match.group(1), "ground Electrobun config")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"OK: flight={flight} mission={mission} ground={ground}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
