# Board Configuration

A board file describes one physical PCB or breadboard build. It carries everything that does not change with the airframe: which MCU, which MadFlight adapter, which LED, which PlatformIO environment.

```txt
boards/
└─ pico2_breadboard_dev.toml
```

A model selects a board with `target_board = "pico2_breadboard_dev"`. The board file is merged into the model at load time. The model can still override individual fields with an inline `[board]` section.

## Why Board is Separated From Model

- A board can host many models (same PCB, different airframes).
- A model can move between boards (same airframe, new flight controller).
- Freezing or editing a model never touches the board file, and vice versa.

Target chip selection (RP2350, STM32, ESP32) is a future `targets/` layer. While Airyn is single-MCU, board files inline the MCU/PIO env fields.

## Fields

Top-level:

- `name`: board identifier; must match the file stem and the model's `target_board`.
- `description`: free text.
- `mcu`: human-readable MCU name, for example `RP2350A`.
- `pio_env`: PlatformIO environment used by `flight/scripts/build.ps1`.

`[board]` (merged into the model's `[board]`):

- `madflight_board`: MadFlight board adapter header.
- `led_pin`: status LED pin.
- `led_gizmo`: LED driver style used by MadFlight.

## Override Example

```toml
# models/dev/quad-x-250/model.toml
target_board = "pico2_breadboard_dev"

[board]
led_pin = 22  # this airframe wires the LED to GPIO 22 instead of 25
```

All other board fields still come from `boards/pico2_breadboard_dev.toml`.

## Validation

`flight/tools/check_config.py` fails if `target_board` references a missing board file and the model also has no inline `[board]` section.
