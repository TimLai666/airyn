"""Shared TOML profile loading and code generation helpers."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import Any


FLIGHT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = FLIGHT_ROOT.parent
MODELS_ROOT = REPO_ROOT / "models"
BOARDS_ROOT = REPO_ROOT / "boards"

MODEL_TIERS = ("dev", "stable", "experimental")
DEFAULT_FREEZE_TIER = "stable"

# Backwards-compatible name used by older helper scripts. Generated firmware
# artifacts remain under flight/build so the firmware project stays standalone.
ROOT = FLIGHT_ROOT


def display_path(path: Path) -> str:
    resolved = path.resolve()
    for base in (REPO_ROOT, FLIGHT_ROOT):
        try:
            return str(resolved.relative_to(base))
        except ValueError:
            continue
    return str(resolved)


def _normalize_profile(profile: str) -> str:
    return profile.strip("/\\").replace("\\", "/")


def profile_dir(profile: str) -> Path:
    candidate = Path(profile)
    if candidate.is_absolute():
        return candidate.resolve()

    normalized = _normalize_profile(profile)
    if normalized.startswith("models/"):
        return (REPO_ROOT / normalized).resolve()

    parts = normalized.split("/")
    if len(parts) >= 2 and parts[0] in MODEL_TIERS:
        return (MODELS_ROOT / Path(*parts)).resolve()

    name = parts[-1]
    for tier in MODEL_TIERS:
        candidate_dir = (MODELS_ROOT / tier / name).resolve()
        if (candidate_dir / "model.toml").exists():
            return candidate_dir

    flat = (MODELS_ROOT / name).resolve()
    if (flat / "model.toml").exists():
        return flat

    legacy = (FLIGHT_ROOT / "profiles_legacy" / name).resolve()
    if (legacy / "model.toml").exists():
        return legacy

    return (MODELS_ROOT / "dev" / name).resolve()


def profile_file(profile: str) -> Path:
    return profile_dir(profile) / "model.toml"


def profile_tier(profile: str) -> str | None:
    """Return the tier name (dev/stable/experimental) for a resolved profile, or None."""
    resolved = profile_dir(profile)
    try:
        relative = resolved.relative_to(MODELS_ROOT)
    except ValueError:
        return None
    parts = relative.parts
    if len(parts) >= 2 and parts[0] in MODEL_TIERS:
        return parts[0]
    return None


def board_file(target_board: str) -> Path:
    return (BOARDS_ROOT / f"{target_board}.toml").resolve()


def load_board(target_board: str) -> dict[str, Any]:
    path = board_file(target_board)
    if not path.exists():
        return {}
    with path.open("rb") as handle:
        return tomllib.load(handle)


def merge_board_into_profile(data: dict[str, Any]) -> dict[str, Any]:
    """Merge boards/<target_board>.toml fields into a model profile in-place.

    Inline `[board]` keys in the model take precedence over the board file so a
    model can override a single field without forking the board definition.
    """
    target = data.get("target_board")
    if not target:
        return data

    board_data = load_board(target)
    if not board_data:
        return data

    inline = data.get("board", {}) or {}
    merged = {**board_data.get("board", {}), **inline}

    for key, value in board_data.items():
        if key == "board":
            continue
        if key not in data:
            data[key] = value

    if merged:
        data["board"] = merged
    return data


def load_profile(profile: str) -> dict[str, Any]:
    config = profile_file(profile)
    with config.open("rb") as handle:
        data = tomllib.load(handle)
    return merge_board_into_profile(data)


def model_name_from_profile(profile: str) -> str:
    return profile.strip("/\\").replace("\\", "/").split("/")[-1]


def c_string(value: str) -> str:
    return json.dumps(value)


def macro_name(value: str) -> str:
    return value.strip().replace("-", "_").replace(" ", "_").upper()


def cpp_array(values: list[Any]) -> str:
    return "{" + ", ".join(str(value) for value in values) + "}"


def cpp_string_array(values: list[str]) -> str:
    return "{" + ", ".join(c_string(value) for value in values) + "}"


def require(mapping: dict[str, Any], keys: list[str], section: str) -> list[str]:
    return [f"{section}.{key}" for key in keys if key not in mapping]


def esc_dshot_rate(esc: dict[str, Any]) -> int:
    protocol = esc["protocol"].upper()
    if protocol == "DSHOT300":
        return 300
    if protocol == "DSHOT600":
        return 600
    if protocol == "DSHOT":
        return int(esc.get("dshot_rate", 300))
    return 0


def normalized_esc_protocol(esc: dict[str, Any]) -> str:
    protocol = esc["protocol"].upper()
    if protocol in {"DSHOT300", "DSHOT600"}:
        return "DSHOT"
    return protocol


def madflight_receiver_type(receiver: dict[str, Any]) -> str:
    receiver_type = receiver["type"].upper()
    if receiver_type == "ELRS":
        return "CRSF"
    return receiver_type


def motor_position_id(position: str) -> int:
    positions = {
        "front": 1,
        "front_right": 2,
        "right": 3,
        "mid_right": 4,
        "rear_right": 5,
        "rear": 6,
        "rear_left": 7,
        "mid_left": 8,
        "left": 9,
        "front_left": 10,
    }
    return positions[position]


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
    elif imu["bus"].lower() == "spi":
        lines.extend(
            [
                f"imu_spi_bus   {imu['spi_bus']}",
                f"pin_imu_cs    {imu['cs_pin']}",
                f"pin_imu_int   {imu['int_pin']}",
                "",
                f"pin_spi{imu['spi_bus']}_miso {imu['miso_pin']}",
                f"pin_spi{imu['spi_bus']}_mosi {imu['mosi_pin']}",
                f"pin_spi{imu['spi_bus']}_sclk {imu['sclk_pin']}",
            ]
        )

    lines.extend(["", f"rcl_gizmo     {madflight_receiver_type(receiver)}"])
    if receiver["type"].upper() == "PPM":
        ppm_bus = receiver.get("ppm_bus_alias", 0)
        lines.append(f"rcl_ser_bus   {ppm_bus}")
        lines.append(f"pin_rcl_ppm   {receiver['pin']}")
        lines.append(f"pin_ser{ppm_bus}_rx  {receiver['pin']}")
    else:
        serial_bus = receiver["serial_bus"]
        lines.extend(
            [
                f"rcl_ser_bus   {serial_bus}",
                f"pin_ser{serial_bus}_rx  {receiver['rx_pin']}",
            ]
        )
        if "tx_pin" in receiver:
            lines.append(f"pin_ser{serial_bus}_tx  {receiver['tx_pin']}")
    lines.append(f"rcl_num_ch    {receiver.get('channels', 8)}")
    lines.append(f"rcl_deadband  {int(float(receiver.get('deadband', 0.0)) * 1000)}")
    channel_map = receiver.get("channel_map", {})
    if channel_map:
        lines.extend(
            [
                f"rcl_thr_ch    {channel_map['throttle']}",
                f"rcl_rol_ch    {channel_map['roll']}",
                f"rcl_pit_ch    {channel_map['pitch']}",
                f"rcl_yaw_ch    {channel_map['yaw']}",
                f"rcl_arm_ch    {channel_map['arm']}",
                f"rcl_flt_ch    {channel_map['mode']}",
            ]
        )

    lines.append("")
    for motor in sorted(motors, key=lambda item: item["output_index"]):
        lines.append(f"pin_out{motor['output_index']}      {motor['pin']}")

    if "led_pin" in board:
        lines.extend(["", f"led_gizmo     {board.get('led_gizmo', 'HIGH_IS_ON')}", f"pin_led       {board['led_pin']}"])

    lines.extend(["", f"ahr_gizmo     {madflight.get('ahr_gizmo', 'MAHONY')}"])

    if normalized_esc_protocol(esc) != "DSHOT":
        lines.append("# Motor protocol is initialized by Airyn firmware.")

    return lines


def generate_header(data: dict[str, Any]) -> str:
    frame_macro = macro_name(data["frame"])
    imu_type = macro_name(data["imu"]["type"])
    receiver_type = macro_name(data["receiver"]["type"])
    esc_protocol = normalized_esc_protocol(data["esc"])
    esc_protocol_macro = macro_name(esc_protocol)
    board = data.get("board", {})
    imu = data["imu"]
    receiver = data["receiver"]
    esc = data["esc"]
    motors = data["motors"]
    safety = data["safety"]
    flight = data["flight"]
    channel_map = receiver["channel_map"]
    rate_limits = flight["rate_limits"]
    pid = data.get("pid", {})
    motor_pins = [motor["pin"] for motor in motors]
    motor_output_indices = [motor["output_index"] for motor in motors]
    motor_position_ids = [motor_position_id(motor["position"]) for motor in motors]
    motor_position_names = [motor["position"] for motor in motors]
    motor_direction_signs = [1 if motor["direction"] == "ccw" else -1 for motor in motors]
    dshot_rate = esc_dshot_rate(esc)
    receiver_channel_names = ["throttle", "roll", "pitch", "yaw", "arm", "mode"]
    pid_axes = ["roll", "pitch", "yaw"]
    pid_keys = ["p", "i", "d"]
    pid_rows = [
        cpp_array([str(float(pid.get(axis, {}).get(key, 0.0))) + "f" for key in pid_keys])
        for axis in pid_axes
    ]

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
        f"#define IMU_ADDRESS 0x{int(imu.get('address', 0)):02X}",
        "",
        f"#define MOTOR_COUNT {len(motors)}",
    ]

    for index, motor in enumerate(motors, start=1):
        output.append(f"#define MOTOR{index}_PIN {motor['pin']}")
        output.append(f"#define MOTOR{index}_OUTPUT_INDEX {motor['output_index']}")
        output.append(f"#define MOTOR{index}_POSITION {c_string(motor['position'])}")
        output.append(f"#define MOTOR{index}_POSITION_{macro_name(motor['position'])} 1")
        output.append(f"#define MOTOR{index}_DIRECTION_{macro_name(motor['direction'])} 1")
        output.append(f"#define MOTOR{index}_DIRECTION_SIGN {1 if motor['direction'] == 'ccw' else -1}")

    output.extend(
        [
            "",
            f"#define ESC_PROTOCOL_{esc_protocol_macro} 1",
            f"#define ESC_DSHOT_RATE {dshot_rate}",
            f"#define ESC_PWM_RATE_HZ {esc.get('pwm_rate_hz', 0)}",
            f"#define ESC_MIN_US {esc.get('min_us', 0)}",
            f"#define ESC_MAX_US {esc.get('max_us', 0)}",
            f"#define ESC_MIN_COMMAND {esc.get('min_command', 0)}",
            f"#define ESC_MAX_COMMAND {esc.get('max_command', 0)}",
            f"#define ESC_IDLE_PERCENT {float(esc.get('idle_percent', 0.0))}f",
            f"#define ESC_TELEMETRY_ENABLED {1 if esc.get('telemetry', False) else 0}",
            "",
            f"#define RECEIVER_TYPE_{receiver_type} 1",
            f"#define RECEIVER_PIN {receiver.get('pin', -1)}",
            f"#define RECEIVER_SERIAL_BUS {receiver.get('serial_bus', -1)}",
            f"#define RECEIVER_RX_PIN {receiver.get('rx_pin', -1)}",
            f"#define RECEIVER_TX_PIN {receiver.get('tx_pin', -1)}",
            f"#define RECEIVER_CHANNELS {receiver.get('channels', 8)}",
            f"#define RECEIVER_DEADBAND {float(receiver.get('deadband', 0.0))}f",
            f"#define RECEIVER_FAILSAFE_TIMEOUT_MS {int(receiver['failsafe_timeout_ms'])}",
            f"#define RECEIVER_CHANNEL_THROTTLE {channel_map['throttle']}",
            f"#define RECEIVER_CHANNEL_ROLL {channel_map['roll']}",
            f"#define RECEIVER_CHANNEL_PITCH {channel_map['pitch']}",
            f"#define RECEIVER_CHANNEL_YAW {channel_map['yaw']}",
            f"#define RECEIVER_CHANNEL_ARM {channel_map['arm']}",
            f"#define RECEIVER_CHANNEL_MODE {channel_map['mode']}",
            f"#define RECEIVER_INDEX_THROTTLE {channel_map['throttle'] - 1}",
            f"#define RECEIVER_INDEX_ROLL {channel_map['roll'] - 1}",
            f"#define RECEIVER_INDEX_PITCH {channel_map['pitch'] - 1}",
            f"#define RECEIVER_INDEX_YAW {channel_map['yaw'] - 1}",
            f"#define RECEIVER_INDEX_ARM {channel_map['arm'] - 1}",
            f"#define RECEIVER_INDEX_MODE {channel_map['mode'] - 1}",
            "",
            f"#define SAFETY_ARM_THROTTLE_THRESHOLD {float(safety['arm_throttle_threshold'])}f",
            f"#define SAFETY_ARMED_IDLE_THROTTLE {float(safety['armed_idle_throttle'])}f",
            f"#define SAFETY_MIN_OUTPUT {float(safety['min_output'])}f",
            f"#define SAFETY_MAX_OUTPUT {float(safety['max_output'])}f",
            f"#define SAFETY_DISARM_BEHAVIOR_{macro_name(safety['disarm_behavior'])} 1",
            "",
            f"#define FLIGHT_MODE_{macro_name(flight['mode'])} 1",
            f"#define RATE_LIMIT_ROLL_DPS {float(rate_limits['roll_dps'])}f",
            f"#define RATE_LIMIT_PITCH_DPS {float(rate_limits['pitch_dps'])}f",
            f"#define RATE_LIMIT_YAW_DPS {float(rate_limits['yaw_dps'])}f",
            f"#define PID_INTEGRATOR_LIMIT {float(pid['integrator_limit'])}f",
            f"#define PID_OUTPUT_LIMIT {float(pid['output_limit'])}f",
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

    output.extend(
        [
            "",
            "namespace airyn {",
            "namespace config {",
            f"static constexpr int kMotorPins[MOTOR_COUNT] = {cpp_array(motor_pins)};",
            f"static constexpr int kMotorOutputIndices[MOTOR_COUNT] = {cpp_array(motor_output_indices)};",
            f"static constexpr int kMotorPositionIds[MOTOR_COUNT] = {cpp_array(motor_position_ids)};",
            f"static constexpr const char* kMotorPositions[MOTOR_COUNT] = {cpp_string_array(motor_position_names)};",
            f"static constexpr int kMotorDirectionSigns[MOTOR_COUNT] = {cpp_array(motor_direction_signs)};",
            f"static constexpr int kReceiverChannelMap[6] = {cpp_array([channel_map[name] for name in receiver_channel_names])};",
            f"static constexpr int kReceiverChannelIndices[6] = {cpp_array([channel_map[name] - 1 for name in receiver_channel_names])};",
            f"static constexpr float kRateLimitsDps[3] = {cpp_array([str(float(rate_limits[name])) + 'f' for name in ['roll_dps', 'pitch_dps', 'yaw_dps']])};",
            f"static constexpr float kPidGains[3][3] = {{{', '.join(pid_rows)}}};",
            "}",
            "}",
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
