/**
 * Fleet simulator that runs inside the bun process.
 *
 * Owns the canonical state for every vehicle: position, attitude, sensors,
 * GPS dropouts, dead-reckoning. Emits `ServerMessage` events that the
 * bridge fans out to the renderer.
 *
 * No DOM, no Leaflet, no view concerns here — this is the data source.
 *
 * When a real flight controller arrives, this file will be replaced (or
 * subclassed) with a transport that reads frames off a serial port / UDP
 * socket / mission-computer WebSocket and emits the same `ServerMessage`
 * shape. The renderer doesn't change.
 */

import type {
  GeofencePlan,
  ManualOverride,
  MissionWaypoint,
  ParameterDescriptor,
  ParamValue,
  PreflightReason,
  SafetyState,
  ServerMessage,
  VehicleColor,
  VehicleCommand,
  VehicleConfig,
  VehicleFrame,
  VehicleLink,
  VehicleMode,
} from "../shared/protocol";

const SIM_DT = 0.1; // 10 Hz

interface SimVehicle {
  // config (immutable at runtime)
  id: string;
  callsign: string;
  color: VehicleColor;
  link: VehicleLink;
  videoUrl?: string;
  // mutable state
  flight: boolean;
  // truth (always up to date in god-mode while flying)
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  gpsActive: boolean;
  gpsSats: number;
  gpsHdop: number;
  insActive: boolean;
  mode: VehicleMode;
  safetyState: SafetyState;
  takeoffTargetAlt: number | null;
  missionPlan: MissionWaypoint[];
  missionActiveIndex: number | null;
  geofence: GeofencePlan;
  fenceState: VehicleFrame["fenceState"];
  parameters: Map<string, ParameterDescriptor>;
  manual: ManualOverride;
  roll: number; pitch: number; yaw: number;
  thr: number; vbat: number; armed: boolean;
  gyroX: number; gyroY: number; gyroZ: number;
  accelX: number; accelY: number; accelZ: number;
  baroAlt: number; baroVs: number; baroP: number; baroT: number;
  batI: number; batUsed: number;
  homeLat: number | null;
  homeLon: number | null;
  homeAlt: number | null;
  rssiDbm: number;
  linkQuality: number;
  // link health & frozen frame for emission while link is down
  linkActive: boolean;
  frozenFrame: VehicleFrame | null;
}

const DEFAULT_PARAMS: ParameterDescriptor[] = [
  { key: "ARMING_CHECK", value: 1, type: "int", min: 0, max: 1, group: "Arming", hint: "Bitmask of pre-arm checks" },
  { key: "BAT_LOW_VOLT", value: 18.5, type: "float", min: 10, max: 30, step: 0.1, unit: "V", group: "Battery", hint: "Low battery action threshold" },
  { key: "BAT_CRT_VOLT", value: 17.5, type: "float", min: 10, max: 30, step: 0.1, unit: "V", group: "Battery", hint: "Critical battery action threshold" },
  { key: "FENCE_ENABLE", value: 1, type: "int", min: 0, max: 1, group: "Fence" },
  { key: "FENCE_RADIUS", value: 250, type: "float", min: 30, max: 5000, step: 10, unit: "m", group: "Fence" },
  { key: "FENCE_ALT_MAX", value: 120, type: "float", min: 10, max: 500, step: 5, unit: "m", group: "Fence" },
  { key: "FENCE_ACTION", value: 1, type: "int", min: 0, max: 4, group: "Fence", hint: "0=report,1=RTL,2=land,4=brake" },
  { key: "FENCE_RET_RALLY", value: 1, type: "int", min: 0, max: 1, group: "Fence", hint: "RTL to nearest rally on breach" },
  { key: "RTL_ALT", value: 30, type: "float", min: 5, max: 200, step: 1, unit: "m", group: "Return" },
  { key: "RTL_SPEED", value: 7, type: "float", min: 1, max: 25, step: 0.5, unit: "m/s", group: "Return" },
  { key: "WPNAV_SPEED", value: 8, type: "float", min: 1, max: 20, step: 0.5, unit: "m/s", group: "Mission" },
  { key: "WPNAV_RADIUS", value: 2.5, type: "float", min: 0.5, max: 30, step: 0.1, unit: "m", group: "Mission" },
  { key: "PILOT_SPEED_UP", value: 2.5, type: "float", min: 0.5, max: 10, step: 0.1, unit: "m/s", group: "Pilot" },
  { key: "ATC_RAT_RLL_P", value: 0.135, type: "float", min: 0, max: 0.5, step: 0.005, group: "PID Roll" },
  { key: "ATC_RAT_RLL_I", value: 0.135, type: "float", min: 0, max: 0.5, step: 0.005, group: "PID Roll" },
  { key: "ATC_RAT_RLL_D", value: 0.0036, type: "float", min: 0, max: 0.05, step: 0.0001, group: "PID Roll" },
  { key: "ATC_RAT_PIT_P", value: 0.135, type: "float", min: 0, max: 0.5, step: 0.005, group: "PID Pitch" },
  { key: "ATC_RAT_PIT_I", value: 0.135, type: "float", min: 0, max: 0.5, step: 0.005, group: "PID Pitch" },
  { key: "ATC_RAT_PIT_D", value: 0.0036, type: "float", min: 0, max: 0.05, step: 0.0001, group: "PID Pitch" },
  { key: "ATC_RAT_YAW_P", value: 0.18, type: "float", min: 0, max: 0.5, step: 0.005, group: "PID Yaw" },
  { key: "FS_THR_ENABLE", value: 1, type: "int", min: 0, max: 4, group: "Failsafe", hint: "RC failsafe action" },
  { key: "FS_GCS_ENABLE", value: 1, type: "int", min: 0, max: 5, group: "Failsafe", hint: "GCS failsafe action" },
  { key: "FS_BATT_ACTION", value: 1, type: "int", min: 0, max: 3, group: "Failsafe", hint: "0=land,1=RTL,2=SmartRTL,3=Terminate" },
  { key: "INS_GYRO_FILTER", value: 20, type: "int", min: 0, max: 200, unit: "Hz", group: "IMU" },
  { key: "INS_ACCEL_FILTER", value: 20, type: "int", min: 0, max: 200, unit: "Hz", group: "IMU" },
  { key: "ESC_PROTOCOL", value: 4, type: "int", min: 1, max: 8, group: "ESC", hint: "1=PWM,2=OneShot,4=DShot300,5=DShot600" },
];

