# Operating Modes

Airyn supports two operating modes for connecting the pilot/operator to the flight controller. Both are first-class and selected per session, not per model.

## Direct Mode

```txt
Ground -> Flight
```

Ground talks straight to the flight controller. There is no companion computer in the loop.

When to use it:

- Bench bring-up and configuration.
- PID tuning sessions.
- Bare-firmware debug over USB serial.
- Manual flight without autonomy.

Transport:

- USB serial during development.
- Future: shared MAVLink-style telemetry over UART/UDP through `shared/protocol`.

Failure model:

- Loss of the Ground link is treated as a receiver failsafe by `flight/safety/`.
- No mission scheduling, waypoints, or AI logic runs.

## Mission Mode

```txt
Ground -> Mission -> Flight
```

`mission/` runs on the companion computer (the airframe carries it). Ground talks to Mission, Mission talks to Flight.

When to use it:

- Autonomous waypoint flying.
- Camera/AI workloads that must not run on the MCU.
- Sync, logging, or offline replay of telemetry.
- Multi-drone coordination from a single Ground session.

Transport:

- Ground <-> Mission: TCP/UDP/WebSocket via `shared/protocol`.
- Mission <-> Flight: serial or UDP via `shared/protocol`, MCU-safe subset only.

Failure model:

- Loss of Ground does not crash the aircraft. Mission keeps the active plan and the configured Ground-loss policy.
- Loss of Mission is treated as a receiver failsafe by `flight/safety/`.
- `flight/` never compiles against `mission/`; the boundary is the wire protocol.

## Shared Rules

- The pilot can always force Direct Mode for emergency manual control if the radio link is healthy.
- Both modes share the same `models/<tier>/<model>/model.toml` definition; mode selection does not change the model.
- The selected mode is reported in startup telemetry so the operator knows what they are controlling.

See also:

- `docs/architecture.md` for firmware layering.
- `docs/monorepo-architecture.md` for project boundaries.
