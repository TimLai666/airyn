# Airyn Flight

This directory is the standalone flight-controller firmware project.

Build from this directory:

```powershell
pio run -e RP2350A
```

Build from the repo root:

```powershell
.\flight\scripts\build.ps1
```

The default model is `../models/testbench`. Select another model with `AIRYN_MODEL`:

```powershell
$env:AIRYN_MODEL="quad-x-250"
pio run -e RP2350A
```

`flight/` may use MCU-safe shared contracts from `../shared/`, but it must not depend on `../mission/` or `../ground/`.
