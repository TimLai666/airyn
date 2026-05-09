/**
 * MAVLink-style live inspector.
 *
 * Tracks the rolling rate (Hz) of every telemetry field we receive from
 * the bridge and lets the operator pin one to a tiny sparkline. Modeled
 * on QGroundControl's Analyze → MAVLink Inspector view.
 *
 * Field names are the keys of VehicleFrame plus `roll`, `pitch`, etc.
 * The renderer uses `ingestFrame` once per fleet message.
 */

import type { VehicleFrame } from "../shared/protocol";

export interface FieldStat {
  name: string;
  lastValue: number;
  rateHz: number;            // updates per second over a 2 s window
  min: number;
  max: number;
  history: number[];         // last 120 samples
}

const HISTORY_LEN = 120;
const RATE_WINDOW_S = 2;

interface InternalState {
  fields: Map<string, FieldStat>;
  recentTs: Map<string, number[]>;     // timestamps within rate window
}

export interface InspectorHandle {
  ingestFrame(vehicleId: string, frame: VehicleFrame, t: number): void;
  fields(vehicleId: string): FieldStat[];
  reset(): void;
}

const NUMERIC_KEYS: (keyof VehicleFrame)[] = [
  "lat", "lon", "altitude", "speed", "heading",
  "gpsSats", "gpsHdop",
  "roll", "pitch", "yaw",
  "thr", "vbat",
  "gyroX", "gyroY", "gyroZ",
  "accelX", "accelY", "accelZ",
  "baroAlt", "baroVs", "baroP", "baroT",
  "batI", "batUsed",
];

export function createInspector(): InspectorHandle {
  const states = new Map<string, InternalState>();

  function stateFor(id: string): InternalState {
    let s = states.get(id);
    if (!s) {
      s = { fields: new Map(), recentTs: new Map() };
      states.set(id, s);
    }
    return s;
  }

  function ingestFrame(vehicleId: string, frame: VehicleFrame, t: number): void {
    const s = stateFor(vehicleId);
    for (const key of NUMERIC_KEYS) {
      const raw = frame[key];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      let stat = s.fields.get(key);
      if (!stat) {
        stat = { name: key, lastValue: raw, rateHz: 0, min: raw, max: raw, history: [] };
        s.fields.set(key, stat);
      }
      stat.lastValue = raw;
      if (raw < stat.min) stat.min = raw;
      if (raw > stat.max) stat.max = raw;
      stat.history.push(raw);
      if (stat.history.length > HISTORY_LEN) stat.history.shift();
      let arr = s.recentTs.get(key);
      if (!arr) { arr = []; s.recentTs.set(key, arr); }
      arr.push(t);
      const cutoff = t - RATE_WINDOW_S;
      while (arr.length > 0 && arr[0] < cutoff) arr.shift();
      stat.rateHz = arr.length / RATE_WINDOW_S;
    }
  }

  function fields(vehicleId: string): FieldStat[] {
    const s = states.get(vehicleId);
    if (!s) return [];
    const out: FieldStat[] = [];
    for (const stat of s.fields.values()) out.push(stat);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function reset(): void {
    states.clear();
  }

  return { ingestFrame, fields, reset };
}

/**
 * Render a sparkline path string (SVG `d`) for a numeric history. Width
 * and height are in viewBox units; the caller controls actual size with
 * CSS.
 */
export function sparklinePath(values: number[], width = 100, height = 24): string {
  if (values.length < 2) return "";
  let min = values[0], max = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const step = width / (values.length - 1);
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const x = i * step;
    const y = height - ((values[i] - min) / range) * height;
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }
  return d.trim();
}
