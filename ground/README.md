# Airyn Ground

Ground control, mission planning, and telemetry monitoring.

This project uses Electrobun, not Electron. Electrobun runs the main process on Bun and renders desktop webviews through its own APIs.

## Commands

```powershell
bun install
bun run start
bun run dev
bun run build
```

## Boundary

Ground software may connect directly to `flight/` or connect through `mission/`, but it must not become a firmware dependency.
