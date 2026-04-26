# Model Configuration

Each aircraft model is a directory under repository root `models/`:

```txt
models/testbench/
├─ model.toml
├─ wiring.md
└─ notes.md
```

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

Normal PlatformIO builds run validation and generation automatically.

## Fields

Top-level:

- `name`: human-readable model name.
- `target_board`: PlatformIO target board name used by this model.
- `frame`: physical frame geometry. Current values are `quad_x`, `quad_plus`; `hex_x` is planned.

`[board]`:

- `madflight_board`: MadFlight board adapter header.
- `led_pin`: optional status LED pin.
- `led_gizmo`: LED polarity/driver option used by MadFlight.

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