function defaultGeofence(): GeofencePlan {
  return { enabled: false, shapes: [], rally: [], breachAction: "rtl-home" };
}

function defaultManual(): ManualOverride {
  return { roll: 0, pitch: 0, yaw: 0, throttle: 0, active: false };
}

function makeVehicle(
  id: string,
  callsign: string,
  color: VehicleColor,
  link: VehicleLink,
  lat: number,
  lon: number,
  heading: number,
  videoUrl?: string,
): SimVehicle {
  const params = new Map<string, ParameterDescriptor>();
  for (const d of DEFAULT_PARAMS) params.set(d.key, { ...d });
  return {
    id, callsign, color, link, videoUrl,
    flight: false,
    lat, lon,
    altitude: 0,
    speed: 8,
    heading,
    gpsActive: false,
    gpsSats: 0,
    gpsHdop: 99,
    insActive: false,
    mode: "standby",
    safetyState: "offline",
    takeoffTargetAlt: null,
    missionPlan: [],
    missionActiveIndex: null,
    geofence: defaultGeofence(),
    fenceState: "none",
    parameters: params,
    manual: defaultManual(),
    roll: 0, pitch: 0, yaw: heading,
    thr: 0, vbat: 0, armed: false,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    accelX: 0, accelY: 0, accelZ: 1,
    baroAlt: 0, baroVs: 0, baroP: 1013.2, baroT: 24.5,
    batI: 0, batUsed: 0,
    homeLat: null, homeLon: null, homeAlt: null,
    rssiDbm: -120, linkQuality: 0,
    linkActive: true,
    frozenFrame: null,
  };
}

// Hsinchu testbench area, three demo airframes covering both link paths.
const vehicles: SimVehicle[] = [
  makeVehicle("v1", "AIRYN-01", "ochre",
    { mode: "direct",      transport: "serial", endpoint: "COM3 @ 921600" },
    24.78670, 121.00890, 45),
  makeVehicle("v2", "AIRYN-02", "ice",
    { mode: "via-mission", transport: "ws",     endpoint: "airyn-mc-02.local:7700" },
    24.79100, 121.01620, 270),
  makeVehicle("v3", "AIRYN-03", "ok",
    { mode: "direct",      transport: "udp",    endpoint: "127.0.0.1:14550" },
    24.78320, 121.00500, 135),
];

let simTime = 0;
let tickHandle: ReturnType<typeof setInterval> | null = null;

