# Wiring Guide

Wiring notes live with each model profile. Keep them accurate enough that the physical aircraft can be rebuilt without searching source code.

Every stable profile should document:

- Board and target environment.
- Power source assumptions.
- IMU pins, bus, and interrupt pin.
- Receiver signal and power pins.
- Motor output pins, ESC mapping, and motor position.
- Known unverified items.

## Safety Checklist

- Remove propellers before motor tests.
- Verify ground is shared between receiver, ESC signal ground, and flight controller.
- Verify IMU orientation before PID tests.
- Verify motor order and direction at low power.
- Move a profile to `stable/` only after wiring and notes are complete.

