# AGENTS.md

## Project Rules

- Treat `vendor/madflight/` as third-party code. Do not edit it unless the user explicitly asks for a MadFlight patch.
- Put model-specific pins, PID values, receiver settings, and wiring notes under `profiles/`.
- Use `model.toml` as the source-of-truth model config. Do not hand-edit generated files under `build/generated/`.
- Use `profiles/dev/test_model/` for daily experiments.
- Existing `profiles/stable/` models can be modified, but use a dev editing copy first unless the user explicitly asks for a direct patch.
- For old model changes, prefer `python tools/edit_model.py stable/<name> --target dev/<name>_edit`, then write back with `python tools/freeze_model.py dev/<name>_edit stable/<name> --update --reason "..."`
- Direct stable edits must record the reason in that profile's `notes.md`.
- Keep `src/main.cpp` thin. Startup flow belongs in `src/app/`; reusable logic belongs in the relevant `src/*` module.
- Normal firmware build should be one command: `pio run -e RP2350A`. PlatformIO pre-build runs profile validation and artifact generation.
- Use `python tools/check_config.py <profile>` manually only when debugging profile data.
- Never assume a model profile is flight-safe just because it compiles.

## Build Commands

```bash
pio run -e RP2350A
```

Existing model edit flow:

```bash
python tools/edit_model.py stable/quad_x_basic --target dev/quad_x_basic_edit --reason "Describe change"
python tools/freeze_model.py dev/quad_x_basic_edit stable/quad_x_basic --update --reason "Describe verified result"
```

To build a non-default profile on Windows PowerShell:

```powershell
$env:AIRYN_PROFILE="dev/quad_x_basic_edit"; pio run -e RP2350A
```

## Documentation

- Project structure: `docs/flight_controller_project_structure.md`
- MadFlight integration notes: `docs/madflight-integration.md`
- Model profile rules: `docs/model-config.md`
- Hardware wiring rules: `docs/wiring-guide.md`
