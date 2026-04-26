# airyn-flight

Airyn Flight is a custom flight-controller workspace built around [MadFlight](https://github.com/qqqlab/madflight).

This repo owns the project structure, model profiles, board notes, safety rules, and build tooling. MadFlight is kept as an external dependency under `vendor/madflight` and should not be edited directly unless the change is intentional and documented.

## Current Status

- MadFlight is included as a Git submodule at `vendor/madflight`.
- The submodule is pinned to tag `v2.3.0`.
- Default build target is `RP2350A` for Raspberry Pi Pico 2.
- Default model profile is `profiles/dev/test_model`.
- Firmware has a first-pass rate-mode flight loop wired through MadFlight, receiver normalization, arming/failsafe, PID, Quad X mixer, motor output, and serial debug.
- It still needs PlatformIO compilation and no-prop hardware verification before any flight attempt.

## Layout

```text
docs/                         Project design and integration notes
profiles/dev/test_model/      Daily development model profile
profiles/stable/              Flight-verified model profiles, later
profiles/experimental/        Experimental models, later
src/                          Airyn firmware wrapper code
tools/                        Profile validation and generation tools
scripts/                      Build, flash, and clean helpers
targets/                      Target platform notes, later
tests/                        Config, mixer, and safety tests, later
vendor/madflight/             MadFlight submodule
```

## Setup

Clone with submodules:

```bash
git clone --recurse-submodules <this-repo-url>
```

If the repo is already cloned:

```bash
git submodule update --init --recursive
```

Install PlatformIO. This project uses PlatformIO to download MCU frameworks, resolve Arduino headers such as `Arduino.h`, compile firmware, upload to the board, and open the serial monitor.

Recommended setup:

1. Install VS Code.
2. Install the `PlatformIO IDE` extension.
3. Restart VS Code and open this repo folder.
4. Confirm the CLI is available:

```bash
pio --version
```

The build command automatically validates `model.toml` and creates temporary firmware build artifacts under `build/generated/`.

## VS Code IntelliSense

This project uses Arduino framework headers through PlatformIO. If VS Code reports `Arduino.h` or `madflight.h` include errors, install the PlatformIO IDE extension and let it configure the C/C++ extension. The repo includes `.vscode/settings.json` with:

```json
"C_Cpp.default.configurationProvider": "platformio.platformio-ide"
```

After installing PlatformIO, run a build once so the framework packages and include paths are downloaded.

## Build

Default profile and target:

```bash
pio run
```

Explicit target:

```bash
pio run -e RP2350A
```

Build another profile as one command:

```powershell
$env:AIRYN_PROFILE="dev/test_model"; pio run -e RP2350A
```

Upload:

```bash
pio run -e RP2350A -t upload
```

The `scripts/` helpers are optional shortcuts, not required steps.

## Profile Workflow

Daily hardware changes go in:

```text
profiles/dev/test_model/
```

Each profile should contain:

- `model.toml`
- `wiring.md`
- `notes.md`

`model.toml` is the single source of truth for a model. The build step turns it into firmware build artifacts under `build/generated/`; those files are not edited by hand and are not the profile format.

## Model Settings

Each drone or aircraft model is described by one `model.toml`. The current format covers:

- Model identity: model name, target board, and frame type.
- Board settings: MadFlight board header, LED pin, and board-level defaults.
- IMU settings: sensor type, bus type, I2C bus, SDA/SCL pins, interrupt pin, and address.
- Receiver settings: receiver protocol, input pin or serial bus, channel count, channel map, deadband, and failsafe timeout.
- ESC settings: output protocol, DShot/PWM details, telemetry flag, and command range.
- Safety settings: arm throttle threshold, armed idle throttle, output limits, and disarm behavior.
- Flight settings: rate mode and max roll/pitch/yaw rates.
- Motors: motor count, output index, GPIO pin, name, physical position, and spin direction.
- PID settings: roll, pitch, and yaw gains.
- MadFlight bridge settings: values needed to translate the TOML profile into MadFlight's native config.

Example:

```toml
name = "dev_test_model"
target_board = "pico2_breadboard_dev"
frame = "quad_x"

[imu]
type = "MPU6050"
bus = "i2c"
i2c_bus = 0
sda_pin = 4
scl_pin = 5
int_pin = 9
address = 0x68

[receiver]
type = "PPM"
pin = 8
ppm_bus_alias = 0
channels = 8
deadband = 0.03
failsafe_timeout_ms = 250

[receiver.channel_map]
throttle = 1
roll = 2
pitch = 3
yaw = 4
arm = 5
mode = 6

[esc]
protocol = "DSHOT"
dshot_rate = 300
telemetry = false
idle_percent = 5.0
min_command = 0
max_command = 2000

[safety]
arm_throttle_threshold = 0.05
armed_idle_throttle = 0.06
min_output = 0.0
max_output = 1.0
disarm_behavior = "stop"

[flight]
mode = "rate"

[flight.rate_limits]
roll_dps = 360.0
pitch_dps = 360.0
yaw_dps = 180.0

[[motors]]
name = "M1"
pin = 2
output_index = 0
position = "front_right"
direction = "ccw"

[pid]
integrator_limit = 25.0
output_limit = 1.0
```

When a model is verified, freeze it into `profiles/stable/`:

```bash
python tools/freeze_model.py dev/test_model stable/quad_x_basic --reason "First verified Quad X wiring"
```

Existing stable models can also be changed. Copy the old model into a dev editing profile, test it there, then write it back with an update reason:

```bash
python tools/edit_model.py stable/quad_x_basic --target dev/quad_x_basic_edit --reason "Change receiver pins"
python tools/freeze_model.py dev/quad_x_basic_edit stable/quad_x_basic --update --reason "Verified receiver pin update"
```

The rule is not "old models are immutable"; the rule is "old models are modified through a tracked edit and verification path."

## MadFlight Dependency

Directly cloning MadFlight into `vendor/madflight` is technically workable, but this repo uses a submodule instead. The reason is practical: the parent repo tracks only the exact MadFlight commit, while MadFlight keeps its own history and can be upgraded cleanly.

MadFlight `main` is a development branch. For this repo the dependency is pinned to the latest tag observed during setup, `v2.3.0`, instead of following `main`.

## Safety

Do not test motor output with propellers installed. The current profile uses placeholder pins, placeholder PID values, and unverified motor order.
