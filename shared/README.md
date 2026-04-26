# Airyn Shared

Shared contracts and lightweight logic used across Airyn projects.

- `protocol/`: packet formats, commands, telemetry contracts.
- `config-schema/`: model configuration schema and validation rules.
- `math/`: shared coordinate, attitude, and unit helpers.

Anything included by `flight/` must remain MCU-safe.
