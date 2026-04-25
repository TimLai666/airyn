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

