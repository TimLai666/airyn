# New Model Bring-up

This is the expected flow for adding a new aircraft model.

## 1. Create The Model Directory

Start from `models/testbench/`:

```powershell
Copy-Item -Recurse models\testbench models\quad-x-250
```

Edit:

```txt
models/quad-x-250/model.toml
models/quad-x-250/wiring.md
models/quad-x-250/notes.md
```

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

Before propellers are installed:

- Confirm IMU orientation and motion signs.
- Confirm receiver channel map and arming channel.
- Confirm failsafe triggers when receiver signal is lost.
- Confirm motor output order with motor test tooling.
- Confirm each motor position and spin direction against `model.toml`.
- Confirm disarmed outputs are stopped.
- Confirm armed idle output is low but stable.

## 5. First Hover

Use conservative PID gains, keep the first test short, and record results in `models/<model>/notes.md`.

The target state is: model TOML plus wiring notes are enough to reproduce a firmware build, flash, bench check, and flight test.
