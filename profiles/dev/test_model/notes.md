# dev_test_model Notes

## 2026-04-25

- Initial development profile for a Pico 2 Quad X test setup.
- `model.toml` is the source of truth; build tools generate the MadFlight config bridge.
- PID values are placeholders.
- Motor order, direction, DShot support, receiver input, and IMU interrupt wiring are not yet flight-verified.

## Known Issues

- Do not test with propellers installed.
- Stable profiles should not be created from this until hardware checks pass.
