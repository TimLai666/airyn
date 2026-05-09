# Implementation Plan: Configured Model to Flyable Firmware

## Goal

Airyn should reach the point where adding or editing one model:

```text
models/<tier>/<model>/model.toml
```

(plus the matching `boards/<target_board>.toml`) is enough to build firmware for that aircraft without changing C++ source code.

"Can fly" still requires real hardware verification: IMU orientation, receiver channels, motor order, motor direction, failsafe, and PID tuning must be checked before prop-on flight.

## Current Status

- Monorepo skeleton exists with independent `flight/`, `mission/`, `ground/`, `shared/`, `sim/`, `tools/`, and `examples/`. `ground/` now has an Electrobun/Bun app with a local bridge and operator workflows; `mission/` is now a working onboard daemon that reuses the same JSON wire format Ground already speaks.
- MadFlight is included as `flight/vendor/madflight` submodule pinned to `v2.3.0`.
- `models/` is split into `dev/`, `stable/`, `experimental/` tiers. `models/dev/testbench/model.toml` is the default development model.
- Board pinouts live under `boards/`; `boards/pico2_breadboard_dev.toml` is the current development board. Models reference a board via `target_board`, and the board file is merged into the model at load time.
- PlatformIO pre-build generates `flight/build/generated/active_model_config.h` from TOML. This generated header is the only entry point for model and board values into firmware.
- MadFlight access is contained behind adapters in `flight/src/devices/` (`receiver`, `motor_output`, `imu_adapter`); the flight app no longer reads `ahr`/`imu` globals directly.
- Firmware has an integrated first-pass rate-mode flight loop: receiver normalization, arming/failsafe, PID, Quad X mixer, motor output, and serial debug. It still needs PlatformIO compilation and no-prop hardware verification.
- Operating modes (Direct vs Mission) are documented in `docs/operating-modes.md`. Ground now has a local WebSocket bridge and simulator that exercise direct and mission-shaped link paths, flight commands, mission upload, calibration events, fleet telemetry, GPS loss, and link-loss prediction. Real serial/UDP/Mission transports are still pending.

## Progress Tracker

