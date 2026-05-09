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
export type VehicleMode = "standby" | "manual" | "takeoff" | "hold" | "mission" | "rtl" | "land";
export type SafetyState = "offline" | "preflight" | "armed" | "failsafe";
export type VehicleCommand = "arm" | "disarm" | "takeoff" | "hold" | "mission" | "rtl" | "land" | "kill";

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
  /** Optional video feed URL. Web-playable format (HLS/MP4/MJPEG/WebRTC manifest). */
  videoUrl?: string;
}

export interface MissionWaypoint {
  type: "takeoff" | "waypoint" | "land";
  lat: number;
  lon: number;
  alt: number;
}

/**
 * Pre-arm reason reported by the flight stack. QGC-style: `severity` lights
 * the preflight chip, `key` is an i18n string the renderer expands, `args`
 * fills the placeholders. Severity `pass` is a positive check.
 */
export type PreflightSeverity = "pass" | "warn" | "fail";
export interface PreflightReason {
  key: string;
  severity: PreflightSeverity;
  args?: (string | number)[];
}

/** Geofence shape supported by Airyn. Mirrors ArduPilot's set. */
export type GeofenceCircle = {
  type: "circle";
  centerLat: number;
  centerLon: number;
  radiusM: number;
  maxAltM: number;
};
export type GeofencePolygon = {
  type: "polygon";
  inclusion: boolean;       // true = inclusion (must stay inside), false = exclusion (no-fly)
  vertices: { lat: number; lon: number }[];
};
export type GeofenceShape = GeofenceCircle | GeofencePolygon;

export interface RallyPoint {
  lat: number;
  lon: number;
  alt: number;
}

export interface GeofencePlan {
  enabled: boolean;
  shapes: GeofenceShape[];
  rally: RallyPoint[];
  /** RTL action when fence breach: nearest rally point or home. */
  breachAction: "rtl-home" | "rtl-rally" | "land";
}

/** MAVLink-style scalar parameter. Renderer treats them as opaque key/value. */
export type ParamValue = number | boolean | string;
export interface ParameterDescriptor {
  key: string;
  value: ParamValue;
  type: "int" | "float" | "bool" | "string";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  group?: string;
  /** Human-readable hint, optional. */
  hint?: string;
}

/** Manual stick override (-1..+1) from gamepad/keyboard. */
export interface ManualOverride {
  roll: number;
  pitch: number;
  yaw: number;
  throttle: number;        // 0..1
  /** Active flag — when false, flight stack returns to autonomous control. */
  active: boolean;
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
  preflightReasons: PreflightReason[];
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
  // home position (set once GPS locks). null until acquired.
  homeLat: number | null;
  homeLon: number | null;
  homeAlt: number | null;
  /** Estimated battery time-to-go in seconds at current draw. null if unknown. */
  batTtgSec: number | null;
  /** Distance to home in meters when GPS is good, otherwise null. */
  distHomeM: number | null;
  /** Uplink RSSI (-dBm scale). null when not measured. */
  rssiDbm: number | null;
  /** Link quality 0..1 (uplink). null when not measured. */
  linkQuality: number | null;
  /** Geofence breach state: 'inside' | 'breach-soft' | 'breach-hard'. */
  fenceState: "inside" | "breach-soft" | "breach-hard" | "none";
}

/** Server → client. */
export type ServerMessage =
  | {
      type: "hello";
      build: string;
      port: number;
      vehicles: VehicleConfig[];
      paramSchema?: ParameterDescriptor[]; // optional default param set
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
    }
  | {
      type: "geofence";
      id: string;
      plan: GeofencePlan;
    }
  | {
      type: "parameters";
      id: string;
      params: ParameterDescriptor[];
    }
  | {
      type: "paramAck";
      id: string;
      key: string;
      ok: boolean;
      value: ParamValue;
      message?: string;
    };

/** Client → server. Connection is per-vehicle. */
export type ClientMessage =
  | { type: "connect"; id: string }
  | { type: "disconnect"; id: string }
  | { type: "configureLink"; id: string; link: VehicleLink }
  | { type: "command"; id: string; command: VehicleCommand }
  | { type: "uploadPlan"; id: string; waypoints: MissionWaypoint[] }
  | { type: "uploadGeofence"; id: string; plan: GeofencePlan }
  | { type: "calibration"; id: string; step: number; capture: number; done: boolean }
  | { type: "getParameters"; id: string }
  | { type: "setParameter"; id: string; key: string; value: ParamValue }
  | { type: "manualOverride"; id: string; override: ManualOverride };

export const BRIDGE_PORT = 7711;

/**
 * QGroundControl-compatible .plan file format (subset). Mirrors
 * https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/plan.html
 * so .plan files can be exchanged with QGC.
 */
export interface QgcPlanFile {
  fileType: "Plan";
  version: 1;
  groundStation: "Airyn Ground" | "QGroundControl";
  mission: {
    version: 2;
    firmwareType: number;       // 12 = ArduPilot, 3 = PX4
    vehicleType: number;        // 2 = Quadrotor
    cruiseSpeed: number;
    hoverSpeed: number;
    plannedHomePosition: [number, number, number]; // lat, lon, alt
    items: QgcSimpleItem[];
  };
  geoFence: {
    version: 2;
    circles: { circle: { center: [number, number]; radius: number }; inclusion: boolean }[];
    polygons: { polygon: [number, number][]; inclusion: boolean }[];
  };
  rallyPoints: {
    version: 2;
    points: [number, number, number][];
  };
}
export interface QgcSimpleItem {
  type: "SimpleItem";
  command: number;              // 16 = WAYPOINT, 22 = TAKEOFF, 21 = LAND
  frame: number;                // 3 = MAV_FRAME_GLOBAL_RELATIVE_ALT
  AMSLAltAboveTerrain: number | null;
  Altitude: number;
  AltitudeMode: number;
  autoContinue: boolean;
  doJumpId: number;
  params: (number | null)[];    // [hold, accept_radius, pass_radius, yaw, lat, lon, alt]
}
