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
|- models/              # one aircraft model per directory
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

The default model is `models/testbench`. Select a different model with:

```powershell
$env:AIRYN_MODEL="quad-x-250"
cd flight
pio run -e RP2350A
```

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

## Model Settings

Each aircraft model lives under `models/<model-name>/`:

```txt
models/testbench/
|- model.toml
|- wiring.md
`- notes.md
```

`model.toml` is the source of truth for:

- board target and MadFlight board adapter
- frame geometry, such as `quad_x`, `quad_plus`, later `hex_x`
- IMU type, bus, address, and pins
- receiver type, serial/PPM pins, channel map, deadband, failsafe timeout
- ESC protocol, PWM/DShot limits, idle throttle, telemetry flag
- motor pins, output indexes, physical positions, spin directions
- safety arming thresholds and disarmed output behavior
- flight mode, rate limits, and PID gains

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
- `models/testbench/model.toml` is the default test aircraft.
- The firmware has receiver input, arming/failsafe, rate PID, Quad X/Plus mixer support, motor output, and serial debug telemetry.
- `mission/` has a first Go daemon skeleton.
- `ground/` has a first Electrobun desktop app skeleton.
- It is not yet a proven "define a model and fly" product. The remaining work is tracked in `docs/implementation-plan.md`.

Read next:

- `docs/monorepo-architecture.md`
- `docs/model-config.md`
- `docs/new-model-bringup.md`
- `docs/madflight-integration.md`
