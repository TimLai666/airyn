/**
 * Threshold-based warning colors.
 *
 * Drives the small severity chips next to telemetry readouts:
 *   - "ok"   → green   (safe)
 *   - "warn" → amber   (heads-up)
 *   - "fail" → red     (unsafe — operator must address)
 *
 * Mirrors QGC instrument-panel behaviour: no popup, no scolding, just a
 * visible color that changes with the value.
 */

export type Severity = "ok" | "warn" | "fail" | "off";

export function batterySeverity(vbat: number, lowVolt = 18.5): Severity {
  if (vbat <= 0) return "off";
  if (vbat < lowVolt - 0.5) return "fail";
  if (vbat < lowVolt) return "warn";
  return "ok";
}

export function batteryRemainingSeverity(used: number, capacity = 5200): Severity {
  if (capacity <= 0) return "off";
  const remainingPct = 1 - used / capacity;
  if (remainingPct < 0.1) return "fail";
  if (remainingPct < 0.25) return "warn";
  return "ok";
}

export function gpsSeverity(active: boolean, sats: number, hdop: number): Severity {
  if (!active) return "fail";
  if (sats < 6 || hdop > 3) return "fail";
  if (sats < 8 || hdop > 1.5) return "warn";
  return "ok";
}

export function rssiSeverity(rssiDbm: number | null): Severity {
  if (rssiDbm == null) return "off";
  if (rssiDbm < -95) return "fail";
  if (rssiDbm < -80) return "warn";
  return "ok";
}

export function linkQualitySeverity(lq: number | null): Severity {
  if (lq == null) return "off";
  if (lq < 0.5) return "fail";
  if (lq < 0.8) return "warn";
  return "ok";
}

export function distanceSeverity(distM: number | null, fenceRadius = 250): Severity {
  if (distM == null) return "off";
  if (distM > fenceRadius) return "fail";
  if (distM > fenceRadius * 0.85) return "warn";
  return "ok";
}

export function fenceSeverity(state: "inside" | "breach-soft" | "breach-hard" | "none"): Severity {
  if (state === "breach-hard") return "fail";
  if (state === "breach-soft") return "warn";
  if (state === "inside") return "ok";
  return "off";
}

/** Apply severity class to an element by data attribute, idempotently. */
export function applySeverity(el: Element | null, sev: Severity): void {
  if (!el) return;
  if (el.getAttribute("data-sev") === sev) return;
  el.setAttribute("data-sev", sev);
}

/** Format seconds as `MM:SS` or `HH:MM` for ttg displays. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `0:${s.toString().padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}:${r.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${(m % 60).toString().padStart(2, "0")}`;
}

export function formatDistance(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
