# Implementation Plan: Configured Model to Flyable Firmware

## Goal

Airyn Flight should reach the point where adding or editing one profile:

```text
profiles/<zone>/<model>/model.toml
```

is enough to build firmware for that aircraft without changing C++ source code.

"Can fly" still requires real hardware verification: IMU orientation, receiver channels, motor order, motor direction, failsafe, and PID tuning must be checked before prop-on flight.

## Current Status

- Project skeleton exists.
- MadFlight is included as `vendor/madflight` submodule pinned to `v2.3.0`.
- `model.toml` exists for `profiles/dev/test_model`.
- PlatformIO pre-build generates `build/generated/active_model_config.h` from TOML.
- Firmware currently starts MadFlight and AHRS, but does not yet implement a complete flight loop.

## Progress Tracker

| Phase | Status | Notes |
|---|---|---|
| 1. TOML schema | In progress | Basic `dev/test_model/model.toml` exists. Needs receiver maps, safety, modes, motor direction. |
| 2. MadFlight bridge | In progress | Generates basic IMU, receiver, motor, LED, AHRS config. Needs serial receiver, SPI IMU, PWM options. |
| 3. Flight app loop | Not started | Current app is a smoke test, not a full controller. |
| 4. Receiver layer | Not started | Need normalized receiver state. |
| 5. Safety layer | Not started | Need arming, disarming, failsafe state machine. |
| 6. PID control | Not started | Need rate mode first. |
| 7. Mixer layer | Not started | Need `quad_x` table from TOML motor positions/directions. |
| 8. Motor output layer | Partial | Basic DShot/PWM init in app. Needs wrapper and protocol options. |
| 9. Telemetry debug | Not started | Need startup config print and runtime debug. |
| 10. Tests | Not started | Need config, mixer, safety tests. |
| 11. Bring-up docs | Not started | Need new-model hardware validation guide. |

Update this table whenever implementation progress changes.

## Phase 1: Complete TOML Schema

Goal: `model.toml` describes one aircraft fully enough that C++ source does not change per model.

Tasks:

- Add frame support fields for `quad_x`, `quad_plus`, and future `hex_x`.
- Add motor `direction`, `output_index`, and validated `position`.
- Add receiver channel map:
  - throttle
  - roll
  - pitch
  - yaw
  - arm switch
  - mode switch
- Add receiver deadband and failsafe timeout.
- Add safety settings:
  - arm throttle threshold
  - armed idle throttle
  - min output
  - max output
  - disarm behavior
- Add flight mode settings:
  - `rate`
  - later `angle`
- Add PID groups for rate mode first.
- Expand `tools/check_config.py`:
  - required keys
  - GPIO conflicts
  - frame/motor count match
  - receiver protocol requirements
  - ESC protocol requirements
  - motor position uniqueness
  - motor direction validity

Done when:

- Invalid `model.toml` fails before firmware compilation.
- A valid Quad X test profile can express motor order, direction, receiver mapping, safety, and PID.

## Phase 2: Stabilize MadFlight Bridge

Goal: users do not write MadFlight raw config strings.

Tasks:

- Extend `tools/model_profile.py` to generate all needed MadFlight config from TOML.
- Support I2C IMU.
- Support SPI IMU:
  - SPI bus
  - MISO/MOSI/SCLK
  - IMU CS
  - IMU INT
- Support PPM receiver.
- Support serial receivers:
  - SBUS
  - CRSF / ELRS
  - serial bus pins
- Support ESC protocols:
  - PWM
  - OneShot125
  - DShot300
  - DShot600
- Keep generated artifacts only under `build/generated/`.

Done when:

- `pio run` is the only required build command.
- `profiles/*/*/model.toml` contains no MadFlight raw config string.

## Phase 3: Flight App Main Loop

Goal: implement an actual flight-control loop.

Files:

```text
src/app/
src/core/
src/safety/
src/mixer/
src/telemetry/
```

Tasks:

- Keep `src/main.cpp` thin.
- In `src/app/flight_app.cpp`:
  - initialize MadFlight
  - initialize receiver wrapper
  - initialize motor output wrapper
  - initialize safety state
  - initialize PID/mixer
- In `imu_loop()`:
  - update AHRS
  - read receiver
  - run safety checks
  - run PID
  - run mixer
  - write motor outputs
- Remove model-specific assumptions from app code.

Done when:

- Flight app has no hard-coded GPIO or model-specific motor order.

## Phase 4: Receiver Layer

Goal: all receiver protocols become one normalized state.

Files:

```text
src/devices/receiver.h
src/devices/receiver.cpp
```

Tasks:

- Wrap MadFlight `rcl`.
- Provide:

