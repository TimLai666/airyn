/**
 * Survey / Corridor pattern generators. Mirrors QGroundControl's Pattern
 * Tool: take a polygon or polyline plus a few parameters and emit ordered
 * MissionWaypoints on a serpentine grid.
 *
 *   - Survey: lawnmower over a polygon. Inputs: polygon, line spacing,
 *     angle in degrees, altitude.
 *   - Corridor: poly-line with parallel offset legs. Inputs: polyline,
 *     width, line spacing, altitude.
 *
 * The geometry is local-flat (equirectangular) which is fine inside a few
 * km, the typical Airyn flight envelope. For longer surveys we'd promote
 * to UTM, but that's out of scope.
 */

import type { MissionWaypoint } from "../shared/protocol";

interface LatLon { lat: number; lon: number }

const M_PER_DEG_LAT = 111319.49;

function metersPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function toLocal(origin: LatLon, p: LatLon): { x: number; y: number } {
  const mx = metersPerDegLon(origin.lat);
  return {
    x: (p.lon - origin.lon) * mx,
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

function fromLocal(origin: LatLon, p: { x: number; y: number }): LatLon {
  const mx = metersPerDegLon(origin.lat);
  return {
    lat: origin.lat + p.y / M_PER_DEG_LAT,
    lon: origin.lon + p.x / mx,
  };
}

function rotate(p: { x: number; y: number }, deg: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

function pointInPolygonLocal(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y))
      && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentIntersectionsAt(yScan: number, poly: { x: number; y: number }[]): number[] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > yScan) === (b.y > yScan)) continue;
    const t = (yScan - a.y) / (b.y - a.y + 1e-12);
    xs.push(a.x + t * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  return xs;
}

export interface SurveyOptions {
  polygon: LatLon[];
  spacingM: number;
  angleDeg: number;
  altitudeM: number;
}

export function generateSurveyMission(opts: SurveyOptions): MissionWaypoint[] {
  if (opts.polygon.length < 3) return [];
  const origin = opts.polygon[0];
  // Project to local meters, rotate so scan lines run along x.
  const poly = opts.polygon.map((p) => rotate(toLocal(origin, p), -opts.angleDeg));
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const p of poly) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  if (!Number.isFinite(minY) || maxY - minY < opts.spacingM) return [];

  const spacing = Math.max(1, opts.spacingM);
  const waypoints: MissionWaypoint[] = [];
  let direction = 1;
  for (let y = minY + spacing / 2; y <= maxY; y += spacing) {
    const xs = segmentIntersectionsAt(y, poly);
    if (xs.length < 2) continue;
    // Interleave: take first and last to span the polygon at this scan.
    const xa = xs[0];
    const xb = xs[xs.length - 1];
    const start = direction > 0 ? xa : xb;
    const end = direction > 0 ? xb : xa;
    const startLocal = rotate({ x: start, y }, opts.angleDeg);
    const endLocal = rotate({ x: end, y }, opts.angleDeg);
    const startLL = fromLocal(origin, startLocal);
    const endLL = fromLocal(origin, endLocal);
    waypoints.push({ type: "waypoint", lat: startLL.lat, lon: startLL.lon, alt: opts.altitudeM });
    waypoints.push({ type: "waypoint", lat: endLL.lat, lon: endLL.lon, alt: opts.altitudeM });
    direction *= -1;
  }
  return waypoints;
}

export interface CorridorOptions {
  centerline: LatLon[];
  widthM: number;
  spacingM: number;
  altitudeM: number;
}

export function generateCorridorMission(opts: CorridorOptions): MissionWaypoint[] {
  if (opts.centerline.length < 2) return [];
  const origin = opts.centerline[0];
  const local = opts.centerline.map((p) => toLocal(origin, p));
  const lanes = Math.max(1, Math.floor(opts.widthM / Math.max(1, opts.spacingM)));
  const offsets: number[] = [];
  const half = (lanes - 1) / 2;
  for (let i = 0; i < lanes; i++) {
    offsets.push((i - half) * opts.spacingM);
  }
  const waypoints: MissionWaypoint[] = [];
  for (let lane = 0; lane < offsets.length; lane++) {
    const off = offsets[lane];
    const reverse = lane % 2 === 1;
    const path = reverse ? local.slice().reverse() : local.slice();
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const tangent = i < path.length - 1 ? path[i + 1] : path[i - 1];
      const dx = tangent.x - a.x;
      const dy = tangent.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perp left of tangent: (-dy, dx)/len * off
      const px = -(dy / len) * off;
      const py = (dx / len) * off;
      const ll = fromLocal(origin, { x: a.x + px, y: a.y + py });
      waypoints.push({ type: "waypoint", lat: ll.lat, lon: ll.lon, alt: opts.altitudeM });
    }
  }
  return waypoints;
}

export function survey3DEstimate(plan: MissionWaypoint[], speedMps = 8): { distanceM: number; etaSec: number } {
  let dist = 0;
  for (let i = 1; i < plan.length; i++) {
    const a = plan[i - 1], b = plan[i];
    const dxLat = (b.lat - a.lat) * M_PER_DEG_LAT;
    const dxLon = (b.lon - a.lon) * metersPerDegLon(a.lat);
    dist += Math.hypot(dxLat, dxLon);
  }
  void pointInPolygonLocal; // keep unused export from being shaken away in dev bundles
  return { distanceM: dist, etaSec: speedMps > 0 ? dist / speedMps : 0 };
}
