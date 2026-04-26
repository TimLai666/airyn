# Model Config

Each model profile is a directory under `profiles/`:

```text
profiles/dev/test_model/
├── model.toml
├── wiring.md
└── notes.md
```

## Rules

- Keep model-specific values in `model.toml`.
- Keep physical wiring in `wiring.md`.
- Keep test status and changes in `notes.md`.
- Existing stable profiles are allowed to change, but change them through a dev editing copy and record the reason.
- Do not move tested stable settings directly into source code.

## Active Profile

PlatformIO runs `tools/platformio_prebuild.py` before every build. That hook reads `AIRYN_PROFILE`, defaults to `dev/test_model`, validates the profile, and creates build artifacts.

Normal build is one command:

```bash
pio run -e RP2350A
```

That generates firmware build artifacts:

```text
build/generated/active_model_config.h
```

The firmware includes that generated header through `src/madflight_config.h`. The generated header is an implementation detail for MCU builds; do not edit it by hand.

## Validation

Manual validation is optional during normal builds because `pio run` invokes it automatically:

```bash
python tools/check_config.py dev/test_model
```

The checker validates:

- required model, IMU, receiver, ESC, safety, flight, motor, and PID keys
- supported frames: `quad_x`, `quad_plus`, and future `hex_x`
- motor `position`, `direction` (`cw` or `ccw`), unique `output_index`, and unique GPIO pins
- receiver protocol requirements for `PPM`, `SBUS`, `CRSF`, and `ELRS`
- receiver channel map values for throttle, roll, pitch, yaw, arm, and mode
- ESC protocol requirements for `PWM`, `ONESHOT125`, `DSHOT300`, and `DSHOT600`
- safety output limits, rate limits, PID groups, and GPIO conflicts

## TOML Schema

The profile describes the aircraft rather than raw firmware constants.

```toml
name = "dev_test_model"
target_board = "pico2_breadboard_dev"
frame = "quad_x"
```

Supported `frame` values are `quad_x`, `quad_plus`, and `hex_x`. `hex_x` is schema-valid only with six motors; firmware support is planned later.

Receiver settings include protocol wiring, channel count, channel map, deadband, and failsafe timeout:

```toml
[receiver]
type = "PPM"
pin = 8
ppm_bus_alias = 0
channels = 8
deadband = 0.03
failsafe_timeout_ms = 250

[receiver.channel_map]
throttle = 1
roll = 2
pitch = 3
yaw = 4
arm = 5
mode = 6
```

For PPM, `ppm_bus_alias` is used to generate the MadFlight `pin_serX_rx` alias needed by the current pinned MadFlight version. For serial receivers (`SBUS`, `CRSF`, `ELRS`), use `serial_bus`, `rx_pin`, and optional `tx_pin` instead of `pin`.

ESC settings describe the output protocol and protocol-specific details:

```toml
[esc]
protocol = "DSHOT"
dshot_rate = 300
telemetry = false
idle_percent = 5.0
min_command = 0
max_command = 2000
```

`protocol = "PWM"` requires `pwm_rate_hz`, `min_us`, and `max_us`. `protocol = "ONESHOT125"` requires `min_us` and `max_us`. `DSHOT300` and `DSHOT600` are also accepted as protocol names.

Safety and rate-mode settings are required:

```toml
[safety]
arm_throttle_threshold = 0.05
armed_idle_throttle = 0.06
min_output = 0.0
max_output = 1.0
disarm_behavior = "stop"

[flight]
mode = "rate"

[flight.rate_limits]
roll_dps = 360.0
pitch_dps = 360.0
yaw_dps = 180.0
```

Each motor must define its firmware output slot, physical GPIO, frame position, and spin direction:

```toml
[[motors]]
name = "M1"
pin = 2
output_index = 0
position = "front_right"
direction = "ccw"
```

Motor `output_index` values are zero-based MadFlight output indices and must be unique.

PID settings include shared limits plus per-axis gains:

```toml
[pid]
integrator_limit = 25.0
output_limit = 1.0

[pid.roll]
p = 40.0
i = 0.0
d = 15.0
```

## Generated Header Contract

`build/generated/active_model_config.h` contains compatibility macros plus structured constants for firmware modules:

- motor macros: `MOTOR_COUNT`, `MOTOR1_PIN`, `MOTOR1_OUTPUT_INDEX`, `MOTOR1_POSITION_*`, `MOTOR1_DIRECTION_SIGN`
- receiver macros: `RECEIVER_CHANNEL_*`, zero-based `RECEIVER_INDEX_*`, `RECEIVER_DEADBAND`, `RECEIVER_FAILSAFE_TIMEOUT_MS`
- safety and flight macros: `SAFETY_*`, `FLIGHT_MODE_RATE`, `RATE_LIMIT_*_DPS`
- ESC macros: `ESC_PROTOCOL_*`, `ESC_DSHOT_RATE`, `ESC_PWM_RATE_HZ`, `ESC_MIN_US`, `ESC_MAX_US`
- PID macros: `PID_ROLL_*`, `PID_PITCH_*`, `PID_YAW_*`
- C++ constants under `airyn::config`: `kMotorPins`, `kMotorOutputIndices`, `kMotorPositionIds`, `kMotorPositions`, `kMotorDirectionSigns`, `kReceiverChannelMap`, `kReceiverChannelIndices`, `kRateLimitsDps`, and `kPidGains`

The generated header also contains `AIRYN_MADFLIGHT_CONFIG`, derived from TOML for IMU, receiver, channel map, motor output pins, LED, and AHRS settings.

## Editing Existing Models

Stable profiles are not immutable. They are old, known model configurations, and old configurations sometimes need new receiver pins, a replacement IMU, safer PID values, or corrected wiring notes.

Use this flow:

```bash
python tools/edit_model.py stable/quad_x_basic --target dev/quad_x_basic_edit --reason "Change receiver pins"
python tools/freeze_model.py dev/quad_x_basic_edit stable/quad_x_basic --update --reason "Verified receiver pin update"
```

This keeps the old profile modifiable while still leaving an edit trail in `notes.md`.

## Why Not Runtime TOML Yet

The firmware cannot read `profiles/.../model.toml` from the repo after it has been flashed to a microcontroller. Runtime TOML is possible, but it requires storing the file on flash filesystem or SD card, adding a C++ TOML parser, and defining boot-time failure behavior.

For now, TOML is the human-edited source of truth and `build/generated/active_model_config.h` is a temporary build artifact.
