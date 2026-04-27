/**
 * Wire protocol between ground/src/bun (server) and ground/src/mainview
 * (renderer). Speaks JSON over WebSocket on a fixed local port.
 *
 * Eventually a stricter / more compact frame format will live in the
 * top-level shared/protocol so flight firmware and mission code can read it
 * too. For now this file scopes the messages to ground only.
 */

export type LinkMode = "direct" | "via-mission";
export type LinkTransport = "serial" | "udp" | "tcp" | "ws";
export type VehicleColor = "ochre" | "ice" | "ok";
export type LogLevel = "info" | "warn" | "err";

export interface VehicleLink {
  mode: LinkMode;
  transport: LinkTransport;
  endpoint: string;
}

/** Static config sent once via the `hello` message. */
export interface VehicleConfig {
  id: string;
  callsign: string;
  color: VehicleColor;
  link: VehicleLink;
}

/** Per-tick rolling state for one vehicle. */
export interface VehicleFrame {
  id: string;
  flight: boolean;
  // truth position; mainview decides which polyline to append to
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  gpsActive: boolean;
  gpsSats: number;
  gpsHdop: number;
  insActive: boolean;
  // attitude / telemetry
  roll: number; pitch: number; yaw: number;
  thr: number; vbat: number; armed: boolean;
  // sensors
  gyroX: number; gyroY: number; gyroZ: number;
  accelX: number; accelY: number; accelZ: number;
  baroAlt: number; baroVs: number; baroP: number; baroT: number;
  batI: number; batUsed: number;
}

/** Server → client. */
export type ServerMessage =
  | {
      type: "hello";
      build: string;
      port: number;
      vehicles: VehicleConfig[];
    }
  | {
      type: "fleet";
      t: number;            // server-side simTime in seconds
      flight: boolean;       // any vehicle live?
      vehicles: VehicleFrame[];
    }
  | {
      type: "log";
      level: LogLevel;
      tagKey: string;        // i18n key, e.g. "log.tag.link"
      msgKey: string;        // i18n key, e.g. "log.msg.connected"
      msgArgs?: (string | number)[];
    };

/** Client → server. Connection is per-vehicle. */
export type ClientMessage =
  | { type: "connect"; id: string }
  | { type: "disconnect"; id: string };

export const BRIDGE_PORT = 7711;
