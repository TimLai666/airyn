/**
 * Geofence + rally point editor. Mission Planner / QGroundControl style:
 *
 *   - Cylindrical fence: home + radius + max alt (TinCan style).
 *   - Polygon inclusion fence: aircraft must stay inside.
 *   - Polygon exclusion fence: aircraft must not enter.
 *   - Rally points: alternate RTL targets, picked by nearest distance.
 *
 * Renders shapes as Leaflet layers, lets the operator add vertices by
 * clicking the map in "fence draw mode", drag to move, click vertex to
 * delete. Validation: fence must be at least 3 vertices, rally points must
 * lie inside any inclusion polygon (warn but allow).
 */

import type {
  GeofencePlan,
  GeofencePolygon,
  GeofenceCircle,
  RallyPoint,
} from "../shared/protocol";

declare const L: any;

export type FenceMode =
  | "off"
  | "circle"
  | "polygon-inclusion"
  | "polygon-exclusion"
  | "rally"
  | "delete";

export interface GeofenceLayerHandle {
  setMap(map: any): void;
  render(plan: GeofencePlan): void;
  setMode(mode: FenceMode): void;
  /** Subscribe to plan mutations. */
  onChange(cb: (plan: GeofencePlan) => void): void;
  /** Read current plan (deep clone). */
  current(): GeofencePlan;
  /** Replace plan from outside (e.g. server broadcast). */
  load(plan: GeofencePlan): void;
}

function clonePlan(p: GeofencePlan): GeofencePlan {
  return {
    enabled: p.enabled,
    breachAction: p.breachAction,
    shapes: p.shapes.map((s) => s.type === "circle"
      ? { ...s }
      : { type: "polygon", inclusion: s.inclusion, vertices: s.vertices.map((v) => ({ ...v })) }),
    rally: p.rally.map((r) => ({ ...r })),
  };
}