type Subscriber = (msg: ServerMessage) => void;
const subscribers = new Set<Subscriber>();

function emit(msg: ServerMessage): void {
  for (const sub of subscribers) {
    try { sub(msg); } catch (err) { console.error("[sim] subscriber threw", err); }
  }
}

function pushLog(
  level: "info" | "warn" | "err",
  tagKey: string,
  msgKey: string,
  ...args: (string | number)[]
): void {
  emit({ type: "log", level, tagKey, msgKey, msgArgs: args });
}

function jitter(base: number, span: number): number {
  return base + (Math.random() - 0.5) * span * 2;
}

function vehicleHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = ((h ^ id.charCodeAt(i)) * 16777619) >>> 0;
  }
  return h;
}

function paramNum(v: SimVehicle, key: string, fallback: number): number {
  const p = v.parameters.get(key);
  if (!p) return fallback;
  const n = typeof p.value === "boolean" ? (p.value ? 1 : 0) : Number(p.value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Compute the live preflight reason set. Mirrors the QGC pattern: every
 * check is reported with severity, even passes — UI decides whether to
 * dim the green ones.
 */
function buildPreflightReasons(v: SimVehicle): PreflightReason[] {
  const minVbat = paramNum(v, "BAT_LOW_VOLT", 18.5);
  const reasons: PreflightReason[] = [];
  reasons.push(v.linkActive
    ? { key: "preflight.link.ok", severity: "pass" }
    : { key: "preflight.link.lost", severity: "fail" });
  if (!v.flight) {
    reasons.push({ key: "preflight.flight.offline", severity: "fail" });
  }
  reasons.push(v.gpsActive && v.gpsSats >= 6
    ? { key: "preflight.gps.ok", severity: "pass", args: [v.gpsSats] }
    : { key: "preflight.gps.weak", severity: v.gpsActive ? "warn" : "fail", args: [v.gpsSats] });
  if (v.gpsHdop > 2.5 && v.gpsActive) {
    reasons.push({ key: "preflight.gps.hdop", severity: "warn", args: [v.gpsHdop.toFixed(2)] });
  }
  if (v.vbat <= 0) {
    reasons.push({ key: "preflight.bat.unknown", severity: "warn" });
  } else if (v.vbat < minVbat) {
    reasons.push({ key: "preflight.bat.low", severity: "fail", args: [v.vbat.toFixed(1), minVbat.toFixed(1)] });
  } else if (v.vbat < minVbat + 0.5) {
    reasons.push({ key: "preflight.bat.marginal", severity: "warn", args: [v.vbat.toFixed(1)] });
  } else {
    reasons.push({ key: "preflight.bat.ok", severity: "pass", args: [v.vbat.toFixed(1)] });
  }
  reasons.push(v.missionPlan.length > 0
    ? { key: "preflight.mission.ok", severity: "pass", args: [v.missionPlan.length] }
    : { key: "preflight.mission.empty", severity: "warn" });
  reasons.push(v.geofence.enabled && v.geofence.shapes.length > 0
    ? { key: "preflight.fence.ok", severity: "pass", args: [v.geofence.shapes.length] }
    : { key: "preflight.fence.off", severity: "warn" });
  reasons.push(v.homeLat != null && v.homeLon != null
    ? { key: "preflight.home.ok", severity: "pass" }
    : { key: "preflight.home.notset", severity: v.gpsActive ? "warn" : "fail" });
  return reasons;
}

function preflightOk(reasons: PreflightReason[]): boolean {
  return !reasons.some((r) => r.severity === "fail");
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pointInPolygon(lat: number, lon: number, poly: { lat: number; lon: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat;
    const xj = poly[j].lon, yj = poly[j].lat;
    const intersect = ((yi > lat) !== (yj > lat))
      && (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function evaluateFence(v: SimVehicle): VehicleFrame["fenceState"] {
  if (!v.geofence.enabled || v.geofence.shapes.length === 0) return "none";
  if (!v.gpsActive) return "none";
  let inside = true;
  let breachHard = false;
  for (const shape of v.geofence.shapes) {
    if (shape.type === "circle") {
      const d = distanceMeters(v.lat, v.lon, shape.centerLat, shape.centerLon);
      if (d > shape.radiusM) breachHard = true;
      if (v.altitude > shape.maxAltM + 5) breachHard = true;
    } else if (shape.type === "polygon") {
      const inPoly = pointInPolygon(v.lat, v.lon, shape.vertices);
      if (shape.inclusion && !inPoly) inside = false;
      if (!shape.inclusion && inPoly) breachHard = true;
    }
  }
  if (breachHard || !inside) return "breach-hard";
  // Could compute soft-breach (within X% of edge) if we cared.
  return "inside";
}

function resetFlightDynamics(v: SimVehicle): void {
  v.speed = 0;
  v.thr = 0;
  v.roll = 0;
  v.pitch = 0;
  v.altitude = Math.max(0, v.altitude);
  v.baroAlt = v.altitude;
  v.baroVs = 0;
  v.batI = 0;
}

function tickVehicle(v: SimVehicle): void {
  if (!v.flight) return;

  const hash = vehicleHash(v.id);

  // ---- Link-loss pattern (aircraft ↔ ground): 60 s cycle, 10 s drop ----
  const linkPhase = (simTime + ((hash * 17) % 60)) % 60;
  const linkActive = !(linkPhase >= 50 && linkPhase < 60);
  const wasLinkActive = v.linkActive;
  v.linkActive = linkActive;

  if (wasLinkActive && !linkActive) {
    v.frozenFrame = liveFrame(v);
    if (v.armed) {
      v.safetyState = "failsafe";
      v.mode = "hold";
    }
    pushLog("err", "log.tag.link", "log.msg.link_lost", v.callsign,
      v.lat.toFixed(5), v.lon.toFixed(5));
  } else if (!wasLinkActive && linkActive) {
    v.frozenFrame = null;
    if (v.armed && v.safetyState === "failsafe") {
      v.safetyState = "armed";
    }
    pushLog("info", "log.tag.link", "log.msg.link_resume", v.callsign);
  }

  // ---- Link quality / RSSI ----
  if (linkActive) {
    const target = -55 - jitter(0, 8);
    v.rssiDbm += (target - v.rssiDbm) * 0.2;
    v.linkQuality = Math.max(0, Math.min(1, 0.95 + jitter(0, 0.04)));
  } else {
    v.rssiDbm = -120;
    v.linkQuality = 0;
  }

  // GPS dropout pattern: each vehicle drops at a different phase.
  const phase = (simTime + (hash % 30)) % 30;
  const gpsActive = !(phase >= 22 && phase < 30);
  const wasActive = v.gpsActive;
  v.gpsActive = gpsActive;

  if (wasActive && !gpsActive && linkActive) {
    v.insActive = true;
    pushLog("warn", "log.tag.ins", "log.msg.gps_lost", v.callsign);
  } else if (!wasActive && gpsActive && linkActive) {
    v.insActive = false;
    pushLog("info", "log.tag.gps", "log.msg.gps_resume", v.callsign);
  }

  if (gpsActive) {
    if (v.gpsSats < 14) v.gpsSats = Math.min(14, v.gpsSats + 1);
    v.gpsHdop = jitter(0.7, 0.05);
    if (v.homeLat == null && v.gpsSats >= 6) {
      v.homeLat = v.lat;
      v.homeLon = v.lon;
      v.homeAlt = v.altitude;
      pushLog("info", "log.tag.gps", "log.msg.home_set", v.callsign,
        v.lat.toFixed(5), v.lon.toFixed(5));
    }
  } else {
    v.gpsSats = Math.max(0, v.gpsSats - 1);
    v.gpsHdop = 99;
  }

  v.vbat = Math.max(15, v.vbat > 0 ? v.vbat - SIM_DT * (v.armed ? 0.002 : 0.0002) : 22.4);
  v.baroP = jitter(1013.2, 0.4);
  v.baroT = 24.5 + jitter(0, 0.1);

  if (!v.armed) {
    v.mode = "standby";
    v.safetyState = v.linkActive ? "preflight" : "offline";
    resetFlightDynamics(v);
  } else {
    const prevAltitude = v.altitude;
    const desiredSpeed =
      v.mode === "mission" ? paramNum(v, "WPNAV_SPEED", 8) :
      v.mode === "rtl" ? paramNum(v, "RTL_SPEED", 7) :
      v.mode === "land" ? 3 :
      v.mode === "manual" ? Math.max(2, v.manual.throttle * 12) :
      0;
    v.speed += (desiredSpeed - v.speed) * 0.12;

    if (v.mode === "takeoff" || v.mode === "mission" || v.mode === "rtl" || v.mode === "manual") {
      const targetAlt =
        v.mode === "takeoff" ? (v.takeoffTargetAlt ?? 20) :
        v.mode === "rtl" ? paramNum(v, "RTL_ALT", 30) :
        v.mode === "manual" ? Math.max(3, v.altitude + v.manual.throttle * 0.4 - 0.2) :
        45 + Math.sin(simTime * 0.2) * 2;
      v.altitude += (targetAlt - v.altitude) * 0.06;
      if (v.mode === "takeoff" && Math.abs(targetAlt - v.altitude) < 0.8) {
        v.mode = "hold";
        v.takeoffTargetAlt = null;
        pushLog("info", "log.tag.cmd", "log.msg.command_hold", v.callsign);
      }
    } else if (v.mode === "land") {
      v.altitude = Math.max(0, v.altitude - SIM_DT * 1.4);
      if (v.altitude <= 0.2) {
        v.armed = false;
        v.mode = "standby";
        v.safetyState = v.linkActive ? "preflight" : "offline";
        v.takeoffTargetAlt = null;
        pushLog("info", "log.tag.cmd", "log.msg.auto_disarmed", v.callsign);
      }
    }

    if (!v.armed) {
      resetFlightDynamics(v);
    } else {
      if (v.mode !== "takeoff" && v.mode !== "hold" && v.mode !== "standby") {
        let headingTarget = v.heading;
        if (v.mode === "manual") {
          headingTarget = (v.heading + v.manual.yaw * SIM_DT * 90) % 360;
        }
        const headRad = (v.heading * Math.PI) / 180;
        const dlat = (v.speed * SIM_DT * Math.cos(headRad)) / 111111;
        const dlon = (v.speed * SIM_DT * Math.sin(headRad)) / (111111 * Math.cos((v.lat * Math.PI) / 180));
        v.lat += dlat;
        v.lon += dlon;
        if (v.mode === "manual") {
          v.heading = ((headingTarget % 360) + 360) % 360;
          v.roll += (v.manual.roll * 25 - v.roll) * 0.2;
          v.pitch += (v.manual.pitch * 25 - v.pitch) * 0.2;
        } else {
          const curveDeg = v.mode === "rtl" ? -10 : 3 + (hash % 6);
          v.heading = (((v.heading + SIM_DT * curveDeg) % 360) + 360) % 360;
        }
      }

      v.safetyState = v.safetyState === "failsafe" ? "failsafe" : "armed";
      const steadyMode = v.mode === "takeoff" || v.mode === "hold" || v.mode === "standby";
      const baseThrottle = v.mode === "standby" ? 5 : v.mode === "hold" ? 18 : v.mode === "land" ? 22 : 35;
      v.thr = Math.max(0, Math.floor(baseThrottle + jitter(0, steadyMode ? 1.5 : 6)));
      if (v.mode !== "manual") {
        v.roll = jitter(0, steadyMode ? 0.2 : 0.6);
        v.pitch = jitter(0, steadyMode ? 0.2 : 0.6);
      }
      v.baroAlt = v.altitude + jitter(0, 0.3);
      v.baroVs = ((v.altitude - prevAltitude) / SIM_DT) + jitter(0, steadyMode ? 0.08 : 0.4);
      v.batI = jitter(v.mode === "standby" ? 1.4 : v.mode === "hold" ? 5.2 : 8.4, 0.6);
      v.batUsed += (v.batI * SIM_DT) / 3.6;

      if (v.mode === "mission" && v.missionPlan.length > 0) {
        const progress = Math.floor((simTime / 5) % v.missionPlan.length);
        v.missionActiveIndex = progress;
      } else if (v.mode !== "mission") {
        v.missionActiveIndex = null;
      }
    }
  }

  v.yaw = v.heading;

  v.gyroX = jitter(0, 0.4); v.gyroY = jitter(0, 0.4); v.gyroZ = jitter(0, 0.4);
  v.accelX = jitter(0, 0.04); v.accelY = jitter(0, 0.04); v.accelZ = 1.0 + jitter(0, 0.02);

  // Geofence breach detection — apply the configured action.
  const fenceState = evaluateFence(v);
  if (fenceState === "breach-hard" && v.fenceState !== "breach-hard" && v.armed) {
    pushLog("err", "log.tag.fence", "log.msg.fence_breach", v.callsign);
    if (v.geofence.breachAction === "rtl-home" || v.geofence.breachAction === "rtl-rally") {
      v.mode = "rtl";
      v.takeoffTargetAlt = null;
    } else if (v.geofence.breachAction === "land") {
      v.mode = "land";
    }
  }
  v.fenceState = fenceState;
}

function liveFrame(v: SimVehicle): VehicleFrame {
  const reasons = buildPreflightReasons(v);
  const dist = (v.homeLat != null && v.homeLon != null && v.gpsActive)
    ? distanceMeters(v.lat, v.lon, v.homeLat, v.homeLon)
    : null;
  // Battery time-to-go estimate. mAh used vs nominal capacity (5200 mAh).
  const cap = 5200;
  const remaining = Math.max(0, cap - v.batUsed);
  const ttg = v.batI > 0.5 ? (remaining / 1000) / v.batI * 3600 : null;
  return {
    id: v.id,
    flight: v.flight,
    linkActive: true,
    lat: v.lat, lon: v.lon,
    altitude: v.altitude, speed: v.speed, heading: v.heading,
    gpsActive: v.gpsActive, gpsSats: v.gpsSats, gpsHdop: v.gpsHdop,
    insActive: v.insActive,
    mode: v.mode,
    safetyState: v.safetyState,
    preflightOk: preflightOk(reasons),
    preflightReasons: reasons,
    missionUploaded: v.missionPlan.length > 0,
    missionCount: v.missionPlan.length,
    missionActiveIndex: v.missionActiveIndex,
    roll: v.roll, pitch: v.pitch, yaw: v.yaw,
    thr: v.thr, vbat: v.vbat, armed: v.armed,
    gyroX: v.gyroX, gyroY: v.gyroY, gyroZ: v.gyroZ,
    accelX: v.accelX, accelY: v.accelY, accelZ: v.accelZ,
    baroAlt: v.baroAlt, baroVs: v.baroVs, baroP: v.baroP, baroT: v.baroT,
    batI: v.batI, batUsed: v.batUsed,
    homeLat: v.homeLat, homeLon: v.homeLon, homeAlt: v.homeAlt,
    batTtgSec: ttg,
    distHomeM: dist,
    rssiDbm: v.linkActive ? Math.round(v.rssiDbm) : null,
    linkQuality: v.linkActive ? v.linkQuality : null,
    fenceState: v.fenceState,
  };
}

function toFrame(v: SimVehicle): VehicleFrame {
  if (!v.linkActive && v.frozenFrame) {
    return { ...v.frozenFrame, linkActive: false, flight: v.flight };
  }
  return liveFrame(v);
}

function tickFleet(): void {
  simTime += SIM_DT;
  for (const v of vehicles) tickVehicle(v);
  emit({
    type: "fleet",
    t: simTime,
    flight: vehicles.some((v) => v.flight),
    vehicles: vehicles.map(toFrame),
  });
}

// ---- Public API: per-vehicle connect / disconnect ----

export function getFleetConfig(): VehicleConfig[] {
  return vehicles.map((v) => ({
    id: v.id, callsign: v.callsign, color: v.color, link: v.link,
    videoUrl: v.videoUrl,
  }));
}

export function getDefaultParamSchema(): ParameterDescriptor[] {
  return DEFAULT_PARAMS.map((p) => ({ ...p }));
}

export function getCurrentSnapshot(): VehicleFrame[] {
  return vehicles.map(toFrame);
}

export function subscribe(sub: Subscriber): () => void {
  subscribers.add(sub);
  return () => subscribers.delete(sub);
}

function ensureTickRunning(): void {
  if (tickHandle != null) return;
  tickHandle = setInterval(tickFleet, SIM_DT * 1000);
  tickFleet();
}

function maybeStopTick(): void {
  if (tickHandle == null) return;
  if (vehicles.some((v) => v.flight)) return;
  clearInterval(tickHandle);
  tickHandle = null;
  simTime = 0;
}

function emitSnapshot(): void {
  emit({
    type: "fleet",
    t: simTime,
    flight: vehicles.some((v) => v.flight),
    vehicles: vehicles.map(toFrame),
  });
}

export function startVehicle(id: string): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v || v.flight) return;
  v.flight = true;
  v.gpsActive = true;
  v.gpsSats = 8;
  v.gpsHdop = 0.8;
  v.insActive = false;
  v.mode = "standby";
  v.safetyState = "preflight";
  v.takeoffTargetAlt = null;
  v.armed = false;
  v.altitude = 0;
  v.speed = 0;
  v.thr = 0;
  v.vbat = 22.4;
  v.batUsed = 0;
  v.linkActive = true;
  v.frozenFrame = null;
  v.homeLat = null; v.homeLon = null; v.homeAlt = null;
  v.fenceState = "none";

  if (v.link.mode === "via-mission") {
    pushLog("info", "log.tag.link", "log.msg.connected_via_mission", v.callsign, `${v.link.transport.toUpperCase()} · ${v.link.endpoint}`);
  } else {
    pushLog("info", "log.tag.link", "log.msg.connected", v.callsign, `${v.link.transport.toUpperCase()} · ${v.link.endpoint}`);
  }
  setTimeout(() => {
    if (v.flight) pushLog("info", "log.tag.gps", "log.msg.gps_fix", v.callsign, 14);
  }, 3000);

  ensureTickRunning();
  emitSnapshot();
  // Send current geofence + parameters so the renderer rehydrates.
  emit({ type: "geofence", id: v.id, plan: v.geofence });
  emit({ type: "parameters", id: v.id, params: Array.from(v.parameters.values()) });
}

export function stopVehicle(id: string): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v || !v.flight) return;
  v.flight = false;
  v.gpsActive = false;
  v.insActive = false;
  v.gpsSats = 0;
  v.mode = "standby";
  v.safetyState = "offline";
  v.takeoffTargetAlt = null;
  v.armed = false;
  v.altitude = 0;
  v.speed = 0;
  v.thr = 0;
  v.missionActiveIndex = null;
  v.linkActive = true;
  v.frozenFrame = null;
  v.fenceState = "none";
  pushLog("warn", "log.tag.link", "log.msg.disconnected", v.callsign);
  emitSnapshot();
  maybeStopTick();
}

export function commandVehicle(id: string, command: VehicleCommand): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;

  if (!v.flight) {
    pushLog("warn", "log.tag.cmd", "log.msg.command_rejected_offline", v.callsign);
    return;
  }

  if (command === "kill") {
    v.armed = false;
    v.mode = "standby";
    v.safetyState = "failsafe";
    v.takeoffTargetAlt = null;
    resetFlightDynamics(v);
    pushLog("err", "log.tag.cmd", "log.msg.command_kill", v.callsign);
    emitSnapshot();
    return;
  }

  if (command === "arm") {
    if (!preflightOk(buildPreflightReasons(v))) {
      pushLog("warn", "log.tag.safe", "log.msg.arm_rejected", v.callsign);
      return;
    }
    v.armed = true;
    v.mode = "standby";
    v.safetyState = "armed";
    v.thr = 5;
    pushLog("info", "log.tag.cmd", "log.msg.command_arm", v.callsign);
    ensureTickRunning();
    emitSnapshot();
    return;
  }

  if (command === "mission" && v.missionPlan.length === 0) {
    pushLog("warn", "log.tag.cmd", "log.msg.command_rejected_no_plan", v.callsign);
    return;
  }

  if (!v.armed) {
    if (command === "takeoff" || command === "mission") {
      if (!preflightOk(buildPreflightReasons(v))) {
        pushLog("warn", "log.tag.safe", "log.msg.arm_rejected", v.callsign);
        return;
      }
      v.armed = true;
      v.safetyState = "armed";
    } else {
      pushLog("warn", "log.tag.safe", "log.msg.command_rejected_disarmed", v.callsign);
      return;
    }
  }

  switch (command) {
    case "disarm":
      v.armed = false;
      v.mode = "standby";
      v.safetyState = v.linkActive ? "preflight" : "offline";
      v.takeoffTargetAlt = null;
      resetFlightDynamics(v);
      pushLog("info", "log.tag.cmd", "log.msg.command_disarm", v.callsign);
      break;
    case "takeoff":
      v.mode = "takeoff";
      v.takeoffTargetAlt = Math.max(20, v.altitude + 8);
      v.missionActiveIndex = null;
      pushLog("info", "log.tag.cmd", "log.msg.command_takeoff", v.callsign, Math.round(v.takeoffTargetAlt));
      ensureTickRunning();
      break;
    case "hold":
      v.mode = "hold";
      v.takeoffTargetAlt = null;
      pushLog("info", "log.tag.cmd", "log.msg.command_hold", v.callsign);
      break;
    case "mission":
      if (v.missionPlan.length === 0) {
        pushLog("warn", "log.tag.cmd", "log.msg.command_rejected_no_plan", v.callsign);
        return;
      }
      v.mode = "mission";
      v.takeoffTargetAlt = null;
      v.missionActiveIndex = 0;
      pushLog("info", "log.tag.cmd", "log.msg.command_mission", v.callsign, v.missionPlan.length);
      break;
    case "rtl":
      v.mode = "rtl";
      v.takeoffTargetAlt = null;
      v.missionActiveIndex = null;
      pushLog("warn", "log.tag.cmd", "log.msg.command_rtl", v.callsign);
      break;
    case "land":
      v.mode = "land";
      v.takeoffTargetAlt = null;
      v.missionActiveIndex = null;
      pushLog("warn", "log.tag.cmd", "log.msg.command_land", v.callsign);
      break;
  }

  emitSnapshot();
}

export function configureVehicleLink(id: string, link: VehicleLink): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  v.link = { ...link };
  pushLog("info", "log.tag.link", "log.msg.link_config", v.callsign, `${v.link.transport.toUpperCase()} · ${v.link.endpoint}`);
  emitSnapshot();
}