| Phase | Status | Notes |
|---|---|---|
| 1. TOML schema | Partial | `models/dev/testbench/model.toml` now covers receiver channel map, safety, rate-mode limits, motor direction/output index, and ESC details. Board pinout is delegated to `boards/pico2_breadboard_dev.toml`. Validation covers frame counts, motor geometry, receiver/ESC requirements, GPIO conflicts, target_board reference, and PID/rate/safety basics. |
| 2. MadFlight bridge | Partial | Generator now emits structured firmware constants/arrays plus MadFlight config for I2C/SPI IMU, PPM/serial receiver pins, receiver channel map/deadband, motor output pins by `output_index`, LED, and AHRS. First-pass firmware modules consume the contract. Needs PlatformIO compile validation and more hardware variants. |
| 3. Flight app loop | Partial | App now wires MadFlight, receiver, safety, rate PID, Quad X mixer, motor output, and telemetry in `imu_loop()`. IMU access goes through `devices::ImuAdapter` instead of MadFlight globals. Needs PlatformIO compile and no-prop hardware verification. |
| 4. Receiver layer | Partial | Added wrapper around MadFlight rcl with normalized state, generated channel map, and deadband handling. Integrated in app loop. Needs hardware receiver verification. |
| 5. Safety layer | Partial | Arming/disarming and receiver failsafe APIs added and integrated. Needs tests and hardware failsafe verification. |
| 6. PID control | Partial | Added reusable PID class and rate-mode ControlLoop using generated PID/rate settings. Integrated in app loop. Needs tuning and tests. |
| 7. Mixer layer | Partial | Added Quad X mixer using generated motor geometry/direction signs, output clamp, and armed idle handling. Integrated in app loop. Needs tests and motor-order verification. |
| 8. Motor output layer | Partial | Added MotorOutput wrapper with generated output indices, DShot/PWM setup, arm state, and bulk write helpers. Integrated in app loop. Needs PlatformIO compile and no-prop output verification. |
| 9. Telemetry debug | Partial | Serial startup/runtime debug printer added and integrated. Needs serial monitor verification on hardware. |
| 10. Tests | Partial | Added Python config/profile tests covering tiered model lookup. Still need mixer and safety tests with a C++ host or PlatformIO test setup. |
| 11. Bring-up docs | Partial | `docs/new-model-bringup.md`, `docs/board-config.md`, and `docs/operating-modes.md` reflect the tiered model + board layout. Keep updated as hardware flow evolves. |
| 12. Model tiers and boards | Done | `models/{dev,stable,experimental}/` tiers in place, `boards/<target_board>.toml` separated from model, `freeze_model.py`/`edit_model.py` updated for the tiered workflow, `check_config.py` validates the board reference. |
| 13. Ground control | Partial | Electrobun/Bun ground app now has a real local bridge protocol beyond connect/disconnect: queued bridge commands for early connect/configure clicks, visible multi-vehicle simulator switching in a horizontal workspace fleet dock, arm/disarm, guided takeoff with auto-arm and climb-to-hold behavior, hold, mission start with QGC-style ready-to-arm gating, RTL, land, motor cut, mission upload/export/editing, mission default altitude with apply-to-route control, compact preflight checklist gating, calibration events, fleet telemetry, GPS/link-loss simulation, visibly actionable controls, armed-state disconnect lockout, a full-window combined primary workspace, fixed non-scrolling flight commands, stable telemetry readouts, mission altitude profile with route-projected live position, and an estimated terrain-relative aircraft view with aligned terrain, ground, aircraft, and clearance markers. Now also has open-source GCS feature parity for daily ops: SVG primary flight display (artificial horizon + speed/altitude/heading tapes, QGC-style), clickable preflight chip popup with severity-coded reasons, threshold warning colors on battery/GPS/RSSI/link-quality/distance/fence cells, geofence editor (cylindrical, polygon inclusion + exclusion, rally points, breach action), QGC `.plan` file import/export (mission + geofence + rally), survey/corridor pattern generators, IndexedDB telemetry log with timeline scrubber and playback rate control, MAVLink-style live message inspector with sparklines and field rate, parameter editor (search, dirty-staging, write-on-confirm, ack handling), gamepad/keyboard manual override with virtual stick HUD, video stream + draggable PIP, and persisted draggable instrument panel layout. Needs real serial/UDP transport, real DEM terrain data, persisted mission library, hardware calibration command mapping, and propagation of the new protocol fields (preflightReasons, parameters, geofence, manualOverride) into the mission daemon Go protocol. |
| 14. Mission daemon | Partial | `mission/` is now a working onboard companion process. It mirrors the ground bridge protocol (`hello`/`fleet`/`log`, `connect`/`command`/`uploadPlan`/`calibration`) so the existing renderer can connect over WebSocket. Pieces in place: protocol package mirroring `ground/src/shared/protocol.ts`; `flightlink.Link` interface with a deterministic `Stub` source that responds to `goto`/`takeoff`/`hold`/`rtl`/`land`/`kill`; mission engine state machine (preflight, armed, takeoff, mission, hold, RTL, land, failsafe), waypoint navigation (haversine arrival detection), ground-loss timeout that triggers RTL; insyra-backed `telemetry.Buffer` rolling DataTable with vbat/baro/gps/speed/armed-ratio summary stats; `groundserver` WebSocket hub on `:7700` with hello + initial snapshot; env-driven `config` package; `cmd/missiond` daemon with signal-aware shutdown. Missing: real serial/UDP `flightlink` transports, calibration forwarding to FC, persistent log/replay storage, and multi-vehicle supervision. |

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
- Expand `flight/tools/check_config.py`:
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
- Keep generated artifacts only under `flight/build/generated/`.

Done when:

- `pio run` is the only required build command.
- `models/*/model.toml` contains no MadFlight raw config string.

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
4. Run `pio run` inside `flight/`, or `.\flight\scripts\build.ps1` from repo root.
5. Upload firmware.
6. Check serial startup output.
7. Verify IMU data and orientation.
8. Verify receiver channels.
9. Test arm/disarm with no propellers.
10. Test motor order with no propellers.
11. Test motor direction with no propellers.
12. Tune PID conservatively.
13. Hover test.
14. Promote the verified settings into a named `models/<aircraft>/` directory and record the reason in `notes.md`.

Done when:

- A new model can be added without source-code edits.

## Phase 13: Ground Control Usable Workflows

Goal: Ground should be simpler than a typical drone GCS without becoming a static dashboard.

Tasks:

- Keep the Electrobun/Bun boundary clean; Ground must not depend on `flight/` internals.
- Maintain a bridge protocol for renderer-to-Bun actions, not ad-hoc front-end-only state.
- Support operator-critical commands:
  - connect / disconnect
  - arm / disarm
  - hold
  - start mission
  - RTL
  - land
  - emergency motor stop
- Make command availability explicit from connection, link health, preflight, armed, and mission-upload state.
- Make mission planning editable:
  - add waypoint
  - click plan plate to add waypoint
  - drag existing plan-plate waypoints to move them without creating duplicates
  - edit type / lat / lon / altitude
  - delete waypoint
  - upload plan to the bridge
  - export plan JSON
- Send calibration captures to the bridge instead of keeping them as UI-only actions.
- Keep clickable controls visually obvious with hover/focus/disabled/active states.
- Make the combined operator page the default workspace and avoid requiring a separate map-only view for normal flight.
- Show altitude-over-route and terrain-relative aircraft position. The first version may use a local estimate; production should use real DEM terrain data.
- Add real transports:
  - serial direct-to-flight
  - UDP direct-to-flight
  - WebSocket/TCP via Mission
