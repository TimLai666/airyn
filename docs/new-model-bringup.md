# New Model Bring-up

This is the expected flow for adding a new aircraft model.

## 1. Create The Dev Profile

New aircraft start as a dev profile. Use `edit_model.py` to clone an existing dev or stable profile into `models/dev/`:

```powershell
python flight\tools\edit_model.py testbench --target quad-x-250
```

This creates `models/dev/quad-x-250/` with `model.toml`, `wiring.md`, and `notes.md`. Edit those for the new airframe.

If the airframe needs a board that does not yet exist, also add `boards/<target_board>.toml`.

## 2. Validate The TOML

```powershell
python flight\tools\check_config.py quad-x-250
```

Fix all validation errors before trying to flash.

## 3. Build

```powershell
$env:AIRYN_MODEL="quad-x-250"
cd flight
pio run -e RP2350A
```

Or from repo root:

```powershell
.\flight\scripts\build.ps1 quad-x-250 RP2350A
```

## 4. Bench Checks

Before propellers are installed, run the full bring-up checklist in `docs/bringup-checklist.md`. Phases A–G cover:

- IMU orientation and motion signs.
- Receiver channel map and arming channel.
- Failsafe trigger on receiver signal loss.
- Motor output order via `spinmotors` CLI.
- Each motor position and spin direction matched against `model.toml`.
- Disarmed = motors stopped.
- Armed-idle output is low and stable.
- Mixer behavior on roll, pitch, yaw stick inputs.

That checklist is calibrated for `models/dev/testbench/` on a Pico 2; for a new airframe substitute the matching pin table from your `model.toml` and `wiring.md` and run the same phases.

## 5. First Hover

Use conservative PID gains, keep the first test short, and record results in `models/dev/<model>/notes.md`.

## 6. Promote To Stable

Once the airframe has flown safely with a known-good `model.toml`, freeze it into the `stable/` tier:

```powershell
python flight\tools\freeze_model.py quad-x-250 quad-x-250
```

This copies `models/dev/quad-x-250/` into `models/stable/quad-x-250/` and appends a freeze note to `notes.md`. Stable profiles should not be edited in place; clone them back into `dev/` with `edit_model.py` for further changes.

The target state is: model TOML plus wiring notes are enough to reproduce a firmware build, flash, bench check, and flight test.
