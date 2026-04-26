# Monorepo Architecture

Airyn is organized as a monorepo because flight firmware, mission logic, ground control, protocol messages, and model configuration will evolve together during the design phase.

## Layout

```txt
airyn/
├─ flight/
├─ mission/
├─ ground/
├─ shared/
│  ├─ protocol/
│  ├─ config-schema/
│  └─ math/
├─ models/
├─ sim/
├─ tools/
├─ docs/
└─ examples/
```

## Dependency Rules

`flight/` is the firmware boundary. It must be possible to build it without installing mission-computer or ground-control dependencies.

Allowed:

```txt
shared/protocol
shared/config-schema
shared/math
     ^
flight   mission   ground
```

Also allowed:

```txt
ground -> flight
ground -> mission
mission -> flight
```

These arrows mean communication or tooling relationships, not firmware compile-time dependencies.

Not allowed:

```txt
flight -> mission
flight -> ground
flight -> desktop-only shared code
```

If a shared file is included by firmware, it must stay small, deterministic, and MCU-safe.

## Current Projects

- `flight/`: PlatformIO firmware built around MadFlight.
- `models/`: aircraft settings, one directory per model.
- `shared/protocol/`: future packet, command, and telemetry definitions.
- `mission/`: placeholder for onboard navigation, camera, AI, and sync logic.
- `ground/`: placeholder for control UI, planning, telemetry monitoring.
- `sim/`: placeholder for fake sensors and software simulation.
- `tools/`: placeholder for repo-level tools that are not firmware-only.
