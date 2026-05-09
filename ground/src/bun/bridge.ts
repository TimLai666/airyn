/**
 * WebSocket bridge between the bun-side simulator and the renderer.
 *
 * Lifecycle:
 *   1. Bun process boots, calls startBridge(port)
 *   2. Renderer connects to ws://localhost:<port>
 *   3. Server immediately sends `hello` (build + fleet config)
 *   4. Server forwards every simulator event (`fleet`, `log`, `geofence`,
 *      `parameters`, `paramAck`) to all clients
 *   5. Renderer sends `connect` / `disconnect` and other commands
 *
 * Multiple renderers can connect simultaneously; the simulator is shared.
 */

import type { ServerWebSocket } from "bun";
import {
  applyManualOverride,
  commandVehicle,
  configureVehicleLink,
  getCurrentSnapshot,
  getDefaultParamSchema,
  getFleetConfig,
  getParameters,
  recordCalibrationSample,
  setParameter,
  startVehicle,
  stopVehicle,
  subscribe,
  uploadGeofence,
  uploadMissionPlan,
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
          paramSchema: getDefaultParamSchema(),
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
          switch (cmd.type) {
            case "connect": startVehicle(cmd.id); break;
            case "disconnect": stopVehicle(cmd.id); break;
            case "configureLink": configureVehicleLink(cmd.id, cmd.link); break;
            case "command": commandVehicle(cmd.id, cmd.command); break;
            case "uploadPlan": uploadMissionPlan(cmd.id, cmd.waypoints); break;
            case "uploadGeofence": uploadGeofence(cmd.id, cmd.plan); break;
            case "calibration": recordCalibrationSample(cmd.id, cmd.step, cmd.capture, cmd.done); break;
            case "getParameters": getParameters(cmd.id); break;
            case "setParameter": setParameter(cmd.id, cmd.key, cmd.value); break;
            case "manualOverride": applyManualOverride(cmd.id, cmd.override); break;
          }
        } catch (err) {
          console.error("[airyn-bridge] bad client message:", err);
        }
      },
    },
  });

  console.log(`[airyn-bridge] listening on ws://localhost:${port}`);
}
