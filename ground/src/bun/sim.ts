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
  ServerMessage,
  VehicleConfig,
  VehicleFrame,
  VehicleColor,
  VehicleLink,
} from "../shared/protocol";

const SIM_DT = 0.1; // 10 Hz

interface SimVehicle {
  // config (immutable at runtime)
  id: string;
  callsign: string;
  color: VehicleColor;
  link: VehicleLink;
  // mutable state
  flight: boolean;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  gpsActive: boolean;
  gpsSats: number;
  gpsHdop: number;
  insActive: boolean;
  roll: number; pitch: number; yaw: number;
  thr: number; vbat: number; armed: boolean;
  gyroX: number; gyroY: number; gyroZ: number;
  accelX: number; accelY: number; accelZ: number;
  baroAlt: number; baroVs: number; baroP: number; baroT: number;
  batI: number; batUsed: number;
}

function makeVehicle(
  id: string,
  callsign: string,
  color: VehicleColor,
  link: VehicleLink,
  lat: number,
  lon: number,
  heading: number,
): SimVehicle {
  return {
    id, callsign, color, link,
    flight: false,
    lat, lon,
    altitude: 0,
    speed: 8,
    heading,
    gpsActive: false,
    gpsSats: 0,
    gpsHdop: 99,
    insActive: false,
    roll: 0, pitch: 0, yaw: heading,
    thr: 0, vbat: 0, armed: false,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    accelX: 0, accelY: 0, accelZ: 1,
    baroAlt: 0, baroVs: 0, baroP: 1013.2, baroT: 24.5,
    batI: 0, batUsed: 0,
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

function tickVehicle(v: SimVehicle): void {
  if (!v.flight) return;

  const hash = vehicleHash(v.id);

  // GPS dropout pattern: each vehicle drops at a different phase.
  const phase = (simTime + (hash % 30)) % 30;
  const gpsActive = !(phase >= 22 && phase < 30);
  const wasActive = v.gpsActive;
  v.gpsActive = gpsActive;

  if (wasActive && !gpsActive) {
    v.insActive = true;
    pushLog("warn", "log.tag.ins", "log.msg.gps_lost", v.callsign);
  } else if (!wasActive && gpsActive) {
    v.insActive = false;
    pushLog("info", "log.tag.gps", "log.msg.gps_resume", v.callsign);
  }

  // Move along heading at v.speed (m/s)
  const headRad = (v.heading * Math.PI) / 180;
  const dlat = (v.speed * SIM_DT * Math.cos(headRad)) / 111111;
  const dlon = (v.speed * SIM_DT * Math.sin(headRad)) / (111111 * Math.cos((v.lat * Math.PI) / 180));
  v.lat += dlat;
  v.lon += dlon;

  // Slight curve so trajectory isn't a straight line
  const curveDeg = 3 + (hash % 6);
  v.heading = (((v.heading + SIM_DT * curveDeg) % 360) + 360) % 360;

  v.altitude = 45 + Math.sin(simTime * 0.2) * 2;
  v.baroAlt = v.altitude + jitter(0, 0.3);
  v.baroVs = jitter(0, 0.4);
  v.baroP = jitter(1013.2, 0.4);
  v.baroT = 24.5 + jitter(0, 0.1);

  if (gpsActive) {
    if (v.gpsSats < 14) v.gpsSats = Math.min(14, v.gpsSats + 1);
    v.gpsHdop = jitter(0.7, 0.05);
  } else {
    v.gpsSats = Math.max(0, v.gpsSats - 1);
    v.gpsHdop = 99;
  }

  v.roll = jitter(0, 0.6);
  v.pitch = jitter(0, 0.6);
  v.yaw = v.heading;
  v.thr = Math.max(0, 35 + Math.floor(jitter(0, 6)));
  v.vbat = Math.max(15, 22.4 - simTime * 0.0006);
  v.armed = true;

  v.gyroX = jitter(0, 0.4); v.gyroY = jitter(0, 0.4); v.gyroZ = jitter(0, 0.4);
  v.accelX = jitter(0, 0.04); v.accelY = jitter(0, 0.04); v.accelZ = 1.0 + jitter(0, 0.02);
  v.batI = jitter(8.4, 0.6);
  v.batUsed += (v.batI * SIM_DT) / 3.6;
}

function toFrame(v: SimVehicle): VehicleFrame {
  return {
    id: v.id,
    flight: v.flight,
    lat: v.lat, lon: v.lon,
    altitude: v.altitude, speed: v.speed, heading: v.heading,
    gpsActive: v.gpsActive, gpsSats: v.gpsSats, gpsHdop: v.gpsHdop,
    insActive: v.insActive,
    roll: v.roll, pitch: v.pitch, yaw: v.yaw,
    thr: v.thr, vbat: v.vbat, armed: v.armed,
    gyroX: v.gyroX, gyroY: v.gyroY, gyroZ: v.gyroZ,
    accelX: v.accelX, accelY: v.accelY, accelZ: v.accelZ,
    baroAlt: v.baroAlt, baroVs: v.baroVs, baroP: v.baroP, baroT: v.baroT,
    batI: v.batI, batUsed: v.batUsed,
  };
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
  }));
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
  // Emit one immediate frame so a freshly-connected client sees the new
  // vehicle's state without waiting for the first tick.
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
  v.batUsed = 0;

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
}

export function stopVehicle(id: string): void {
  const v = vehicles.find((x) => x.id === id);
  if (!v || !v.flight) return;
  v.flight = false;
  v.gpsActive = false;
  v.insActive = false;
  v.gpsSats = 0;
  pushLog("warn", "log.tag.link", "log.msg.disconnected", v.callsign);
  emitSnapshot();
  maybeStopTick();
}
