# Agent Instructions

## Priority

The top project priority is to make Airyn reach: define a model in `models/<model>/model.toml`, build with one command, flash, calibrate, and fly safely. Use `docs/implementation-plan.md` as the active implementation plan and update progress there whenever a meaningful task is completed or the plan changes.

## Monorepo Boundaries

- `flight/` is the flight-controller firmware project and must remain independently buildable.
- `flight/` must not depend on `mission/` or `ground/`.
- `mission/` and `ground/` may use `shared/` and may talk to each other.
- `ground/` may connect directly to `flight/` or connect through `mission/`.
- `shared/protocol`, `shared/config-schema`, and `shared/math` may be used across projects, but anything used by `flight/` must stay MCU-safe and avoid heavy runtime dependencies.

Expected dependency direction:

```txt
shared/protocol
     ^
flight   mission   ground
```

Do not introduce this shape:

```txt
flight -> mission -> ground
```

## Mission

- `mission/` is written in Go.
- Follow idiomatic Go: run `gofmt`, keep packages small, check errors, and prefer standard library code until a real dependency is justified.
- Normal validation is `go test ./...` from `mission/`.
- Mission may communicate with flight through `shared/protocol`, serial, UDP, or another explicit transport, but flight must not compile against mission.

## Ground

- `ground/` is written with Electrobun, Bun, and TypeScript.
- Electrobun is not Electron. Do not use Electron APIs, Electron preload patterns, or Electron packaging assumptions.
- Prefer Bun-native APIs before adding packages: use `Bun.file`, `Bun.write`, `Bun.serve`, `bun:sqlite`, WebSocket support, Bun test, and Bun's bundler when they cover the need.
- Add a new ground dependency only when Bun/Electrobun do not provide the capability, or when a domain-specific library clearly reduces risk more than it adds weight.
- Before adding a ground dependency, document why Bun-native functionality is insufficient in the relevant code comment, README note, or implementation plan entry.
- Normal setup is `bun install`; validation is `bun run typecheck`.
- Use Electrobun `BrowserWindow` and view entrypoint patterns from `electrobun.config.ts`.

## Flight Firmware

- Run firmware commands from `flight/`, or use scripts under `flight/scripts/` from the repo root.
- Normal build is one command: `.\flight\scripts\build.ps1` from repo root, or `pio run -e RP2350A` inside `flight/`.
- PlatformIO is required for firmware builds and Arduino framework include resolution.
- PlatformIO pre-build runs model validation and generated firmware artifact creation automatically.
- Generated files under `flight/build/` and PlatformIO output under `flight/.pio/` are build artifacts and must not be committed.
- Treat `flight/vendor/madflight/` as third-party code. Do not edit it unless the user explicitly asks for a MadFlight patch.

## Model Settings

- Model source-of-truth files live under `models/<model>/model.toml`.
- `models/testbench/` is the daily development test model.
- Old model settings are allowed to change; edit the TOML, wiring notes, and notes together so the model stays understandable.
- Validate model data with `python flight/tools/check_config.py <model>`.
- Generate firmware artifacts with `python flight/tools/build_model.py <model>` only when debugging; normal PlatformIO builds run it automatically.

## Documentation

- Keep `docs/implementation-plan.md` current as implementation progresses.
- Keep `docs/model-config.md` aligned with the TOML schema.
- Keep `docs/new-model-bringup.md` aligned with the actual build and setup flow.
- Keep `docs/madflight-integration.md` aligned with the pinned submodule path and version.
