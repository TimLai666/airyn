# airyn-flight

Airyn Flight is a custom flight-controller workspace built around [MadFlight](https://github.com/qqqlab/madflight).

This repo owns the project structure, model profiles, board notes, safety rules, and build tooling. MadFlight is kept as an external dependency under `vendor/madflight` and should not be edited directly unless the change is intentional and documented.

## Current Status

- MadFlight is included as a Git submodule at `vendor/madflight`.
- The submodule is pinned to tag `v2.3.0`.
- Default build target is `RP2350A` for Raspberry Pi Pico 2.
- Default model profile is `profiles/dev/test_model`.
- The first firmware entry point is a minimal MadFlight startup smoke test, not a flight-tested controller.

## Layout

```text
docs/                         Project design and integration notes
profiles/dev/test_model/      Daily development model profile
profiles/stable/              Flight-verified model profiles, later
profiles/experimental/        Experimental models, later
src/                          Airyn firmware wrapper code
tools/                        Profile validation and generation tools
scripts/                      Build, flash, and clean helpers
targets/                      Target platform notes, later
tests/                        Config, mixer, and safety tests, later
vendor/madflight/             MadFlight submodule
```

## Setup

Clone with submodules:

```bash
git clone --recurse-submodules <this-repo-url>
```

If the repo is already cloned:

```bash
git submodule update --init --recursive
```

Install PlatformIO, then verify the active profile:

```bash
python tools/check_config.py dev/test_model
python tools/build_model.py dev/test_model
```

## Build

Default profile and target:

```bash
./scripts/build.sh
```

Windows PowerShell:

```powershell
.\scripts\build.ps1
```

Specify profile and target:

```bash
./scripts/build.sh dev/test_model RP2350A
```

Upload:

```bash
./scripts/flash.sh dev/test_model RP2350A
```

## Profile Workflow

Daily hardware changes go in:

```text
profiles/dev/test_model/
```

Each profile should contain:

- `model_config.h`
- `wiring.md`
- `notes.md`

When a model is verified, freeze it into `profiles/stable/`:

```bash
python tools/freeze_model.py dev/test_model stable/quad_x_basic --reason "First verified Quad X wiring"
```

## MadFlight Dependency

Directly cloning MadFlight into `vendor/madflight` is technically workable, but this repo uses a submodule instead. The reason is practical: the parent repo tracks only the exact MadFlight commit, while MadFlight keeps its own history and can be upgraded cleanly.

MadFlight `main` is a development branch. For this repo the dependency is pinned to the latest tag observed during setup, `v2.3.0`, instead of following `main`.

## Safety

Do not test motor output with propellers installed. The current profile uses placeholder pins, placeholder PID values, and unverified motor order.