- Add persisted logs, mission library, and replay after the basic transport is working.

Ground follow-up completed:

- Simulator arm now enters an armed-idle state instead of immediately simulating climb/turning motion; hold is labeled as position hold.
- Settings transport fields now update the active vehicle link locally and through the Bun bridge; controls that do not yet have real behavior are disabled instead of acting editable.
- Mission waypoint editing no longer uses the native select dropdown for waypoint type, and the table columns were widened/stabilized for dense operator use.
- Mission plan-plate markers are now real drag handles, so moving an existing waypoint updates its coordinates instead of creating another waypoint.

Latest Ground usability pass completed:

1. Removed the Leaflet attribution/control from the operator map.
2. Persisted the active workspace while keeping `combined` as the safe default.
3. Added visible disabled reasons and keyboard hints to flight command controls.
4. Added a two-step, 3-second confirmation for motor cut.
5. Added keyboard command shortcuts for arm, hold, mission, RTL, land, disarm, and motor cut.
6. Added mission validation before upload for waypoint count, endpoints, coordinates, altitude, and distance.
7. Reflected clamped waypoint values back into the table inputs so edits cannot hide invalid data.
8. Auto-fit the map around the fleet and mission route after mission or active-vehicle changes.
9. Split telemetry status into normal armed/disarmed, link-lost prediction, and onboard INS modes.
10. Capped the in-memory log buffer to prevent long-running operator sessions from slowing the UI.

Done when:

- A user can connect to a vehicle, verify preflight state, upload a plan, arm, run/hold/RTL/land/disarm, calibrate, and inspect logs through real transport-backed actions.

## Phase 14: Mission Daemon Onboard Companion

Goal: `mission/` runs on the airframe's companion computer and is the supervisor that ground talks to in via-mission link mode.

Architecture in place (`mission/internal/`):

- `protocol/`: Go mirror of `ground/src/shared/protocol.ts` (vehicle config, mission waypoints, fleet frame, log message, client commands), plus a `FlightFrame`/`FlightCommand` schema for the mission↔flight boundary.
- `flightlink/`: `Link` interface (`Frames()`, `Health()`, `Send`, `Close`) with a deterministic `Stub` that integrates `goto`/`takeoff`/`hold`/`rtl`/`land`/`kill` against a simple physics model — used until real transports land.
- `engine/`: high-level state machine (preflight/armed/takeoff/mission/hold/RTL/land/failsafe), plan store, haversine arrival detection (5 m radius), preflight gating on FC link health + GPS sat count + vbat, ground-loss policy that triggers RTL after a configurable timeout, and synchronised log/frame emission to a Listener.
- `telemetry/`: insyra-backed rolling `DataTable` of recent samples (vbat / baroVs / gpsSats / gpsHdop / speed / armed) with capacity FIFO eviction and a cheap `Summary()` (mean / min / stdev / armed ratio / window). Insyra v0.2.17 (Pier-2) is the project default for onboard data processing.
- `groundserver/`: `coder/websocket` server on `:7700` with a fan-out `Hub`, hello + initial-snapshot handshake, command dispatch (`command`, `uploadPlan`, `calibration` log-through, no-op for `connect`/`disconnect`/`configureLink`), drop-oldest backpressure for slow clients, and engine notification on first/last connection for ground-loss tracking.
- `config/`: `AIRYN_MISSION_*` env-driven configuration (listen address, link, vehicle id/callsign/color, preflight thresholds, telemetry capacity, tick rate).
- `app/`: orchestrator that wires link → engine → telemetry buffer → ground server, writes the startup line, and blocks until ctx cancellation.
- `cmd/missiond`: thin entry with `signal.NotifyContext(SIGINT, SIGTERM)` so ground-side restarts terminate cleanly.

Tests:

- `engine`: haversine + bearing helpers; arm rejected without preflight, arm accepted after a healthy frame, mission requires uploaded plan, mission advances waypoint-by-waypoint and returns to hold on completion.
- `telemetry`: capacity capping (FIFO), summary stats correctness (vbat mean / speed max / armed ratio / window), empty-buffer safety, reset.
- `app`: startup line is emitted, daemon starts on an ephemeral port and exits cleanly on `cancel()`.

Pending follow-ups:

- Real `flightlink` transports: `serial.Link` (USB CDC to RP2350A) and `udp.Link` (LAN bring-up).
- Calibration capture forwarding to the FC once a flight-side calibration service exists.
- Log/replay persistence (sqlite or parquet via insyra) for post-flight review.
- Multi-vehicle supervision if a single mission daemon ever needs to babysit more than one airframe (currently one daemon per airframe).
- Promote the protocol types to `shared/protocol/` once a Go consumer exists outside `mission/`.

Done when:

- A real flight controller (or the existing rate-mode firmware over serial) can be supervised end-to-end through `mission/` from the existing Ground UI without source changes on the renderer side.

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
