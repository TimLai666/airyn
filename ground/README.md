# Airyn Ground

Ground control, mission planning, and telemetry monitoring.

This project uses Electrobun, not Electron. Electrobun runs the main process on Bun and renders desktop webviews through its own APIs.

## Current Functional Scope

The app is wired through a local Bun WebSocket bridge, not front-end-only mock state. The current bridge-backed simulator supports:

- per-vehicle connect / disconnect
- arm / disarm
- hold, mission start, RTL, land, and emergency motor stop
- editable mission plan upload plus JSON export
- calibration capture events
- fleet telemetry, GPS loss, link-loss snapshots, and ground-side predicted tracks
- a combined default operator workspace with altitude profile and estimated terrain-relative aircraft view
- armed-state lockout for ordinary disconnect actions

Real serial, UDP, Mission-computer transports, and real DEM-backed terrain data are still pending. The bridge message shape is in `src/shared/protocol.ts` so those transports can replace the simulator without rewriting the renderer.

## Dependency Policy

Prefer Bun-native functionality before adding packages:

- file I/O: `Bun.file`, `Bun.write`
- local HTTP/WebSocket services: `Bun.serve`
- local storage when appropriate: `bun:sqlite`
- tests: `bun test`
- bundling/build helpers: Bun's built-in bundler and Electrobun build hooks

Add a package only when Bun or Electrobun does not provide the capability, or when a specialized library clearly reduces implementation risk. Keep runtime dependencies small; `electrobun` should remain the main ground dependency.

Current extra dev-only packages are for TypeScript support. `@types/three` is present because Electrobun's exported types reference `three`.

## Commands

```powershell
bun install
bun run start
bun run dev
bun run build
```

## Boundary

Ground software may connect directly to `flight/` or connect through `mission/`, but it must not become a firmware dependency.
