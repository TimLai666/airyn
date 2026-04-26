# Airyn Ground

Ground control, mission planning, and telemetry monitoring.

This project uses Electrobun, not Electron. Electrobun runs the main process on Bun and renders desktop webviews through its own APIs.

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
