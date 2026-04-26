#!/usr/bin/env python3
"""Validate an Airyn Flight TOML model profile."""

from __future__ import annotations

import argparse
import sys

from model_profile import display_path, load_profile, profile_file, require

SUPPORTED_FRAMES = {
    "quad_x": {
        "motor_count": 4,
        "positions": {"front_right", "rear_right", "rear_left", "front_left"},
    },
    "quad_plus": {
        "motor_count": 4,
        "positions": {"front", "right", "rear", "left"},
    },
    "hex_x": {
        "motor_count": 6,
        "positions": {"front_right", "mid_right", "rear_right", "rear_left", "mid_left", "front_left"},
    },
}

RECEIVER_PROTOCOLS = {"PPM", "SBUS", "CRSF", "ELRS"}
SERIAL_RECEIVERS = {"SBUS", "CRSF", "ELRS"}
ESC_PROTOCOLS = {"PWM", "ONESHOT125", "DSHOT", "DSHOT300", "DSHOT600"}
MOTOR_DIRECTIONS = {"cw", "ccw"}
RECEIVER_CHANNELS = ("throttle", "roll", "pitch", "yaw", "arm", "mode")
PID_AXES = ("roll", "pitch", "yaw")


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 2


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", nargs="?", default="testbench")
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
    missing.extend(
        require(data, ["name", "target_board", "frame", "imu", "receiver", "esc", "motors", "safety", "flight", "pid"], "model")
    )
    if "imu" in data:
        missing.extend(require(data["imu"], ["type", "bus", "int_pin"], "imu"))
        bus = str(data["imu"].get("bus", "")).lower()
        if bus == "i2c":
            missing.extend(require(data["imu"], ["i2c_bus", "sda_pin", "scl_pin", "address"], "imu"))
        elif bus == "spi":
            missing.extend(require(data["imu"], ["spi_bus", "miso_pin", "mosi_pin", "sclk_pin", "cs_pin"], "imu"))
    if "receiver" in data:
        missing.extend(require(data["receiver"], ["type", "channels", "deadband", "failsafe_timeout_ms", "channel_map"], "receiver"))
        if "channel_map" in data["receiver"]:
            missing.extend(require(data["receiver"]["channel_map"], list(RECEIVER_CHANNELS), "receiver.channel_map"))
    if "esc" in data:
        missing.extend(require(data["esc"], ["protocol", "telemetry", "idle_percent", "min_command", "max_command"], "esc"))
    if "safety" in data:
        missing.extend(
            require(
                data["safety"],
                ["arm_throttle_threshold", "armed_idle_throttle", "min_output", "max_output", "disarm_behavior"],
                "safety",
            )
        )
    if "flight" in data:
        missing.extend(require(data["flight"], ["mode", "rate_limits"], "flight"))
        if "rate_limits" in data["flight"]:
            missing.extend(require(data["flight"]["rate_limits"], ["roll_dps", "pitch_dps", "yaw_dps"], "flight.rate_limits"))
    if "pid" in data:
        missing.extend(require(data["pid"], ["integrator_limit", "output_limit"], "pid"))
        for axis in PID_AXES:
            if axis not in data["pid"]:
                missing.append(f"pid.{axis}")
            else:
                missing.extend(require(data["pid"][axis], ["p", "i", "d"], f"pid.{axis}"))
    if missing:
        return fail("missing TOML keys: " + ", ".join(missing))

    frame = data["frame"]
    if frame not in SUPPORTED_FRAMES:
        return fail(f"unsupported frame {frame!r}; expected one of {', '.join(SUPPORTED_FRAMES)}")

    motors = data["motors"]
    if not isinstance(motors, list) or not motors:
        return fail("motors must be a non-empty array")

    expected_motor_count = SUPPORTED_FRAMES[frame]["motor_count"]
    if len(motors) != expected_motor_count:
        return fail(f"frame {frame} requires exactly {expected_motor_count} motors")

    receiver = data["receiver"]
    receiver_type = str(receiver["type"]).upper()
    if receiver_type not in RECEIVER_PROTOCOLS:
        return fail(f"unsupported receiver.type {receiver['type']!r}")
    if receiver_type == "PPM" and "pin" not in receiver:
        return fail("receiver.pin is required for PPM")
    if receiver_type in SERIAL_RECEIVERS:
        for key in ("serial_bus", "rx_pin"):
            if key not in receiver:
                return fail(f"receiver.{key} is required for {receiver_type}")
    if not isinstance(receiver["channels"], int) or receiver["channels"] < 1:
        return fail("receiver.channels must be a positive integer")
    for name, channel in receiver["channel_map"].items():
        if name not in RECEIVER_CHANNELS:
            return fail(f"unsupported receiver.channel_map.{name}")
        if not isinstance(channel, int) or channel < 1 or channel > receiver["channels"]:
            return fail(f"receiver.channel_map.{name} must be between 1 and receiver.channels")

    esc = data["esc"]
    esc_protocol = str(esc["protocol"]).upper()
    if esc_protocol not in ESC_PROTOCOLS:
        return fail(f"unsupported esc.protocol {esc['protocol']!r}")
    if esc_protocol == "DSHOT":
        if esc.get("dshot_rate") not in (300, 600):
            return fail("esc.dshot_rate must be 300 or 600 for DSHOT")
    if esc_protocol in {"DSHOT300", "DSHOT600"} and "dshot_rate" in esc:
        expected_rate = 300 if esc_protocol == "DSHOT300" else 600
        if esc["dshot_rate"] != expected_rate:
            return fail(f"esc.dshot_rate must match esc.protocol {esc_protocol}")
    if esc_protocol == "PWM":
        for key in ("pwm_rate_hz", "min_us", "max_us"):
            if key not in esc:
                return fail(f"esc.{key} is required for PWM")
    if esc_protocol == "ONESHOT125":
        for key in ("min_us", "max_us"):
            if key not in esc:
                return fail(f"esc.{key} is required for OneShot125")
    for key in ("idle_percent", "min_command", "max_command"):
        if not is_number(esc[key]):
            return fail(f"esc.{key} must be numeric")
    if esc["min_command"] > esc["max_command"]:
        return fail("esc.min_command must be less than or equal to esc.max_command")

    safety = data["safety"]
    if safety["disarm_behavior"] not in {"stop", "idle"}:
        return fail("safety.disarm_behavior must be stop or idle")
    for key in ("arm_throttle_threshold", "armed_idle_throttle", "min_output", "max_output"):
        if not is_number(safety[key]):
            return fail(f"safety.{key} must be numeric")
    if not 0.0 <= safety["min_output"] <= safety["max_output"] <= 1.0:
        return fail("safety output range must satisfy 0.0 <= min_output <= max_output <= 1.0")
    if not 0.0 <= safety["arm_throttle_threshold"] <= 1.0:
        return fail("safety.arm_throttle_threshold must be between 0.0 and 1.0")
    if not safety["min_output"] <= safety["armed_idle_throttle"] <= safety["max_output"]:
        return fail("safety.armed_idle_throttle must be within min_output/max_output")

    flight = data["flight"]
    if flight["mode"] != "rate":
        return fail("flight.mode currently supports rate only")
    for key in ("roll_dps", "pitch_dps", "yaw_dps"):
        if not is_number(flight["rate_limits"][key]) or flight["rate_limits"][key] <= 0:
            return fail(f"flight.rate_limits.{key} must be a positive number")

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
    if str(imu["bus"]).lower() == "i2c":
        for key in ("sda_pin", "scl_pin", "int_pin"):
            if not add_pin(f"imu.{key}", imu[key]):
                return 2
    elif str(imu["bus"]).lower() == "spi":
        for key in ("miso_pin", "mosi_pin", "sclk_pin", "cs_pin", "int_pin"):
            if not add_pin(f"imu.{key}", imu[key]):
                return 2
    else:
        return fail("imu.bus must be i2c or spi")

    if "pin" in receiver and not add_pin("receiver.pin", receiver["pin"]):
        return 2
    for key in ("rx_pin", "tx_pin"):
        if key in receiver and not add_pin(f"receiver.{key}", receiver[key]):
            return 2

    board = data.get("board", {})
    if "led_pin" in board and not add_pin("board.led_pin", board["led_pin"]):
        return 2

    positions: set[str] = set()
    output_indices: set[int] = set()
    allowed_positions = SUPPORTED_FRAMES[frame]["positions"]
    for index, motor in enumerate(motors, start=1):
        missing_motor = require(motor, ["name", "pin", "output_index", "position", "direction"], f"motors[{index}]")
        if missing_motor:
            return fail("missing TOML keys: " + ", ".join(missing_motor))
        if not add_pin(f"motors[{index}].pin", motor["pin"]):
            return 2
        if motor["position"] not in allowed_positions:
            return fail(f"motors[{index}].position {motor['position']!r} is invalid for {frame}")
        if motor["position"] in positions:
            return fail(f"duplicate motor position {motor['position']!r}")
        positions.add(motor["position"])
        if motor["direction"] not in MOTOR_DIRECTIONS:
            return fail(f"motors[{index}].direction must be cw or ccw")
        output_index = motor["output_index"]
        if not isinstance(output_index, int) or output_index < 0 or output_index >= len(motors):
            return fail(f"motors[{index}].output_index must be in range 0..{len(motors) - 1}")
        if output_index in output_indices:
            return fail(f"duplicate motor output_index {output_index}")
        output_indices.add(output_index)

    for axis in PID_AXES:
        if not is_number(data["pid"]["integrator_limit"]) or data["pid"]["integrator_limit"] < 0:
            return fail("pid.integrator_limit must be a non-negative number")
        if not is_number(data["pid"]["output_limit"]) or data["pid"]["output_limit"] < 0:
            return fail("pid.output_limit must be a non-negative number")
        for key in ("p", "i", "d"):
            if not is_number(data["pid"][axis][key]):
                return fail(f"pid.{axis}.{key} must be numeric")

    print(f"OK: {display_path(config.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
