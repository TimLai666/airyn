# Flight Architecture

`flight/` is the independently buildable firmware project. It consumes:

- `../models/<tier>/<model>/model.toml` for aircraft-specific settings
- `../boards/<target_board>.toml` for board pinout and MadFlight adapter
- `flight/vendor/madflight/` for low-level flight-controller support
- future MCU-safe contracts from `../shared/`

Firmware layering:

```txt
models/<tier>/<model>/model.toml + boards/<target_board>.toml
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

Adapter boundary:

```txt
flight/src/devices/
        receiver.{h,cpp}      wraps MadFlight rcl
        motor_output.{h,cpp}  wraps MadFlight out
        imu_adapter.{h,cpp}   wraps MadFlight ahr/imu
```

Rules:

- Model differences live in `models/`; board differences live in `boards/`. Neither should leak into C++ source.
- `flight/build/generated/active_model_config.h` is the only entry point for model/board settings into firmware. Application code does not read TOML, talk to PlatformIO env vars, or include MadFlight headers directly outside `devices/` and `madflight_config.h`.
- Generated files live under `flight/build/` and are ignored.
- `flight/` must not compile against `mission/` or `ground/`.
- MadFlight stays replaceable under `flight/vendor/madflight/`. New code that needs a MadFlight global goes through an adapter in `devices/`.
