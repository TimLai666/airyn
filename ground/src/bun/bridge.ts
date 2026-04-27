/**
 * WebSocket bridge between the bun-side simulator and the renderer.
 *
 * Lifecycle:
 *   1. Bun process boots, calls startBridge(port)
 *   2. Renderer connects to ws://localhost:<port>
 *   3. Server immediately sends `hello` (build + fleet config)
 *   4. Server forwards every simulator event (`fleet`, `log`) to all clients
 *   5. Renderer sends `connect` / `disconnect` to drive the simulator
 *
 * Multiple renderers can connect simultaneously; the simulator is shared.
 */

import type { ServerWebSocket } from "bun";
import {
  startSim,
  stopSim,
  subscribe,
  getFleetConfig,
  getCurrentSnapshot,
} from "./sim";
import type {
  ClientMessage,
  ServerMessage,
} from "../shared/protocol";

const BUILD = "0.1.0";

export function startBridge(port: number): void {
  const clients = new Set<ServerWebSocket<unknown>>();

  // Single fan-out point: every simulator event is broadcast to every client.
  subscribe((msg) => {
    const payload = JSON.stringify(msg);
    for (const ws of clients) {
      try { ws.send(payload); } catch { /* dropped */ }
    }
  });

  Bun.serve({
    port,
    fetch(req, server) {
      if (server.upgrade(req)) return; // becomes a websocket
      return new Response("Airyn Ground bridge\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        const hello: ServerMessage = {
          type: "hello",
          build: BUILD,
          port,
          vehicles: getFleetConfig(),
        };
        try { ws.send(JSON.stringify(hello)); } catch { /* */ }

        // Also send the current snapshot so a fresh client can render
        // immediately even if the simulator is already running.
        const snapshot: ServerMessage = {
          type: "fleet",
          t: 0,
          flight: getCurrentSnapshot().some((v) => v.flight),
          vehicles: getCurrentSnapshot(),
        };
        try { ws.send(JSON.stringify(snapshot)); } catch { /* */ }
      },
      close(ws) { clients.delete(ws); },
      message(_ws, raw) {
        try {
          const cmd = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as ClientMessage;
          if (cmd.type === "connect") startSim();
          else if (cmd.type === "disconnect") stopSim();
        } catch (err) {
          console.error("[airyn-bridge] bad client message:", err);
        }
      },
    },
  });

  console.log(`[airyn-bridge] listening on ws://localhost:${port}`);
}
