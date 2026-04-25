# Model Config

Each model profile is a directory under `profiles/`:

```text
profiles/dev/test_model/
├── model.toml
├── wiring.md
└── notes.md
```

## Rules

- Keep model-specific values in `model.toml`.
- Keep physical wiring in `wiring.md`.
- Keep test status and changes in `notes.md`.
- Existing stable profiles are allowed to change, but change them through a dev editing copy and record the reason.
- Do not move tested stable settings directly into source code.

## Active Profile

PlatformIO runs `tools/platformio_prebuild.py` before every build. That hook reads `AIRYN_PROFILE`, defaults to `dev/test_model`, validates the profile, and creates build artifacts.

Normal build is one command:

```bash
pio run -e RP2350A
```

That generates firmware build artifacts:

```text
build/generated/active_model_config.h
```

The firmware includes that generated header through `src/madflight_config.h`. The generated header is an implementation detail for MCU builds; do not edit it by hand.

## Validation

Run:

```bash
python tools/check_config.py dev/test_model
```

The current checker validates required TOML keys, motor pin presence, and duplicate GPIO use.

Manual validation is optional during normal builds because `pio run` invokes it automatically.

## Editing Existing Models

Stable profiles are not immutable. They are old, known model configurations, and old configurations sometimes need new receiver pins, a replacement IMU, safer PID values, or corrected wiring notes.

Use this flow:

```bash
python tools/edit_model.py stable/quad_x_basic --target dev/quad_x_basic_edit --reason "Change receiver pins"
python tools/freeze_model.py dev/quad_x_basic_edit stable/quad_x_basic --update --reason "Verified receiver pin update"
```

This keeps the old profile modifiable while still leaving an edit trail in `notes.md`.

## Why Not Runtime TOML Yet

The firmware cannot read `profiles/.../model.toml` from the repo after it has been flashed to a microcontroller. Runtime TOML is possible, but it requires storing the file on flash filesystem or SD card, adding a C++ TOML parser, and defining boot-time failure behavior.

For now, TOML is the human-edited source of truth and `build/generated/active_model_config.h` is a temporary build artifact.
