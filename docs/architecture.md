# Flight Architecture

`flight/` is the independently buildable firmware project. It consumes:

- `../models/<model>/model.toml` for aircraft-specific settings
- `flight/vendor/madflight/` for low-level flight-controller support
- future MCU-safe contracts from `../shared/`

Firmware layering:

```txt
models/<model>/model.toml
        |
flight/tools/platformio_prebuild.py
        |
flight/build/generated/active_model_config.h
        |
flight/src/madflight_config.h
        |
flight/src/app/flight_app.cpp
        |
receiver -> safety -> control loop -> mixer -> motor output
```

Rules:

- Model differences live in `models/`, not scattered through C++.
- Generated files live under `flight/build/` and are ignored.
- `flight/` must not compile against `mission/` or `ground/`.
- MadFlight stays replaceable under `flight/vendor/madflight/`.
