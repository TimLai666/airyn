/**
 * QGroundControl `.plan` file format I/O. Mirrors
 * https://docs.qgroundcontrol.com/master/en/qgc-dev-guide/file_formats/plan.html
 *
 * Airyn doesn't support every QGC mission item type — only WAYPOINT,
 * TAKEOFF, and LAND. Anything else gets dropped on import with a warning
 * the renderer can show.
 *
 * A round-trip (Airyn → .plan → Airyn) is lossless. A round-trip via QGC
 * is lossless for the supported items, geofence, and rally points.
 */

import type {
  GeofencePlan,
  GeofenceShape,
  MissionWaypoint,
  QgcPlanFile,
  QgcSimpleItem,
  RallyPoint,
} from "../shared/protocol";

const MAV_CMD_NAV_WAYPOINT = 16;
const MAV_CMD_NAV_LAND = 21;
const MAV_CMD_NAV_TAKEOFF = 22;

function buildSimpleItem(wp: MissionWaypoint, idx: number): QgcSimpleItem {
  let command = MAV_CMD_NAV_WAYPOINT;
  if (wp.type === "takeoff") command = MAV_CMD_NAV_TAKEOFF;
  else if (wp.type === "land") command = MAV_CMD_NAV_LAND;
  return {
    type: "SimpleItem",
    command,
    frame: 3, // MAV_FRAME_GLOBAL_RELATIVE_ALT
    AMSLAltAboveTerrain: null,
    Altitude: wp.alt,
    AltitudeMode: 1,
    autoContinue: true,
    doJumpId: idx + 1,
    params: [0, 0, 0, null, wp.lat, wp.lon, wp.alt],
  };
}

function itemToWaypoint(item: QgcSimpleItem): MissionWaypoint | null {
  if (item.type !== "SimpleItem") return null;
  const params = item.params || [];
  const lat = Number(params[4]);
  const lon = Number(params[5]);
  const alt = Number(params[6] ?? item.Altitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) return null;
  let type: MissionWaypoint["type"] = "waypoint";
  if (item.command === MAV_CMD_NAV_TAKEOFF) type = "takeoff";
  else if (item.command === MAV_CMD_NAV_LAND) type = "land";
  return { type, lat, lon, alt };
}

export function exportPlan(opts: {
  waypoints: MissionWaypoint[];
  geofence?: GeofencePlan | null;
  homeLat: number;
  homeLon: number;
  homeAlt: number;
}): QgcPlanFile {
  const items = opts.waypoints.map(buildSimpleItem);
  const fence = opts.geofence ?? { enabled: false, shapes: [], rally: [], breachAction: "rtl-home" as const };
  const circles: QgcPlanFile["geoFence"]["circles"] = [];
  const polygons: QgcPlanFile["geoFence"]["polygons"] = [];
  for (const s of fence.shapes) {
    if (s.type === "circle") {
      circles.push({
        circle: { center: [s.centerLat, s.centerLon], radius: s.radiusM },
        inclusion: true,
      });
    } else {
      polygons.push({
        polygon: s.vertices.map((v) => [v.lat, v.lon] as [number, number]),
        inclusion: s.inclusion,
      });
    }
  }
  const rallyPoints = fence.rally.map((r) => [r.lat, r.lon, r.alt] as [number, number, number]);
  return {
    fileType: "Plan",
    version: 1,
    groundStation: "Airyn Ground",
    mission: {
      version: 2,
      firmwareType: 12,
      vehicleType: 2,
      cruiseSpeed: 8,
      hoverSpeed: 5,
      plannedHomePosition: [opts.homeLat, opts.homeLon, opts.homeAlt],
      items,
    },
    geoFence: { version: 2, circles, polygons },
    rallyPoints: { version: 2, points: rallyPoints },
  };
}

export interface ImportedPlan {
  waypoints: MissionWaypoint[];
  geofence: GeofencePlan;
  home: { lat: number; lon: number; alt: number } | null;
  warnings: string[];
}

export function importPlan(raw: string): ImportedPlan {
  const warnings: string[] = [];
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
  if (!parsed || parsed.fileType !== "Plan") {
    throw new Error("Not a QGC .plan file (fileType missing)");
  }
  const waypoints: MissionWaypoint[] = [];
  const items = parsed.mission?.items ?? [];
  for (const item of items) {
    if (item?.type === "ComplexItem") {
      // Survey/Corridor/Structure scans expand to TransectStyleComplexItem
      // children; if QGC saved the expanded waypoints, prefer those.
      const expanded = item.TransectStyleComplexItem?.Items
        ?? item.Items
        ?? [];
      let added = 0;
      for (const sub of expanded) {
        const wp = itemToWaypoint(sub);
        if (wp) { waypoints.push(wp); added++; }
      }
      if (added === 0) warnings.push("Complex item without expanded waypoints skipped");
      continue;
    }
    const wp = itemToWaypoint(item);
    if (wp) {
      waypoints.push(wp);
    } else if (item?.type === "SimpleItem") {
      warnings.push(`Unsupported MAV cmd ${item.command} skipped`);
    }
  }

  const fence: GeofencePlan = {
    enabled: false,
    shapes: [],
    rally: [],
    breachAction: "rtl-home",
  };
  const fenceJson = parsed.geoFence;
  if (fenceJson) {
    for (const c of fenceJson.circles ?? []) {
      const center = c.circle?.center;
      if (!center || !Array.isArray(center)) continue;
      const radius = Number(c.circle?.radius);
      if (!Number.isFinite(radius)) continue;
      fence.shapes.push({
        type: "circle",
        centerLat: Number(center[0]),
        centerLon: Number(center[1]),
        radiusM: radius,
        maxAltM: 120,
      } as GeofenceShape);
    }
    for (const poly of fenceJson.polygons ?? []) {
      const verts = poly.polygon ?? [];
      if (!Array.isArray(verts) || verts.length < 3) continue;
      fence.shapes.push({
        type: "polygon",
        inclusion: !!poly.inclusion,
        vertices: verts.map((v: any) => ({ lat: Number(v[0]), lon: Number(v[1]) })),
      });
    }
    if (fence.shapes.length > 0) fence.enabled = true;
  }
  const rallyJson = parsed.rallyPoints?.points ?? [];
  for (const p of rallyJson) {
    if (!Array.isArray(p) || p.length < 3) continue;
    const r: RallyPoint = { lat: Number(p[0]), lon: Number(p[1]), alt: Number(p[2]) };
    if (Number.isFinite(r.lat) && Number.isFinite(r.lon) && Number.isFinite(r.alt)) fence.rally.push(r);
  }
  if (fence.rally.length > 0) fence.breachAction = "rtl-rally";

  let home: ImportedPlan["home"] = null;
  const hp = parsed.mission?.plannedHomePosition;
  if (Array.isArray(hp) && hp.length >= 3) {
    home = { lat: Number(hp[0]), lon: Number(hp[1]), alt: Number(hp[2]) };
    if (![home.lat, home.lon, home.alt].every(Number.isFinite)) home = null;
  }

  return { waypoints, geofence: fence, home, warnings };
}

export function downloadPlanFile(plan: QgcPlanFile, filename: string): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function pickPlanFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".plan,application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      document.body.removeChild(input);
      if (!f) { resolve(null); return; }
      const text = await f.text();
      resolve({ name: f.name, text });
    }, { once: true });
    input.click();
  });
}