export function uploadMissionPlan(id: string, waypoints: MissionWaypoint[]): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  v.missionPlan = waypoints
    .filter((wp) => Number.isFinite(wp.lat) && Number.isFinite(wp.lon) && Number.isFinite(wp.alt))
    .map((wp) => ({ ...wp }));
  v.missionActiveIndex = null;
  pushLog("info", "log.tag.model", "log.msg.plan_upload", v.missionPlan.length);
  emitSnapshot();
}

export function uploadGeofence(id: string, plan: GeofencePlan): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  v.geofence = {
    enabled: !!plan.enabled,
    shapes: plan.shapes.map((s) => s.type === "circle"
      ? { ...s }
      : { type: "polygon", inclusion: !!s.inclusion, vertices: s.vertices.map((p) => ({ ...p })) }),
    rally: plan.rally.map((r) => ({ ...r })),
    breachAction: plan.breachAction,
  };
  pushLog("info", "log.tag.fence", "log.msg.fence_upload", v.callsign,
    v.geofence.shapes.length, v.geofence.rally.length);
  emit({ type: "geofence", id: v.id, plan: v.geofence });
  emitSnapshot();
}

export function recordCalibrationSample(id: string, step: number, capture: number, done: boolean): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  pushLog("info", "log.tag.cal", done ? "log.msg.cal_step_done" : "log.msg.cal_capture",
    capture, step, v.callsign);
}

