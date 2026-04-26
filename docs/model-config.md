# Model Configuration

Each aircraft model is a directory under repository root `models/<tier>/`:

```txt
models/
├─ dev/
│  └─ testbench/
│     ├─ model.toml
│     ├─ wiring.md
│     └─ notes.md
├─ stable/
└─ experimental/
```

Tiers describe how a model is allowed to change:

- `dev/`: editing sandbox. Daily bring-up and tuning happen here. The active dev profile is `models/dev/testbench/`.
- `stable/`: frozen profiles for verified hardware. Treat these as read-only; promote a dev profile with `flight/tools/freeze_model.py`.
- `experimental/`: opt-in profiles for risky tweaks. Used to keep a stable profile pristine while trying something on the same airframe.

A profile name like `testbench` resolves across tiers automatically. Use `dev/testbench` or `stable/quad-x-250` to pin a specific tier.

`model.toml` is the source of truth. Firmware builds validate it and generate MCU headers into `flight/build/generated/`.

## Build Flow

From repo root:

```powershell
.\flight\scripts\build.ps1
```

From `flight/`:

```powershell
pio run -e RP2350A
```

Select a model:

```powershell
$env:AIRYN_MODEL="testbench"
cd flight
pio run -e RP2350A
```

Manual validation:

```powershell
python flight\tools\check_config.py testbench
```

Manual generation:

```powershell
python flight\tools\build_model.py testbench
```

Promote a dev profile to stable:

```powershell
python flight\tools\freeze_model.py testbench quad-x-250
```

Open a dev editing copy from a stable profile:

```powershell
python flight\tools\edit_model.py stable/quad-x-250
```

Normal PlatformIO builds run validation and generation automatically.

## Fields

Top-level:

- `name`: human-readable model name.
- `target_board`: PlatformIO target board name used by this model.
- `frame`: physical frame geometry. Current values are `quad_x`, `quad_plus`; `hex_x` is planned.

`[board]` (optional override; defaults come from `boards/<target_board>.toml`):

- `madflight_board`: MadFlight board adapter header.
- `led_pin`: optional status LED pin.
- `led_gizmo`: LED polarity/driver option used by MadFlight.

The model's `target_board` selects a board file under `boards/`. The board file owns the pinout, LED, and MadFlight adapter; the model only adds a `[board]` section when it needs to override one of those fields. See `docs/board-config.md`.

`[imu]`:

- `type`: IMU chip name.
- `bus`: `i2c` or `spi`.
- I2C fields: `i2c_bus`, `sda_pin`, `scl_pin`, `address`.
- SPI fields: `spi_bus`, `miso_pin`, `mosi_pin`, `sclk_pin`, `cs_pin`.
- `int_pin`: IMU interrupt pin.

`[receiver]`:

- `type`: `PPM`, `SBUS`, `CRSF`, or `ELRS`.
- PPM field: `pin`.
- Serial fields: `serial_bus`, `rx_pin`, optional `tx_pin`.
- `channels`: receiver channel count.
- `deadband`: stick deadband as normalized value.
- `failsafe_timeout_ms`: time without valid receiver input before failsafe.
- `[receiver.channel_map]`: channel numbers for `throttle`, `roll`, `pitch`, `yaw`, `arm`, and `mode`.

`[esc]`:

- `protocol`: `PWM`, `ONESHOT125`, `DSHOT`, `DSHOT300`, or `DSHOT600`.
- `pwm_rate_hz`, `min_us`, `max_us`: required for PWM-style protocols.
- `dshot_rate`: required when `protocol = "DSHOT"`.
- `idle_percent`: minimum spinning output while armed.
- `min_command`, `max_command`: normalized command range.
- `telemetry`: whether ESC telemetry is expected.

`[[motors]]`:

- `name`: label for notes and debugging.
- `pin`: MCU output pin.
- `output_index`: firmware output slot.
- `position`: physical motor position, constrained by frame type.
- `direction`: `cw` or `ccw`.

`[safety]`:

- `arm_throttle_threshold`: throttle must be below this value to arm.
- `armed_idle_throttle`: idle output while armed.
- `min_output`, `max_output`: output clamp.
- `disarm_behavior`: `stop` or `idle`.

`[flight]`:

- `mode`: currently `rate`.
- `[flight.rate_limits]`: `roll_dps`, `pitch_dps`, `yaw_dps`.

`[pid]`:

- `integrator_limit`: anti-windup clamp.
- `output_limit`: PID output clamp.
- `[pid.roll]`, `[pid.pitch]`, `[pid.yaw]`: `p`, `i`, `d` gains.

## Frame Names

- `quad_x`: four motors in X layout; common modern multirotor geometry.
- `quad_plus`: four motors in plus layout; one motor points directly forward.
- `hex_x`: planned six-motor X-style layout.

## Generated Files

The generated firmware header is an implementation detail:

```txt
flight/build/generated/active_model_config.h
```

Do not edit or commit generated files. Change `models/<model>/model.toml` instead.
