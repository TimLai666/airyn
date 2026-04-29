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
export type VehicleMode = "standby" | "manual" | "hold" | "mission" | "rtl" | "land";
export type SafetyState = "offline" | "preflight" | "armed" | "failsafe";
export type VehicleCommand = "arm" | "disarm" | "hold" | "mission" | "rtl" | "land" | "kill";

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

export interface MissionWaypoint {
  type: "takeoff" | "waypoint" | "land";
  lat: number;
  lon: number;
  alt: number;
}

/** Per-tick rolling state for one vehicle. */
export interface VehicleFrame {
  id: string;
  flight: boolean;
  /**
   * Aircraft ↔ ground link health.
   *   true  — frames are fresh; everything below is current
   *   false — link to this aircraft has dropped; the values below are
   *           a frozen snapshot of the last frame we received from it.
   *           The renderer should switch to its own dead-reckoning and
   *           visually mark the vehicle as a ghost.
   */
  linkActive: boolean;
  // last-known position (or live, if linkActive)
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  /**
   * Aircraft ↔ GPS satellite health, as reported by the aircraft. Only
   * meaningful when linkActive is true.
   */
  gpsActive: boolean;
  gpsSats: number;
  gpsHdop: number;
  /**
   * Aircraft is dead-reckoning onboard with IMU because GPS is gone but
   * link is still up. Distinct from ground-side prediction during link
   * loss.
   */
  insActive: boolean;
  // attitude / telemetry
  mode: VehicleMode;
  safetyState: SafetyState;
  preflightOk: boolean;
  missionUploaded: boolean;
  missionCount: number;
  missionActiveIndex: number | null;
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
  | { type: "disconnect"; id: string }
  | { type: "command"; id: string; command: VehicleCommand }
  | { type: "uploadPlan"; id: string; waypoints: MissionWaypoint[] }
  | { type: "calibration"; id: string; step: number; capture: number; done: boolean };

export const BRIDGE_PORT = 7711;