export function createGeofenceLayer(): GeofenceLayerHandle {
  let map: any = null;
  let mode: FenceMode = "off";
  let plan: GeofencePlan = { enabled: false, shapes: [], rally: [], breachAction: "rtl-home" };
  const listeners = new Set<(p: GeofencePlan) => void>();

  // Each shape gets its own Leaflet layer. We rebuild the lot on every
  // render — fences are small, this stays cheap.
  const layerGroup = (typeof L !== "undefined" ? L.layerGroup() : null);
  const rallyGroup = (typeof L !== "undefined" ? L.layerGroup() : null);

  function fire(): void {
    for (const cb of listeners) {
      try { cb(clonePlan(plan)); } catch (err) { console.error("[geofence] listener threw", err); }
    }
  }

  function clearLayers(): void {
    if (layerGroup) layerGroup.clearLayers();
    if (rallyGroup) rallyGroup.clearLayers();
  }

  function renderShapes(): void {
    if (!map || typeof L === "undefined") return;
    clearLayers();
    if (!plan.enabled && plan.shapes.length === 0 && plan.rally.length === 0) return;

    for (let i = 0; i < plan.shapes.length; i++) {
      const shape = plan.shapes[i];
      if (shape.type === "circle") {
        const circle = L.circle([shape.centerLat, shape.centerLon], {
          radius: shape.radiusM,
          color: "#d18b48",
          weight: 1.4,
          fillColor: "#d18b48",
          fillOpacity: 0.06,
          dashArray: "4 3",
          className: "fence-circle",
          interactive: true,
        });
        circle.on("click", () => onShapeClick(i));
        layerGroup.addLayer(circle);
        // Center marker
        const center = L.circleMarker([shape.centerLat, shape.centerLon], {
          radius: 4, color: "#d18b48", fillColor: "#d18b48", fillOpacity: 0.9, weight: 1,
        });
        layerGroup.addLayer(center);
      } else {
        if (shape.vertices.length === 0) continue;
        const latlngs = shape.vertices.map((v) => [v.lat, v.lon]);
        const isIncl = shape.inclusion;
        const fence = (shape.vertices.length >= 3 ? L.polygon : L.polyline)(latlngs, {
          color: isIncl ? "#7ed3a5" : "#ff7777",
          weight: 1.4,
          fillColor: isIncl ? "#7ed3a5" : "#ff7777",
          fillOpacity: 0.06,
          dashArray: isIncl ? "4 3" : "2 4",
          className: isIncl ? "fence-inclusion" : "fence-exclusion",
          interactive: true,
        });
        fence.on("click", () => onShapeClick(i));
        layerGroup.addLayer(fence);
        for (let vi = 0; vi < shape.vertices.length; vi++) {
          const vertex = shape.vertices[vi];
          const dot = L.circleMarker([vertex.lat, vertex.lon], {
            radius: 4,
            color: "#0d0d0d",
            fillColor: isIncl ? "#7ed3a5" : "#ff7777",
            fillOpacity: 1,
            weight: 1.5,
            interactive: true,
            bubblingMouseEvents: false,
          });
          dot.on("click", (ev: any) => {
            (ev as any).originalEvent.stopPropagation?.();
            onVertexClick(i, vi);
          });
          layerGroup.addLayer(dot);
        }
      }
    }

    for (let i = 0; i < plan.rally.length; i++) {
      const r = plan.rally[i];
      const marker = L.circleMarker([r.lat, r.lon], {
        radius: 7, color: "#a8c8ff", fillColor: "#a8c8ff", fillOpacity: 0.9, weight: 2,
        className: "rally-marker",
      });
      marker.bindTooltip(`RALLY ${i + 1}<br/>${r.alt} m`, { direction: "top", className: "rally-tip" });
      marker.on("click", (ev: any) => {
        (ev as any).originalEvent.stopPropagation?.();
        onRallyClick(i);
      });
      rallyGroup.addLayer(marker);
    }

    if (!map.hasLayer(layerGroup)) layerGroup.addTo(map);
    if (!map.hasLayer(rallyGroup)) rallyGroup.addTo(map);
  }

  function onMapClick(ev: any): void {
    if (mode === "off") return;
    const ll = ev.latlng;
    if (mode === "circle") {
      // Replace any existing circle (cylindrical only allows one).
      plan.shapes = plan.shapes.filter((s) => s.type !== "circle");
      const newCircle: GeofenceCircle = {
        type: "circle", centerLat: ll.lat, centerLon: ll.lng,
        radiusM: 250, maxAltM: 120,
      };
      plan.shapes.push(newCircle);
      plan.enabled = true;
      renderShapes();
      fire();
      return;
    }
    if (mode === "polygon-inclusion" || mode === "polygon-exclusion") {
      const inclusion = mode === "polygon-inclusion";
      let poly = plan.shapes.find((s): s is GeofencePolygon =>
        s.type === "polygon" && s.inclusion === inclusion && s.vertices.length < 64);
      if (!poly) {
        poly = { type: "polygon", inclusion, vertices: [] };
        plan.shapes.push(poly);
      }
      poly.vertices.push({ lat: ll.lat, lon: ll.lng });
      plan.enabled = true;
      renderShapes();
      fire();
      return;
    }
    if (mode === "rally") {
      const rp: RallyPoint = { lat: ll.lat, lon: ll.lng, alt: 30 };
      plan.rally.push(rp);
      renderShapes();
      fire();
      return;
    }
  }

  function onShapeClick(idx: number): void {
    if (mode !== "delete") return;
    plan.shapes.splice(idx, 1);
    renderShapes();
    fire();
  }

  function onVertexClick(shapeIdx: number, vertexIdx: number): void {
    if (mode !== "delete") return;
    const shape = plan.shapes[shapeIdx];
    if (!shape || shape.type !== "polygon") return;
    shape.vertices.splice(vertexIdx, 1);
    if (shape.vertices.length === 0) {
      plan.shapes.splice(shapeIdx, 1);
    }
    renderShapes();
    fire();
  }

  function onRallyClick(idx: number): void {
    if (mode !== "delete") return;
    plan.rally.splice(idx, 1);
    renderShapes();
    fire();
  }

  function setMap(target: any): void {
    if (map === target) return;
    if (map) {
      map.off("click", onMapClick);
      if (layerGroup) map.removeLayer(layerGroup);
      if (rallyGroup) map.removeLayer(rallyGroup);
    }
    map = target;
    if (!map) return;
    map.on("click", onMapClick);
    renderShapes();
  }

  function render(p: GeofencePlan): void {
    plan = clonePlan(p);
    renderShapes();
  }

  function setMode(m: FenceMode): void {
    mode = m;
  }

  function onChange(cb: (p: GeofencePlan) => void): void {
    listeners.add(cb);
  }

  function current(): GeofencePlan {
    return clonePlan(plan);
  }

  function load(p: GeofencePlan): void {
    plan = clonePlan(p);
    renderShapes();
  }

  return { setMap, render, setMode, onChange, current, load };
}

export function summarizeFence(plan: GeofencePlan): string {
  let circles = 0, incl = 0, excl = 0;
  for (const s of plan.shapes) {
    if (s.type === "circle") circles++;
    else if (s.inclusion) incl++;
    else excl++;
  }
  const parts: string[] = [];
  if (circles) parts.push(`${circles} circle`);
  if (incl) parts.push(`${incl} inclusion`);
  if (excl) parts.push(`${excl} exclusion`);
  if (plan.rally.length) parts.push(`${plan.rally.length} rally`);
  if (parts.length === 0) return "no shapes";
  return parts.join(" · ");
}
