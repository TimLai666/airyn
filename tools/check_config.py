#!/usr/bin/env python3
"""Validate an Airyn Flight TOML model profile."""

from __future__ import annotations

import argparse
import sys

from model_profile import ROOT, load_profile, profile_file, require


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", default="dev/test_model")
    args = parser.parse_args()

    config = profile_file(args.profile)
    if not config.exists():
        print(f"ERROR: missing {config}", file=sys.stderr)
        return 2

    try:
        data = load_profile(args.profile)
    except Exception as exc:
        print(f"ERROR: cannot parse {config}: {exc}", file=sys.stderr)
        return 2

    missing: list[str] = []
    missing.extend(require(data, ["name", "target_board", "frame", "imu", "receiver", "esc", "motors"], "model"))
    if "imu" in data:
        missing.extend(require(data["imu"], ["type", "bus", "i2c_bus", "sda_pin", "scl_pin", "int_pin", "address"], "imu"))
    if "receiver" in data:
        missing.extend(require(data["receiver"], ["type"], "receiver"))
    if "esc" in data:
        missing.extend(require(data["esc"], ["protocol"], "esc"))
    if missing:
        print("ERROR: missing TOML keys: " + ", ".join(missing), file=sys.stderr)
        return 2

    motors = data["motors"]
    if not isinstance(motors, list) or not motors:
        print("ERROR: motors must be a non-empty array", file=sys.stderr)
        return 2

    if data["frame"] == "quad_x" and len(motors) != 4:
        print("ERROR: frame quad_x requires exactly 4 motors", file=sys.stderr)
        return 2

    pins: dict[int, str] = {}

    def add_pin(name: str, value: object) -> bool:
        if not isinstance(value, int) or value < 0:
            return True
        if value in pins:
            print(f"ERROR: GPIO {value} used by both {pins[value]} and {name}", file=sys.stderr)
            return False
        pins[value] = name
        return True

    imu = data["imu"]
    for key in ("sda_pin", "scl_pin", "int_pin"):
        if not add_pin(f"imu.{key}", imu[key]):
            return 2

    receiver = data["receiver"]
    if "pin" in receiver and not add_pin("receiver.pin", receiver["pin"]):
        return 2

    board = data.get("board", {})
    if "led_pin" in board and not add_pin("board.led_pin", board["led_pin"]):
        return 2

    for index, motor in enumerate(motors, start=1):
        if "pin" not in motor:
            print(f"ERROR: motors[{index}] missing pin", file=sys.stderr)
            return 2
        if not add_pin(f"motors[{index}].pin", motor["pin"]):
            return 2

    print(f"OK: {config.parent.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