```cpp
struct ReceiverState {
  float throttle;
  float roll;
  float pitch;
  float yaw;
  bool arm;
  bool connected;
  int mode;
};
```

- Apply channel map from generated config.
- Apply deadband.
- Report receiver lost/failsafe state.

Done when:

- Control code does not directly depend on MadFlight receiver details.

## Phase 5: Safety Layer

Goal: motor output is impossible unless safety conditions allow it.

Files:

```text
src/safety/arming.h
src/safety/arming.cpp
src/safety/failsafe.h
src/safety/failsafe.cpp
```

Tasks:

- Implement state machine:
  - boot
  - disarmed
  - arming_requested
  - armed
  - failsafe
  - error
- Arm only if:
  - receiver connected
  - throttle low
  - IMU healthy
  - motor output initialized
  - config valid
- Disarm if:
  - arm switch off
  - receiver lost
  - failsafe timeout
  - panic/error
- Reset PID integrators when disarmed or failsafe.

Done when:

- Receiver loss, unsafe throttle, or IMU failure prevents motor output.

## Phase 6: PID Control

Goal: implement rate mode first.

Files:

```text
src/core/control_loop.h
src/core/control_loop.cpp
src/core/pid.h
src/core/pid.cpp
```

Tasks:

- Convert receiver sticks into desired roll/pitch/yaw rates.
- Use gyro rates as measured state.
- Load PID gains from generated config.
- Add integrator limit.
- Reset integrators on disarm, failsafe, and throttle low.
- Add rate limits in TOML.

Done when:

- PID gains and max rates can be changed in TOML without source edits.

## Phase 7: Mixer Layer

Goal: convert throttle + PID outputs into per-motor commands from frame geometry.

Files:

```text
src/mixer/mixer.h
src/mixer/mixer.cpp
```

Tasks:

- Support `quad_x` first.
- Use TOML motor positions and directions.
- Add later support for `quad_plus`.
- Prepare schema for future `hex_x`.
- Clamp outputs to safe range.
- Apply armed idle throttle.

Done when:

- Motor order and geometry come from model settings, not source code.

## Phase 8: Motor Output Layer

Goal: wrap MadFlight motor output with model-aware settings.

Files:

```text
src/devices/motor_output.h
src/devices/motor_output.cpp
```

Tasks:

- Initialize output indices from generated config.
- Support PWM and DShot300 first.
- Add DShot600 later.
- Provide:

```cpp
setMotor(index, value)
setAllMotors(value)
setArmed(bool)
```

Done when:

- ESC protocol and motor outputs are fully TOML-driven.

## Phase 9: Telemetry and Debug

Goal: make hardware bring-up observable over serial.

Files:

```text
src/telemetry/serial_debug.h
src/telemetry/serial_debug.cpp
```

Tasks:

- Print startup config:
  - model name
  - board
  - frame
  - IMU
  - receiver
  - motor pins
  - ESC protocol
- Print runtime debug:
  - receiver values
  - arm state
  - failsafe state
  - IMU health
  - PID output
  - motor output
- Keep MadFlight CLI available.

Done when:

- USB serial can confirm whether config and hardware state match expectations.

## Phase 10: Tests

Goal: catch configuration, mixer, and safety bugs before hardware.

Tasks:

- `tests/config_tests/`
  - valid TOML
  - missing required fields
  - GPIO conflict
  - invalid frame/motor count
- `tests/mixer_tests/`
  - Quad X roll/pitch/yaw mix
  - output clamp
  - idle throttle
- `tests/safety_tests/`
  - throttle high blocks arm
  - receiver lost disarms
  - IMU unhealthy blocks arm

Done when:

- Core config and mixer mistakes can be reproduced without a drone connected.

## Phase 11: New Model Bring-up Guide

Goal: adding a real aircraft follows a documented checklist.

Create:

```text
docs/new-model-bringup.md
```

Checklist:

1. Copy or create a profile.
2. Fill `model.toml`.
3. Fill `wiring.md`.
4. Run `pio run`.
5. Upload firmware.
6. Check serial startup output.
7. Verify IMU data and orientation.
8. Verify receiver channels.
9. Test arm/disarm with no propellers.
10. Test motor order with no propellers.
11. Test motor direction with no propellers.
12. Tune PID conservatively.
13. Hover test.
14. Freeze to `profiles/stable/`.

Done when:

- A new model can be added without source-code edits.

## First Flyable Scope

The first target should be intentionally narrow:

```text
Board: Raspberry Pi Pico 2 / RP2350A
Frame: Quad X
IMU: MPU6050 over I2C
Receiver: PPM
ESC: DShot300
Mode: Rate mode
Safety: arm/disarm + receiver failsafe
Debug: USB serial
```

After this can hover safely, add SBUS/CRSF, other IMUs, other frame types, and angle mode.

