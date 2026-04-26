# Bring-up Checklist (testbench, Pico 2)

This is the first-time hardware verification flow for `models/dev/testbench/` running on `boards/pico2_breadboard_dev.toml`. The firmware compiles cleanly today, but no line of it has been verified against real hardware. This checklist is what turns a `.uf2` into a flight controller you can trust.

## Safety rules (apply to every step)

- **Never install propellers** until step F1 has passed AND you have read the "First Hover" section at the bottom.
- During any motor test, secure the frame: clamp it, weight it down, or hold it from below. Brushless motors generate enough torque to flip a bare frame.
- Keep one finger near the battery XT60 plug at all times once a battery is connected. Pulling the battery is the only true emergency stop.
- One change at a time. If you adjust wiring, the model TOML, or PID values, re-run any earlier step the change could affect.
- If you see smoke or smell anything burning, **pull the battery first, ask why second**.
- Sections labelled "Powered (battery)" require the LiPo. Sections labelled "USB only" must run with the battery disconnected.

## Equipment list

- Raspberry Pi Pico 2 (RP2350A), USB-C cable
- MPU6050 IMU breakout (I2C, address 0x68)
- PPM-capable receiver and a bound transmitter
- 4x brushless motors, 4x ESCs (must support DShot300; if your ESC is PWM-only, change `models/dev/testbench/model.toml` `[esc]` section before flashing)
- LiPo battery sized for your ESC/motor combo
- A bench mount or strap that can hold the frame still under motor torque
- Wire jumpers per `models/dev/testbench/wiring.md`
- A computer with PlatformIO installed and a serial terminal (PlatformIO's `pio device monitor`, or any 115200 8N1 terminal)

## Test config

Use `models/dev/testbench/model.toml` exactly as committed. Pin assignments:

| Function | GPIO |
|---|---|
| IMU SDA (I2C0) | 4 |
| IMU SCL (I2C0) | 5 |
| IMU INT | 9 |
| IMU I2C address | 0x68 |
| PPM signal | 8 |
| Motor M1 (front_right, CCW) | 2 |
| Motor M2 (rear_right, CW) | 3 |
| Motor M3 (rear_left, CCW) | 6 |
| Motor M4 (front_left, CW) | 7 |
| Status LED | 25 (Pico onboard) |

Receiver channel map (PPM): throttle=1, roll=2, pitch=3, yaw=4, arm=5, mode=6.

If any of these do not match your hardware, edit the TOML and re-flash before starting. Do not adapt the firmware — adapt the model file.

## Flashing

```powershell
$env:AIRYN_MODEL = "testbench"
cd flight
pio run -e RP2350A -t upload
pio device monitor -e RP2350A -b 115200
```

Hold BOOTSEL on the Pico while connecting USB if PlatformIO can't find the bootloader.

---

# Phase A — Power-on and serial sanity (USB only, no IMU/RX/ESC connected)

Goal: confirm the firmware booted, the model contract reached the MCU, and the CLI is responsive. Nothing else is connected yet.

### A1. Startup banner

**Do:** Open the serial monitor at 115200 baud. Press the Pico RUN button (or replug USB) to reboot.

**Expect:**

```
Airyn Flight startup
  model: testbench
  board: pico2_breadboard_dev
  frame: quad_x
  receiver: PPM pin=8
  esc: DSHOT dshot_rate=300
  motors: count=4
    M1 pin=2
    M2 pin=3
    M3 pin=6
    M4 pin=7
CLI ready. Type 'help' or 'diff' in the serial monitor.
```

**Pass:** All seven values match the table above exactly.

**Fail likely cause:** `MODEL_NAME` wrong → wrong `AIRYN_MODEL` env var at build time, rebuild. Wrong pins → editing wrong TOML or stale generated header (delete `flight/build/generated/` and rebuild).

### A2. CLI alive

**Do:** Type `help` and Enter.

**Expect:** A long help table starting with the MadFlight version line, then `-- TOOLS --`, `-- PRINT --`, `-- BLACK BOX --`, `-- CONFIG --`, `-- CALIBRATE --` sections.

**Pass:** Help prints, terminal echoes characters as you type.

**Fail likely cause:** No echo → terminal not in line mode, or `monitor_echo = yes` is being overridden. No response → main loop wedged; check whether `DBG t=...` lines (next step) are appearing.

### A3. Runtime debug ticker

**Do:** Wait ~5 seconds.

**Expect:** Lines like:

```
DBG t=1234 rx=lost thr=0.000 rpy=0.000,0.000,0.000 arm_sw=off mode=0 safety=disarmed reason=startup imu=bad pid=0.000,0.000,0.000 motors=0.000,0.000,0.000,0.000
```

every ~500 ms.

**Pass:** Lines appear, `rx=lost`, `imu=bad`, `safety=disarmed`, `motors=0.000,...`.

**Fail likely cause:** No DBG lines → `imuLoop()` not running (MadFlight `imu_loop` weak symbol not hooked). `safety` field showing garbage → enum mapping broken. `motors=` showing nonzero with nothing connected → safety bypass bug.

### A4. LED blink

**Do:** Watch the green Pico onboard LED.

**Expect:** Slow blink. (`blinkStatus()` toggles every 1000 IMU ticks. Without an IMU this still runs from the MadFlight scheduler but may be slow or stalled — that's fine for now, just confirm the firmware is alive.)

**Pass:** Either steady on, steady off, or blinking. Anything but completely dark.

**Fail likely cause:** Dark → `LED_PIN 25` macro not generated, or the Pico is in BOOTSEL mode (re-flash).

---

# Phase B — IMU (USB only, IMU connected)

Goal: confirm I2C wiring, address, axis assignment, and that the gyro responds to motion in the expected sign convention.

### B1. I2C scan

**Do:** Connect IMU per the pin table. Power-cycle. In the CLI, type `i2c`.

**Expect:** Output listing addresses found on each I2C bus, including `0x68` on bus 0.

**Pass:** `0x68` appears.

**Fail likely cause:** Nothing found → SDA/SCL swapped, IMU not powered (3.3V), pull-ups missing (most breakouts include them; some don't). Found at `0x69` → AD0 pin tied high; either pull AD0 low or set `address = 0x69` in the model TOML.

### B2. IMU healthy flag

**Do:** Watch the `DBG t=...` ticker.

**Expect:** `imu=ok`. Also `safety=disarmed reason=imu_unhealthy` should change to `reason=disarmed_idle` or `reason=throttle_high` (whichever `safety::toString` returns when the IMU is OK and receiver is still lost).

**Pass:** `imu=ok`.

**Fail likely cause:** `imu=bad` despite I2C scan finding the chip → wrong IMU type in TOML, or IMU INT pin not wired to GPIO 9 (MadFlight uses INT for sample timing). Try `pimu` to see the timing miss count.

### B3. Gyro at rest

**Do:** Lay the Pico flat on the bench, perfectly still. In the CLI: `pgyr` (toggles gyro printing). After ~5 seconds: `poff` to stop.

**Expect:** All three axes within ±2 deg/s of zero. Some drift is normal. Heavy noise (>10 deg/s) indicates a bad mount or noisy power.

**Pass:** Numbers stable near zero.

**Fail likely cause:** Large bias → run `calimu` and re-test. Random spikes → loose wiring, especially on INT.

### B4. Accel orientation

**Do:** With the Pico flat, USB connector pointing forward. CLI: `pacc`. Read one line, then `poff`.

**Expect:** `x ≈ 0`, `y ≈ 0`, `z ≈ +1` (approximately; gravity vector points up out of the IMU when flat, so the sensor reads +1g on Z).

**Pass:** Z is near +1 and dominant.

**Fail likely cause:** `z ≈ -1` → IMU is mounted upside down. `x` or `y` dominant → IMU is mounted on its side. Both are fixable later via a MadFlight rotation setting; record the current orientation and continue.

### B5. Gyro axis sign — roll

**Do:** CLI `pgyr`. Pick the board up. Roll it to the **right** (right side dips down). Hold for ~1 second, return to flat.

**Expect:** The roll-axis gyro reading should swing one direction during the tilt and return to zero. Note the sign.

**Pass:** Roll axis (the one MadFlight calls gx) responds. Direction of sign just needs to be **noted, not judged yet** — we cross-check it in step C5 against control output convention.

**Fail likely cause:** No response → wrong axis identified. Try pitch/yaw motions to figure out which of gx/gy/gz responds to which physical axis.

### B6. Gyro axis sign — pitch and yaw

**Do:** Repeat B5 for pitch (nose down) and yaw (rotate clockwise viewed from above).

**Record:** Which physical motion produces which sign on which axis. Write it on a sticky note on the board. Example:

```
roll right  → gx +
nose down   → gy +
yaw CW (top)→ gz -
```

These signs become important when interpreting PID behavior. They do not have to match any specific convention yet — they just have to be consistent and you have to know what they are.

---

# Phase C — Receiver (USB only, IMU + RX connected)

Goal: confirm channel mapping, deadband, and arm switch behavior. ESC and battery still disconnected.

### C1. Receiver bound and producing PPM

**Do:** Power your transmitter. Wire the receiver's signal pin to GPIO 8 and its V+/GND to a 5V source (USB 5V or a separate BEC; check your receiver's voltage). CLI: `ppwm`.

**Expect:** Eight PWM values printed, each 1000–2000 µs, changing as you move the sticks.

**Pass:** Values respond to stick motion.

**Fail likely cause:** All values 0 → no PPM pulses; check receiver bind, signal wire, ground reference. All values stuck at one number → PPM frame not decoded; verify receiver is actually outputting PPM (some output SBUS/CRSF by default and need a config change).

### C2. Channel map

**Do:** With `ppwm` still printing, push **throttle stick up**. Watch which channel number changes.

**Expect:** Channel **1** (`pwm1`) changes from low (~1100) to high (~1900).

**Pass:** Throttle moves channel 1.

**Fail likely cause:** Different channel moves → your transmitter outputs a different channel order. Either re-map sticks on the transmitter to put throttle on channel 1, or update `models/dev/testbench/model.toml` `[receiver.channel_map]` and re-flash.

Repeat for the others:

| Stick | Expected channel |
|---|---|
| Throttle up | 1 → high |
| Roll right | 2 → high |
| Pitch up (nose down on plane terms; check your transmitter) | 3 → high |
| Yaw right | 4 → high |
| Arm switch on | 5 → high (≥ 1600 µs) |
| Mode switch positions | 6 → low / mid / high |

### C3. Scaled receiver values

**Do:** CLI: `prcl` (scaled values), or read the `DBG` line directly.

**Expect:** With sticks centered: `thr=0.000 rpy=0.000,0.000,0.000` (within deadband). With throttle up: `thr` ramps 0.0 → 1.0. With roll right: `rpy=+x,...,...` near +1. Same for pitch and yaw.

**Pass:** Scaled values match expected ranges and signs.

**Fail likely cause:** Stick centered but `rpy` values not near zero → deadband too small, or transmitter trim is off. Reverse direction → that channel needs reversing on the transmitter, **not** in the firmware.

### C4. Arm switch reads correctly

**Do:** Toggle the arm switch on the transmitter while watching `DBG`.

**Expect:** `arm_sw=on` when switch is on, `arm_sw=off` when off.

**Pass:** Field tracks the switch.

**Fail likely cause:** Always off → switch PWM range outside 1600–2500; check `AIRYN_RECEIVER_ARM_PWM_MIN/MAX` defaults in `flight/src/devices/receiver.cpp` against your transmitter's actual switch PWM.

### C5. Failsafe on receiver loss

**Do:** Power off the transmitter. Watch the `DBG` line.

**Expect:** Within `failsafe_timeout_ms` (250 ms in TOML), `rx=lost` and `safety=failsafe` (or `disarmed reason=receiver_lost`). All `rpy` values go to zero.

**Pass:** Switches to failsafe within ~half a second of TX off.

**Fail likely cause:** Stays `rx=ok` after TX off → receiver outputs hold-last-position by default; configure receiver failsafe to "no signal" instead of "hold". Stays armed → safety state machine bug, do not proceed.

---

# Phase D — Arming logic (USB only, IMU + RX, no ESC)

Goal: confirm the safety state machine refuses to arm under each unsafe condition and only arms when everything is clean.

### D1. Cannot arm with throttle high

**Do:** Push throttle to top. Toggle arm switch on. Watch `DBG`.

**Expect:** `safety` stays `disarmed` with `reason=throttle_high` (or similar). Never reaches `armed`.

**Pass:** No arm.

**Fail likely cause:** Arms anyway → `safety::ArmingController` not checking `armingInput.throttle` against `arm_throttle_threshold` (TOML value 0.05).

### D2. Cannot arm with receiver lost

**Do:** Power off TX. Toggle arm switch on (it won't matter since RX is lost, but try anyway). Watch `DBG`.

**Expect:** Stays `disarmed reason=receiver_lost`.

**Pass:** No arm.

### D3. Cannot arm with IMU bad

**Do:** Power TX back on. With everything otherwise normal, briefly disconnect the IMU SDA wire. Watch `imu=` field.

**Expect:** `imu=bad`, and toggling arm switch keeps `safety=disarmed reason=imu_unhealthy`.

**Pass:** No arm.

**Reconnect IMU before proceeding. Re-run B1 to confirm 0x68 is back.**

### D4. Can arm when all clean

**Do:** Throttle full down, TX on, IMU OK (`DBG` shows `imu=ok`, `rx=ok`). Toggle arm switch on.

**Expect:** `safety=armed`. `motors=...` may show low non-zero values (the `armed_idle_throttle = 0.06` in TOML × the mixer output).

**Pass:** Arms exactly when conditions are clean.

**Note:** Do NOT push throttle yet. ESCs are still disconnected; this is just the firmware state.

### D5. Disarm via switch

**Do:** Toggle arm switch off.

**Expect:** Immediately back to `safety=disarmed`. `motors=0.000,...`.

**Pass:** Disarms instantly.

---

# Phase E — Motor output, single motors (USB + battery, no propellers)

Goal: confirm each ESC/motor responds to the right output index and spins the right direction.

### E1. Pre-flight

- Propellers off and physically separated from the bench.
- Frame restrained (clamped or held).
- ESC signal wires from each ESC connected to the matching GPIO (M1→2, M2→3, M3→6, M4→7).
- ESC ground tied to Pico ground.
- Battery NOT yet plugged in.

### E2. ESC arming sequence

**Do:** Plug in the battery. Listen for ESC startup beeps.

**Expect:** Each ESC plays its DShot startup tones and then idles silently (DShot ESCs go straight to "armed" once they see valid frames; you may hear a short two-beep confirmation).

**Pass:** All four ESCs report alive (no continuous beeping, no error tones).

**Fail likely cause:** Continuous beeping from one ESC → no signal from the corresponding GPIO; check wiring. Error tones (long-short patterns) → ESC doesn't support DShot300; switch to PWM in the TOML or use a DShot-capable ESC.

### E3. Single-motor spin with `spinmotors`

**Do:** CLI: `spinmotors`. Read the safety prompt carefully. Confirm props are off. Type `go` and Enter.

**Expect:** MadFlight spins motors **one at a time** by output index, prints `Spinning motor pin_outN GPIOX` and waits for you to press Enter to advance.

For each motor, observe and record:

| Output index (pin_out) | GPIO | Which physical motor spins | Spin direction (top view) | Expected direction (TOML) |
|---|---|---|---|---|
| 0 | 2 | _____ | _____ | CCW (M1 front_right) |
| 1 | 3 | _____ | _____ | CW (M2 rear_right) |
| 2 | 6 | _____ | _____ | CCW (M3 rear_left) |
| 3 | 7 | _____ | _____ | CW (M4 front_left) |

**Pass:** Each output index spins the motor whose physical position matches the TOML, AND each direction matches.

**Fail — motor order wrong:** Either rewire ESC signal pairs to match the TOML, or change the GPIO numbers in `[[motors]]` entries to match physical wiring. The point is `output_index 0` must spin the motor that is physically at `front_right`.

**Fail — direction wrong:** Either swap any two of the three motor wires going from that ESC to its motor (this reverses spin), or set `direction = "cw"` ↔ `"ccw"` in the TOML and re-flash. Then re-test with `spinmotors`.

### E4. Disarmed = stopped

**Do:** After `spinmotors` exits. Confirm `safety=disarmed` in `DBG`. Try toggling arm switch on with throttle down.

**Expect:** When disarmed, motors silent (no idle hum). When armed with throttle still at zero, motors spin at the configured `armed_idle_throttle = 0.06` (a slow steady idle hum).

**Pass:** Idle when armed, silent when disarmed.

---

# Phase F — Mixer (USB + battery, no propellers, motors connected)

Goal: confirm roll/pitch/yaw stick inputs differentiate the four motors correctly.

### F1. Frame layout sanity

Front of the airframe is the side opposite the LiPo connector / camera mount, whichever is your reference. Confirm:

- Front right motor is M1 (verified in E3).
- Rear right is M2.
- Rear left is M3.
- Front left is M4.

If any of these don't match, **stop and fix step E3 before continuing**.

### F2. Roll right → right motors slow, left motors speed up

**Do:** With the frame restrained and props OFF, arm. Hold throttle at a low non-zero value (~10%, just enough to hear differentiation). Roll stick right. Watch the `motors=` field in `DBG` and listen.

**Expect:** Front-right (M1) and rear-right (M2) outputs drop. Front-left (M4) and rear-left (M3) outputs rise. Right side audibly slows, left side audibly speeds up.

**Pass:** Audible asymmetry matches the stick direction.

**Fail — opposite:** Roll output sign wrong; check `rcl_thr` polarity in `[receiver.channel_map]` or transmitter channel reversal. Easier to fix at the transmitter.

**Fail — wrong pair changes:** Mixer geometry wrong. Double-check `position` strings in TOML.

### F3. Pitch forward → front motors slow, rear motors speed up

**Do:** Same as F2 but pitch stick forward (nose down).

**Expect:** M1, M4 drop; M2, M3 rise.

### F4. Yaw right → CCW motors slow, CW motors speed up

**Do:** Yaw right.

**Expect:** M1 (CCW) and M3 (CCW) drop; M2 (CW) and M4 (CW) rise. (Yaw is generated by reaction torque differential between props of opposite spin direction.)

### F5. Throttle scaling

**Do:** Sticks centered, slowly raise throttle from zero to ~30%. All four `motors=` values should rise together (within ±2% noise from PID twitch on a perfectly still frame).

**Expect:** Linear-ish ramp on all four, no individual motor spikes.

**Pass:** All four track throttle.

**Disarm before continuing.**

---

# Phase G — Failsafe under armed conditions (USB + battery, no propellers)

### G1. TX off while armed

**Do:** Arm with throttle low. Power off the transmitter.

**Expect:** Within `failsafe_timeout_ms` (250 ms), `safety=failsafe` (or `disarmed reason=receiver_lost`). All motors stop spinning idle. No runaway.

**Pass:** Motors stop within ~half a second.

**Fail:** Motors keep spinning → critical safety bug. Pull battery. Do not continue. Investigate `safety::ArmingController` and `Receiver::update()` `connected` logic.

### G2. Recover from failsafe

**Do:** Power TX back on. Cycle arm switch off then on (with throttle down).

**Expect:** Returns to `safety=disarmed`, then re-arms when switch toggled (provided throttle is low and IMU still OK).

**Pass:** Recovers cleanly.

### G3. Throttle up immediately on arm should NOT runaway

**Do:** With arm switch on, very slowly raise throttle to ~5%. Drop arm switch (mid-throttle).

**Expect:** Immediate disarm, motors stop within one ~500 ms `DBG` cycle.

**Pass:** Disarms without ramp-down delay.

---

# Phase H — Pre-hover settings audit

Before you ever consider props on:

### H1. PID values are placeholder

The `models/dev/testbench/model.toml` PID gains were never tuned. **Halve them** before first hover:

```toml
[pid.roll]
p = 20.0   # was 40
i = 0.0
d = 7.5    # was 15

[pid.pitch]
p = 20.0   # was 40
i = 0.0
d = 7.5    # was 15

[pid.yaw]
p = 15.0   # was 30
i = 0.0
d = 0.0
```

Re-flash. Re-run a quick D4 (arm test) to confirm nothing broke.

### H2. Rate limits

`flight.rate_limits` of 360/360/180 dps are aggressive. For first hover, consider 180/180/90.

### H3. Idle throttle audit

`safety.armed_idle_throttle = 0.06` should produce a slow idle that does NOT lift the airframe. Verify visually in F2 that idle props (eventually) won't generate lift on your specific motor/prop combo.

### H4. Save a known-good

Once Phases A through G all pass with halved PIDs and reduced rates:

```powershell
python flight\tools\freeze_model.py testbench testbench-bench-verified --reason "Bench checks A-G passed YYYY-MM-DD"
```

This snapshots the verified config under `models/stable/testbench-bench-verified/` so future edits don't lose what worked.

---

# First Hover

This is outside this checklist's scope, but the guardrails are:

- Outdoor, no people within 10m, no expensive things in the crash radius.
- Strap the LiPo securely.
- Props balanced. Props correct rotation matched to motor direction.
- Test arm/disarm one final time on the ground before any throttle.
- Bring throttle up just enough to feel the airframe go light. Do NOT take off on the first arm — confirm tilt response on the ground first.
- A second person ready to call abort.

If the airframe pitches/rolls hard the moment it lifts, **drop throttle immediately, disarm, and review which axis was wrong**. Do not "fly through" instability.

---

# What "verified" means after this

After Phases A–G all pass on the testbench, you have proven:

- The TOML → generated header → firmware → MadFlight chain works end-to-end on real hardware.
- The Airyn adapter wrappers (`receiver`, `motor_output`, `imu_adapter`) behave correctly.
- Safety state machine refuses unsafe arming and triggers on failsafe.
- Mixer geometry matches the TOML.
- ESC protocol works on this specific Pico/ESC combination.

**Only then** is "future new model = edit TOML + bench check" a real workflow. Until that point, every change to the firmware or the model carries the risk of breaking something this checklist would have caught.

After your first verified hover, update `docs/implementation-plan.md` Phase 3–9 status from `Partial` to `Done` and record what changed in `models/dev/testbench/notes.md`.
