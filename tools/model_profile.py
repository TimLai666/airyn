"""Shared TOML profile loading and code generation helpers."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def profile_dir(profile: str) -> Path:
    candidate = Path(profile)
    if not candidate.is_absolute():
        candidate = ROOT / "profiles" / profile
    return candidate.resolve()


def profile_file(profile: str) -> Path:
    return profile_dir(profile) / "model.toml"


def load_profile(profile: str) -> dict[str, Any]:
    config = profile_file(profile)
    with config.open("rb") as handle:
        return tomllib.load(handle)


def model_name_from_profile(profile: str) -> str:
    return profile.strip("/\\").replace("\\", "/").split("/")[-1]


def c_string(value: str) -> str:
    return json.dumps(value)


def macro_name(value: str) -> str:
    return value.strip().replace("-", "_").replace(" ", "_").upper()


def require(mapping: dict[str, Any], keys: list[str], section: str) -> list[str]:
    return [f"{section}.{key}" for key in keys if key not in mapping]


def generate_madflight_config(data: dict[str, Any]) -> list[str]:
    imu = data["imu"]
    receiver = data["receiver"]
    board = data.get("board", {})
    esc = data["esc"]
    madflight = data.get("madflight", {})
    motors = data["motors"]

    lines = [
        f"imu_gizmo     {imu['type']}",
        f"imu_bus_type  {imu['bus'].upper()}",
    ]

    if imu["bus"].lower() == "i2c":
        lines.extend(
            [
                f"imu_i2c_bus   {imu['i2c_bus']}",
                f"imu_i2c_adr   {imu['address']}",
                f"pin_imu_int   {imu['int_pin']}",
                "",
                f"pin_i2c{imu['i2c_bus']}_sda  {imu['sda_pin']}",
                f"pin_i2c{imu['i2c_bus']}_scl  {imu['scl_pin']}",
            ]
        )

    lines.extend(["", f"rcl_gizmo     {receiver['type']}"])
    if receiver["type"].upper() == "PPM":
        lines.append(f"pin_rcl_ppm   {receiver['pin']}")
    else:
        lines.append(f"rcl_ser_bus   {receiver.get('serial_bus', -1)}")
    lines.append(f"rcl_num_ch    {receiver.get('channels', 8)}")

    lines.append("")
    for index, motor in enumerate(motors):
        lines.append(f"pin_out{index}      {motor['pin']}")

    if "led_pin" in board:
        lines.extend(["", f"led_gizmo     {board.get('led_gizmo', 'HIGH_IS_ON')}", f"pin_led       {board['led_pin']}"])

    lines.extend(["", f"ahr_gizmo     {madflight.get('ahr_gizmo', 'MAHONY')}"])

    if esc["protocol"].upper() != "DSHOT":
        lines.append("# Motor protocol is initialized by Airyn firmware.")

    return lines


def generate_header(data: dict[str, Any]) -> str:
    frame_macro = macro_name(data["frame"])
    imu_type = macro_name(data["imu"]["type"])
    receiver_type = macro_name(data["receiver"]["type"])
    esc_protocol = macro_name(data["esc"]["protocol"])
    board = data.get("board", {})
    imu = data["imu"]
    receiver = data["receiver"]
    esc = data["esc"]
    motors = data["motors"]
    pid = data.get("pid", {})

    output: list[str] = [
        "#pragma once",
        "",
        f"#define MODEL_NAME {c_string(data['name'])}",
        f"#define TARGET_BOARD {c_string(data['target_board'])}",
        f"#define FRAME_TYPE_{frame_macro} 1",
        "",
        f"#define IMU_TYPE_{imu_type} 1",
        f"#define IMU_I2C_BUS {imu.get('i2c_bus', -1)}",
        f"#define IMU_SDA_PIN {imu.get('sda_pin', -1)}",
        f"#define IMU_SCL_PIN {imu.get('scl_pin', -1)}",
        f"#define IMU_INT_PIN {imu.get('int_pin', -1)}",
        f"#define IMU_ADDRESS 0x{int(imu['address']):02X}",
        "",
        f"#define MOTOR_COUNT {len(motors)}",
    ]

    for index, motor in enumerate(motors, start=1):
        output.append(f"#define MOTOR{index}_PIN {motor['pin']}")

    output.extend(
        [
            "",
            f"#define ESC_PROTOCOL_{esc_protocol} 1",
            f"#define ESC_DSHOT_RATE {esc.get('dshot_rate', 0)}",
            "",
            f"#define RECEIVER_TYPE_{receiver_type} 1",
            f"#define RECEIVER_PIN {receiver.get('pin', -1)}",
        ]
    )

    if "led_pin" in board:
        output.append("")
        output.append(f"#define LED_PIN {board['led_pin']}")

    for axis in ("roll", "pitch", "yaw"):
        axis_data = pid.get(axis, {})
        prefix = axis.upper()
        output.extend(
            [
                "",
                f"#define PID_{prefix}_P {float(axis_data.get('p', 0.0))}f",
                f"#define PID_{prefix}_I {float(axis_data.get('i', 0.0))}f",
                f"#define PID_{prefix}_D {float(axis_data.get('d', 0.0))}f",
            ]
        )

    output.extend(["", f"#define AIRYN_MADFLIGHT_BOARD {c_string(board.get('madflight_board', 'brd/default.h'))}", ""])

    config_lines = generate_madflight_config(data)
    output.append("#define AIRYN_MADFLIGHT_CONFIG \\")
    for index, line in enumerate(config_lines):
        suffix = " \\" if index < len(config_lines) - 1 else ""
        output.append(f"  {c_string(line + chr(10))}{suffix}")

    output.append("")
    return "\n".join(output)


def update_toml_name(text: str, name: str) -> str:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.strip().startswith("name"):
            lines[index] = f'name = "{name}"'
            return "\n".join(lines) + "\n"
    return f'name = "{name}"\n' + text

