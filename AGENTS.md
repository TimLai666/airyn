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
