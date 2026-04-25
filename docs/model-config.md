# Model Config

Each model profile is a directory under `profiles/`:

```text
profiles/dev/test_model/
├── model_config.h
├── wiring.md
└── notes.md
```

## Rules

- Keep model-specific values in `model_config.h`.
- Keep physical wiring in `wiring.md`.
- Keep test status and changes in `notes.md`.
- Existing stable profiles are allowed to change, but change them through a dev editing copy and record the reason.
- Do not move tested stable settings directly into source code.

## Active Profile

Build scripts set `AIRYN_PROFILE`. PlatformIO runs `tools/platformio_prebuild.py`, which calls:

```bash
python tools/build_model.py dev/test_model
```

That generates:

```text
build/generated/active_model_config.h
```

The firmware includes that generated header through `src/madflight_config.h`.

## Validation

Run:

```bash
python tools/check_config.py dev/test_model
```

The current checker validates required defines, motor pin presence, and duplicate GPIO use.

## Editing Existing Models

Stable profiles are not immutable. They are old, known model configurations, and old configurations sometimes need new receiver pins, a replacement IMU, safer PID values, or corrected wiring notes.

Use this flow:

```bash
python tools/edit_model.py stable/quad_x_basic --target dev/quad_x_basic_edit --reason "Change receiver pins"
python tools/check_config.py dev/quad_x_basic_edit
python tools/freeze_model.py dev/quad_x_basic_edit stable/quad_x_basic --update --reason "Verified receiver pin update"
```

This keeps the old profile modifiable while still leaving an edit trail in `notes.md`.
