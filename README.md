# airyn

Airyn is a monorepo for the flight stack:

```txt
airyn/
|- flight/              # flight-controller firmware, independently buildable
|- mission/             # onboard mission computer software
|- ground/              # ground control, mission planning, telemetry UI
|- shared/
|  |- protocol/         # packets, commands, telemetry contracts
|  |- config-schema/    # model TOML format and validation rules
|  `- math/             # shared coordinates, attitude, unit helpers
|- models/              # aircraft models, split into dev/, stable/, experimental/ tiers
|- boards/              # physical PCB/breadboard pinouts referenced by models
|- sim/                 # simulator, fake sensors, test environments
|- tools/               # repo-level CLI and workflow tools
|- docs/                # architecture, wiring, model-setting docs
`- examples/            # example missions and configurations
```

The important boundary is dependency direction:

```txt
shared/protocol
     ^
flight   mission   ground
```

`flight/` must remain clean enough to build as its own firmware project. It may use MCU-safe definitions from `shared/`, but it must not depend on `mission/` or `ground/`. `ground/` may connect directly to `flight/` or through `mission/`.

## Flight Build

Install PlatformIO first. In VS Code, install the PlatformIO IDE extension so `Arduino.h`, `madflight.h`, and board framework headers resolve correctly.

From the repo root:

```powershell
.\flight\scripts\build.ps1
```

Or from the flight project:

```powershell
cd flight
pio run -e RP2350A
```

The default model is `models/dev/testbench`. Select a different model with:

```powershell
$env:AIRYN_MODEL="quad-x-250"
cd flight
pio run -e RP2350A
```

Profile names resolve across `dev/`, `stable/`, and `experimental/` automatically. Use `dev/<name>` or `stable/<name>` to pin a tier.

PlatformIO runs `flight/tools/platformio_prebuild.py` automatically. That validates the TOML model and generates firmware-only artifacts under `flight/build/generated/`. Generated build files are ignored and should not be committed.

## Mission

`mission/` is the onboard mission-computer project and is written in Go.

```powershell
cd mission
go test ./...
go run ./cmd/missiond
```

Mission code may communicate with `flight/` through protocol boundaries, but `flight/` must not import mission code.

## Ground

`ground/` is the ground-control desktop project and uses Electrobun with Bun and TypeScript. Electrobun is not Electron; use Electrobun APIs and project layout.

```powershell
cd ground
bun install
bun run start
```

Development watch mode:

```powershell
bun run dev
```

## Versions

Each major project owns its own version number:

- `flight/VERSION`
- `mission/VERSION`
- `ground/VERSION`

Version bumps are manual release decisions. Do not change these files unless the project owner explicitly decides to bump that project's version.

Check mirrored versions:

```powershell
python tools\check_versions.py
```

## Model Settings

Each aircraft model lives under `models/<tier>/<model-name>/`:

```txt
models/
|- dev/
|  `- testbench/
|     |- model.toml
|     |- wiring.md
|     `- notes.md
|- stable/
`- experimental/
```

Tiers:

- `dev/` is the editing sandbox. Daily bring-up and tuning happen here.
- `stable/` holds frozen, hardware-verified profiles. Promote with `python flight\tools\freeze_model.py`.
- `experimental/` is for opt-in risky tweaks on a verified airframe.

`model.toml` is the source of truth for:

- board target (resolved against `boards/<target_board>.toml`) and any inline board overrides
- frame geometry, such as `quad_x`, `quad_plus`, later `hex_x`
- IMU type, bus, address, and pins
- receiver type, serial/PPM pins, channel map, deadband, failsafe timeout
- ESC protocol, PWM/DShot limits, idle throttle, telemetry flag
- motor pins, output indexes, physical positions, spin directions
- safety arming thresholds and disarmed output behavior
- flight mode, rate limits, and PID gains

Physical PCB pinouts (LED, MadFlight adapter, MCU) live separately under `boards/<target_board>.toml`. See `docs/board-config.md`.

Validate a model manually:

```powershell
python flight\tools\check_config.py testbench
```

Generate the firmware config manually:

```powershell
python flight\tools\build_model.py testbench
```

Normal builds do both steps automatically.

## Current State

This repo currently has a first-pass Airyn flight firmware composed around MadFlight:

- MadFlight is vendored as a Git submodule under `flight/vendor/madflight`.
- `models/dev/testbench/model.toml` is the default test aircraft.
- The firmware has receiver input, arming/failsafe, rate PID, Quad X/Plus mixer support, motor output, and serial debug telemetry.
- `mission/` has a first Go daemon skeleton.
- `ground/` has a first Electrobun desktop app skeleton.
- It is not yet a proven "define a model and fly" product. The remaining work is tracked in `docs/implementation-plan.md`.

Read next:

- `docs/monorepo-architecture.md`
- `docs/model-config.md`
- `docs/board-config.md`
- `docs/new-model-bringup.md`
- `docs/bringup-checklist.md`
- `docs/operating-modes.md`
- `docs/madflight-integration.md`
