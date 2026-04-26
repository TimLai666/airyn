# Agent Instructions

## Priority

The top project priority is to make Airyn reach: define a model in `models/<tier>/<model>/model.toml` (with the matching board file under `boards/`), build with one command, flash, calibrate, and fly safely. Use `docs/implementation-plan.md` as the active implementation plan and update progress there whenever a meaningful task is completed or the plan changes.

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

## Version Ownership

- `flight/`, `mission/`, and `ground/` maintain independent versions.
- Current version files are `flight/VERSION`, `mission/VERSION`, and `ground/VERSION`.
- Do not change any project version unless the user explicitly says to bump or set that specific project version.
- Do not bundle version bumps into feature work, refactors, dependency updates, formatting, or generated changes.
- If a version bump is requested, update only the requested project version and every required mirror for that same project, then run `python tools/check_versions.py`.

## Mission

- `mission/` is written in Go.
- Follow idiomatic Go: run `gofmt`, keep packages small, check errors, and prefer standard library code until a real dependency is justified.
- Normal validation is `go test ./...` from `mission/`.
- Mission may communicate with flight through `shared/protocol`, serial, UDP, or another explicit transport, but flight must not compile against mission.
- Mission runtime version mirrors `mission/VERSION` in `mission/internal/app/version.go`.

## Ground

- `ground/` is written with Electrobun, Bun, and TypeScript.
- Electrobun is not Electron. Do not use Electron APIs, Electron preload patterns, or Electron packaging assumptions.
- Prefer Bun-native APIs before adding packages: use `Bun.file`, `Bun.write`, `Bun.serve`, `bun:sqlite`, WebSocket support, Bun test, and Bun's bundler when they cover the need.
- Add a new ground dependency only when Bun/Electrobun do not provide the capability, or when a domain-specific library clearly reduces risk more than it adds weight.
- Before adding a ground dependency, document why Bun-native functionality is insufficient in the relevant code comment, README note, or implementation plan entry.
- Normal setup is `bun install`; validation is `bun run typecheck`.
- Use Electrobun `BrowserWindow` and view entrypoint patterns from `electrobun.config.ts`.
- Ground app version mirrors `ground/VERSION` in `ground/package.json` and `ground/electrobun.config.ts`.

## Flight Firmware

- Run firmware commands from `flight/`, or use scripts under `flight/scripts/` from the repo root.
- Normal build is one command: `.\flight\scripts\build.ps1` from repo root, or `pio run -e RP2350A` inside `flight/`.
- PlatformIO is required for firmware builds and Arduino framework include resolution.
- PlatformIO pre-build runs model validation and generated firmware artifact creation automatically.
- Generated files under `flight/build/` and PlatformIO output under `flight/.pio/` are build artifacts and must not be committed.
- Treat `flight/vendor/madflight/` as third-party code. Do not edit it unless the user explicitly asks for a MadFlight patch.
- Flight firmware version is stored in `flight/VERSION`.

## Model Settings

- Model source-of-truth files live under `models/<tier>/<model>/model.toml` where `<tier>` is `dev`, `stable`, or `experimental`.
- `models/dev/testbench/` is the daily development test model.
- Treat `stable/` profiles as read-only. To change a stable profile, clone it back to `dev/` with `python flight/tools/edit_model.py stable/<model>`, edit there, then re-promote with `python flight/tools/freeze_model.py <dev-name> <stable-name>`.
- Validate model data with `python flight/tools/check_config.py <model>`. Profile lookup searches all tiers automatically; pin a tier explicitly with `dev/<name>` or `stable/<name>` when needed.
- Generate firmware artifacts with `python flight/tools/build_model.py <model>` only when debugging; normal PlatformIO builds run it automatically.

## Board Settings

- Physical board pinout, MadFlight adapter, LED, and PIO env live under `boards/<target_board>.toml`.
- A model selects a board with `target_board = "<name>"`; the board file is merged into the model at load time. Inline `[board]` keys in the model override individual board fields.
- Adding a new PCB or breadboard variant means adding a new file under `boards/`, not editing the model.

## Adapter Boundary

- Code outside `flight/src/devices/` and `flight/src/madflight_config.h` must not include MadFlight headers or read MadFlight globals (`ahr`, `imu`, `rcl`, `out`).
- Use the existing wrappers: `devices::Receiver`, `devices::MotorOutput`, `devices::ImuAdapter`. Add a new adapter when a new MadFlight subsystem is needed.
- The generated `flight/build/generated/active_model_config.h` is the only entry point for model and board values into firmware.

## Documentation

- Keep `docs/implementation-plan.md` current as implementation progresses.
- Keep `docs/model-config.md` aligned with the TOML schema and tiered layout.
- Keep `docs/board-config.md` aligned with the `boards/` schema.
- Keep `docs/new-model-bringup.md` aligned with the actual build and setup flow.
- Keep `docs/operating-modes.md` aligned with how Ground reaches Flight (direct vs through Mission).
- Keep `docs/madflight-integration.md` aligned with the pinned submodule path and version.
