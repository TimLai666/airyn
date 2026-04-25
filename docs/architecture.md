# Architecture

Airyn Flight is organized as a thin project-specific layer over MadFlight.

```text
profiles/ model settings
        |
src/ Airyn startup, wrappers, safety, telemetry
        |
vendor/madflight/ low-level flight-control library
```

## Boundaries

- `profiles/` owns model differences: pins, receiver type, IMU, motor count, and PID placeholders.
- `src/` owns Airyn behavior: startup flow, safety policy, adapter code, telemetry, and future control logic.
- `vendor/madflight/` owns existing low-level modules and should remain replaceable.

## First Version

The first firmware is intentionally small:

- `src/main.cpp` exposes Arduino `setup()`, `loop()`, and MadFlight `imu_loop()`.
- `src/app/flight_app.cpp` starts MadFlight, initializes motor outputs, and updates AHRS.
- `profiles/dev/test_model/model.toml` is the model source of truth.
- `tools/build_model.py` creates firmware build artifacts under `build/generated/` from that TOML.

This is a smoke-test foundation, not a flight-verified controller.
