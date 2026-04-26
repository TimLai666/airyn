# New Model Bring-up

This checklist keeps a new aircraft profile source-driven and prevents model-specific C++ edits. It does not make a profile flight-safe by itself; every hardware item below must be verified on the bench before prop-on flight.

## 1. Create the Profile

- Start from `profiles/dev/test_model/` or an existing stable profile copy.
- For a new aircraft, create `profiles/dev/<model_name>/`.
- For an old stable aircraft, prefer:

```powershell
python tools/edit_model.py stable/<name> --target dev/<name>_edit --reason "Describe change"
```

- Keep all model-specific settings in `model.toml`.
- Put wiring in `wiring.md`.
- Put test notes, date, hardware changes, and safety observations in `notes.md`.

## 2. Fill `model.toml`

- Set `name`, `target_board`, and `frame`.
- Configure the IMU type, bus, address, interrupt pin, and bus pins.
- Configure receiver type, pin or serial bus, channel count, and channel map when supported by the schema.
- Configure ESC protocol and rate.
- Configure every motor pin, output order, position, and direction when supported by the schema.
- Set conservative PID values for first power-up.
- Set safety values such as arm throttle threshold, idle throttle, output limits, and failsafe timeout when supported by the schema.

## 3. Fill `wiring.md`

- Document board orientation and USB direction.
- Document IMU wiring and physical orientation.
- Document receiver wiring, power, signal voltage, protocol, and channel mapping.
- Document ESC signal pins, ground wiring, motor order, and motor direction.
- Confirm every powered device shares ground with the flight controller.

## 4. Build

```powershell
$env:AIRYN_PROFILE="dev/<model_name>"; pio run -e RP2350A
```

- Fix profile validation failures before changing firmware source.
- Confirm generated files remain under `build/generated/`.

## 5. Upload Firmware

- Remove propellers.
- Power the flight controller from USB first.
- Use the project upload script or PlatformIO upload command for the target board.
- Keep ESC battery power disconnected until the USB-only checks pass.

## 6. Check Serial Startup Output

- Open the serial monitor at `115200`.
- Confirm model name and target board.
- Confirm frame type.
- Confirm receiver type and pin.
- Confirm ESC protocol and rate.
- Confirm motor count and motor pins.
- Keep the MadFlight CLI available for hardware inspection.

## 7. Verify IMU

- Confirm IMU data updates.
- Confirm board stillness reports stable attitude.
- Tilt nose down, roll right, and yaw by hand; verify the displayed orientation follows the aircraft.
- If orientation is wrong, fix the profile or documented mounting before moving on.

## 8. Verify Receiver

- Bind the receiver.
- Confirm receiver connected state changes correctly when the transmitter is on and off.
- Verify throttle, roll, pitch, yaw, arm switch, and mode switch channels.
- Confirm low throttle reads below the arm threshold.
- Confirm receiver loss enters failsafe within the configured timeout.

## 9. No-prop Arm and Disarm Test

- Keep propellers removed.
- Keep the aircraft restrained.
- Confirm throttle high blocks arming.
- Confirm IMU unhealthy blocks arming if the IMU is disconnected or faulted.
- Confirm arm switch on arms only at low throttle.
- Confirm arm switch off immediately disarms.
- Confirm transmitter off or receiver unplugged enters failsafe and disarms.

## 10. No-prop Motor Order Test

- Connect ESC battery power only after all USB-only checks pass.
- Command one motor at a time at the lowest useful output.
- Confirm M1, M2, M3, and M4 match `model.toml` and `wiring.md`.
- Stop immediately if the wrong motor spins and correct the profile before continuing.

## 11. No-prop Motor Direction Test

- Spin each motor at low output.
- Confirm each motor direction matches the frame diagram and prop direction plan.
- Swap motor wires or update ESC direction settings as needed.
- Re-run motor order after any ESC or wiring change.

## 12. Conservative PID Setup

- Start with low rate gains.
- Keep integral low or zero for the first hover.
- Confirm disarm and failsafe reset PID integrators.
- Record every change in `notes.md`.

## 13. First Hover

- Install correct propellers only after all no-prop tests pass.
- Use an open area and a charged battery.
- Arm at low throttle and lift into a short hover.
- Land immediately on oscillation, wrong correction direction, receiver glitches, or unexpected motor behavior.
- Update `notes.md` with the result before further tuning.

## 14. Freeze Stable Profile

After the model has a verified hover and the notes explain the tested hardware state:

```powershell
python tools/freeze_model.py dev/<model_name> stable/<model_name> --update --reason "Verified no-prop checks and hover"
```

- Confirm `profiles/stable/<model_name>/notes.md` records the freeze reason.
- Never treat compile success alone as flight-safe.
