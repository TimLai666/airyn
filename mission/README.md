# Airyn Mission

Onboard mission-computer software. This is where navigation, camera control, mission logic, AI, and data synchronization will live.

The mission system is written in Go and must not become a firmware dependency.

## Commands

```powershell
go test ./...
go run ./cmd/missiond
```

## Boundary

`mission/` may use `../shared/` and may communicate with `flight/` over a protocol boundary, but `flight/` must not import or compile against mission code.
