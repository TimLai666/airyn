#!/usr/bin/env python3
"""Validate an Airyn Flight model profile."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFINE_RE = re.compile(r"^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*$")


def profile_dir(profile: str) -> Path:
    candidate = Path(profile)
    if not candidate.is_absolute():
        candidate = ROOT / "profiles" / profile
    return candidate.resolve()


def parse_defines(config: Path) -> dict[str, str]:
    defines: dict[str, str] = {}
    for line in config.read_text(encoding="utf-8").splitlines():
        match = DEFINE_RE.match(line)
        if match:
            defines[match.group(1)] = match.group(2).strip()
    return defines


def parse_int(value: str) -> int | None:
    value = value.split("//", 1)[0].strip()
    if value.startswith('"') or value.startswith("R\""):
        return None
    try:
        return int(value.rstrip("uUlLfF"), 0)
    except ValueError:
        return None


def require(defines: dict[str, str], names: list[str]) -> list[str]:
    return [name for name in names if name not in defines]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", default="dev/test_model")
    args = parser.parse_args()

    directory = profile_dir(args.profile)
    config = directory / "model_config.h"
    if not config.exists():
        print(f"ERROR: missing {config}", file=sys.stderr)
        return 2

    defines = parse_defines(config)
    required = [
        "MODEL_NAME",
        "TARGET_BOARD",
        "MOTOR_COUNT",
        "IMU_I2C_BUS",
        "IMU_SDA_PIN",
        "IMU_SCL_PIN",
        "RECEIVER_PIN",
        "AIRYN_MADFLIGHT_CONFIG",
    ]
    missing = require(defines, required)
    if missing:
        print("ERROR: missing defines: " + ", ".join(missing), file=sys.stderr)
        return 2

    motor_count = parse_int(defines["MOTOR_COUNT"])
    if motor_count is None or motor_count <= 0:
        print("ERROR: MOTOR_COUNT must be a positive integer", file=sys.stderr)
        return 2

    missing_motors = [f"MOTOR{i}_PIN" for i in range(1, motor_count + 1) if f"MOTOR{i}_PIN" not in defines]
    if missing_motors:
        print("ERROR: missing motor pin defines: " + ", ".join(missing_motors), file=sys.stderr)
        return 2

    pins: dict[int, str] = {}
    pin_names = ["IMU_SDA_PIN", "IMU_SCL_PIN", "IMU_INT_PIN", "RECEIVER_PIN", "LED_PIN"]
    pin_names.extend(f"MOTOR{i}_PIN" for i in range(1, motor_count + 1))

    for name in pin_names:
        if name not in defines:
            continue
        pin = parse_int(defines[name])
        if pin is None or pin < 0:
            continue
        if pin in pins:
            print(f"ERROR: GPIO {pin} used by both {pins[pin]} and {name}", file=sys.stderr)
            return 2
        pins[pin] = name

    if "FRAME_TYPE_QUAD_X" in defines and motor_count != 4:
        print("ERROR: FRAME_TYPE_QUAD_X requires MOTOR_COUNT 4", file=sys.stderr)
        return 2

    print(f"OK: {directory.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