export function getParameters(id: string): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) return;
  emit({ type: "parameters", id: v.id, params: Array.from(v.parameters.values()) });
}

export function setParameter(id: string, key: string, value: ParamValue): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v) {
    return;
  }
  const p = v.parameters.get(key);
  if (!p) {
    emit({ type: "paramAck", id, key, ok: false, value, message: "unknown parameter" });
    return;
  }
  let coerced: ParamValue = value;
  if (p.type === "int") coerced = Math.round(Number(value));
  else if (p.type === "float") coerced = Number(value);
  else if (p.type === "bool") coerced = Boolean(value);
  else coerced = String(value);
  if (typeof coerced === "number") {
    if (p.min != null && coerced < p.min) {
      emit({ type: "paramAck", id, key, ok: false, value: p.value, message: `below min ${p.min}` });
      return;
    }
    if (p.max != null && coerced > p.max) {
      emit({ type: "paramAck", id, key, ok: false, value: p.value, message: `above max ${p.max}` });
      return;
    }
  }
  p.value = coerced;
  pushLog("info", "log.tag.param", "log.msg.param_set", key, String(coerced));
  emit({ type: "paramAck", id, key, ok: true, value: coerced });
  emit({ type: "parameters", id, params: Array.from(v.parameters.values()) });
}

export function applyManualOverride(id: string, override: ManualOverride): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v || !v.flight) return;
  v.manual = {
    roll: Math.max(-1, Math.min(1, Number(override.roll) || 0)),
    pitch: Math.max(-1, Math.min(1, Number(override.pitch) || 0)),
    yaw: Math.max(-1, Math.min(1, Number(override.yaw) || 0)),
    throttle: Math.max(0, Math.min(1, Number(override.throttle) || 0)),
    active: !!override.active,
  };
  if (v.manual.active && v.armed && v.mode !== "manual") {
    v.mode = "manual";
    v.takeoffTargetAlt = null;
    v.missionActiveIndex = null;
    pushLog("info", "log.tag.cmd", "log.msg.manual_engage", v.callsign);
  } else if (!v.manual.active && v.mode === "manual") {
    v.mode = "hold";
    pushLog("info", "log.tag.cmd", "log.msg.manual_release", v.callsign);
  }
}
