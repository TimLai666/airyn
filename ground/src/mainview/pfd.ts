/**
 * Primary Flight Display.
 *
 * Pure-SVG attitude indicator (artificial horizon) with side speed and
 * altitude tapes plus a heading band, modelled on QGroundControl's
 * QGCAttitudeHUD. Driven directly off VehicleFrame fields — no DOM mutations
 * outside the assigned slot, no Leaflet, no external deps.
 *
 * Build the widget once with `mountPfd(container)`, then call
 * `update(frame)` on every fleet tick. The element keeps a single root SVG
 * and only nudges transforms / text — no innerHTML thrash.
 */

import type { VehicleFrame } from "../shared/protocol";

export interface PfdHandle {
  update(frame: VehicleFrame | null): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag: string, attrs: Record<string, string | number> = {}, parent?: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

function tspan(parent: Element, text: string, attrs: Record<string, string | number> = {}): SVGTextElement {
  const t = el("text", attrs, parent) as SVGTextElement;
  t.textContent = text;
  return t;
}

function fmtSigned(n: number, decimals: number, width: number): string {
  const s = (n >= 0 ? "+" : "") + n.toFixed(decimals);
  return s.padStart(width, " ");
}

export function mountPfd(host: HTMLElement): PfdHandle {
  host.classList.add("pfd-host");
  host.innerHTML = "";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 130");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("pfd-svg");
  host.appendChild(svg);

  // ---- Defs: clip path for the attitude window ----
  const defs = el("defs", {}, svg);
  const clip = el("clipPath", { id: "pfd-attitude-clip" }, defs);
  el("rect", { x: 38, y: 16, width: 124, height: 84, rx: 4 }, clip);

  // Background
  el("rect", { x: 0, y: 0, width: 200, height: 130, class: "pfd-bg" }, svg);

  // ---- Attitude window ----
  const attWin = el("g", { "clip-path": "url(#pfd-attitude-clip)" }, svg);

  // Roll-rotated group
  const rollG = el("g", { transform: "rotate(0 100 58)", "data-pfd-roll": "" }, attWin);
  // Pitch-translated group inside roll
  const pitchG = el("g", { transform: "translate(0 0)", "data-pfd-pitch": "" }, rollG);

  // Sky / ground halves (very tall so pitch translation can scroll). Pitch
  // pixel scale: 4 px per degree.
  el("rect", { x: -200, y: -300, width: 600, height: 358, class: "pfd-sky" }, pitchG);
  el("rect", { x: -200, y: 58,   width: 600, height: 358, class: "pfd-ground" }, pitchG);
  el("line", { x1: -200, y1: 58, x2: 400, y2: 58, class: "pfd-horizon" }, pitchG);

  // Pitch ladder lines every 5 degrees, 4 px per deg.
  for (let p = -60; p <= 60; p += 5) {
    if (p === 0) continue;
    const y = 58 - p * 1.2; // 1.2 px per deg pitch — tighter than QGC because the box is small
    const long = (p % 10) === 0;
    const w = long ? 26 : 14;
    el("line", {
      x1: 100 - w / 2, y1: y, x2: 100 + w / 2, y2: y,
      class: "pfd-ladder " + (long ? "is-long" : "is-short"),
    }, pitchG);
    if (long) {
      tspan(pitchG, String(Math.abs(p)), {
        x: 100 - w / 2 - 2, y: y + 2,
        class: "pfd-ladder-text", "text-anchor": "end",
      });
      tspan(pitchG, String(Math.abs(p)), {
        x: 100 + w / 2 + 2, y: y + 2,
        class: "pfd-ladder-text", "text-anchor": "start",
      });
    }
  }

  // Roll arc with major ticks
  const arcG = el("g", { class: "pfd-roll-arc" }, svg);
  const cx = 100, cy = 58, r = 38;
  const arc = el("path", {
    d: `M ${cx - r * Math.sin((60 * Math.PI) / 180)} ${cy - r * Math.cos((60 * Math.PI) / 180)}
        A ${r} ${r} 0 0 1 ${cx + r * Math.sin((60 * Math.PI) / 180)} ${cy - r * Math.cos((60 * Math.PI) / 180)}`,
  }, arcG);
  arc.setAttribute("class", "pfd-roll-curve");
  for (const deg of [-60, -45, -30, -15, 0, 15, 30, 45, 60]) {
    const rad = (deg * Math.PI) / 180;
    const x1 = cx - r * Math.sin(rad);
    const y1 = cy - r * Math.cos(rad);
    const long = deg === 0 || Math.abs(deg) === 30 || Math.abs(deg) === 60;
    const r2 = long ? r - 4 : r - 2;
    const x2 = cx - r2 * Math.sin(rad);
    const y2 = cy - r2 * Math.cos(rad);
    el("line", { x1, y1, x2, y2, class: "pfd-roll-tick" + (long ? " is-long" : "") }, arcG);
  }
  // Roll pointer (a small triangle at top, rotates with roll)
  const rollPtrG = el("g", { transform: "rotate(0 100 58)", "data-pfd-roll-ptr": "" }, svg);
  el("polygon", { points: "100,17 96,24 104,24", class: "pfd-roll-pointer" }, rollPtrG);

  // Aircraft reference (the V mark — does NOT rotate)
  const ref = el("g", { class: "pfd-aircraft-ref" }, svg);
  el("path", { d: "M 80 58 L 90 58 L 100 64 L 110 58 L 120 58", class: "pfd-aircraft-wings" }, ref);
  el("rect", { x: 99, y: 56, width: 2, height: 4, class: "pfd-aircraft-dot" }, ref);

  // ---- Speed tape (left) ----
  const spdG = el("g", { class: "pfd-tape pfd-tape--speed" }, svg);
  el("rect", { x: 4, y: 16, width: 32, height: 84, class: "pfd-tape-bg" }, spdG);
  const spdScroll = el("g", { transform: "translate(0 0)", "data-pfd-speed-scroll": "" }, spdG);
  // Tick marks for speed (-50..200 m/s, 1 px per 0.5 m/s)
  for (let s = 0; s <= 60; s += 5) {
    const y = 58 - s * 2;
    el("line", { x1: 22, y1: y, x2: 32, y2: y, class: "pfd-tape-tick" + (s % 10 === 0 ? " is-long" : "") }, spdScroll);
    if (s % 10 === 0) {
      tspan(spdScroll, String(s), {
        x: 20, y: y + 2,
        class: "pfd-tape-text", "text-anchor": "end",
      });
    }
  }
  // Speed indicator box (current value)
  el("rect", { x: 0, y: 53, width: 36, height: 10, class: "pfd-tape-readout" }, spdG);
  const spdText = tspan(spdG, "0", {
    x: 18, y: 60.5,
    class: "pfd-tape-readout-text", "text-anchor": "middle",
  }) as SVGTextElement;

  // ---- Altitude tape (right) ----
  const altG = el("g", { class: "pfd-tape pfd-tape--alt" }, svg);
  el("rect", { x: 164, y: 16, width: 32, height: 84, class: "pfd-tape-bg" }, altG);
  const altScroll = el("g", { transform: "translate(0 0)", "data-pfd-alt-scroll": "" }, altG);
  for (let a = 0; a <= 200; a += 5) {
    const y = 58 - a * 1.2;
    el("line", { x1: 164, y1: y, x2: 174, y2: y, class: "pfd-tape-tick" + (a % 10 === 0 ? " is-long" : "") }, altScroll);
    if (a % 10 === 0) {
      tspan(altScroll, String(a), {
        x: 176, y: y + 2,
        class: "pfd-tape-text", "text-anchor": "start",
      });
    }
  }
  el("rect", { x: 164, y: 53, width: 36, height: 10, class: "pfd-tape-readout" }, altG);
  const altText = tspan(altG, "0", {
    x: 182, y: 60.5,
    class: "pfd-tape-readout-text", "text-anchor": "middle",
  }) as SVGTextElement;

  // VS arrow next to alt tape
  const vsG = el("g", { class: "pfd-vs", transform: "translate(170 58)" }, svg);
  const vsArrow = el("polygon", { points: "0,0 4,-3 4,3", class: "pfd-vs-arrow", "data-pfd-vs": "" }, vsG);

  // ---- Heading band (top) ----
  const hdgG = el("g", { class: "pfd-heading" }, svg);
  el("rect", { x: 38, y: 4, width: 124, height: 10, class: "pfd-heading-bg" }, hdgG);
  const hdgClip = el("clipPath", { id: "pfd-heading-clip" }, defs);
  el("rect", { x: 38, y: 4, width: 124, height: 10 }, hdgClip);
  const hdgScroll = el("g", { transform: "translate(0 0)", "data-pfd-hdg-scroll": "", "clip-path": "url(#pfd-heading-clip)" }, hdgG);
  // 360 deg ticks every 5°
  for (let h = -180; h <= 540; h += 5) {
    const x = 100 + h * 0.6;
    const long = h % 30 === 0;
    el("line", {
      x1: x, y1: 4 + (long ? 0 : 4), x2: x, y2: 4 + (long ? 6 : 6),
      class: "pfd-tape-tick" + (long ? " is-long" : ""),
    }, hdgScroll);
    if (long) {
      const norm = ((h % 360) + 360) % 360;
      const lbl = norm === 0 ? "N" : norm === 90 ? "E" : norm === 180 ? "S" : norm === 270 ? "W" : String(norm);
      tspan(hdgScroll, lbl, {
        x, y: 12,
        class: "pfd-heading-text", "text-anchor": "middle",
      });
    }
  }
  // Center pointer
  el("polygon", { points: "100,14 97,18 103,18", class: "pfd-heading-pointer" }, hdgG);
  // Heading readout box
  el("rect", { x: 88, y: 14, width: 24, height: 8, class: "pfd-tape-readout" }, hdgG);
  const hdgText = tspan(hdgG, "000", {
    x: 100, y: 20,
    class: "pfd-tape-readout-text", "text-anchor": "middle",
  }) as SVGTextElement;

  // ---- Mode/safety chip below ----
  const stateG = el("g", { class: "pfd-state" }, svg);
  el("rect", { x: 38, y: 104, width: 124, height: 18, class: "pfd-state-bg" }, stateG);
  const modeText = tspan(stateG, "STANDBY", {
    x: 44, y: 116,
    class: "pfd-state-text", "text-anchor": "start",
  }) as SVGTextElement;
  const safetyText = tspan(stateG, "OFFLINE", {
    x: 156, y: 116,
    class: "pfd-state-text is-right", "text-anchor": "end",
  }) as SVGTextElement;

  // Stash refs we need to mutate on update.
  const refs = {
    rollG, pitchG, rollPtrG,
    spdScroll, spdText,
    altScroll, altText, vsArrow,
    hdgScroll, hdgText,
    modeText, safetyText, svg,
  };

  function update(frame: VehicleFrame | null): void {
    if (!frame) {
      svg.classList.add("is-stale");
      refs.modeText.textContent = "—";
      refs.safetyText.textContent = "OFFLINE";
      refs.spdText.textContent = "—";
      refs.altText.textContent = "—";
      refs.hdgText.textContent = "---";
      return;
    }
    svg.classList.toggle("is-stale", !frame.linkActive);
    svg.classList.toggle("is-armed", frame.armed);
    svg.classList.toggle("is-failsafe", frame.safetyState === "failsafe");

    // Roll/pitch: rotate the inside group by -roll, translate by pitch.
    refs.rollG.setAttribute("transform", `rotate(${-frame.roll} 100 58)`);
    refs.rollPtrG.setAttribute("transform", `rotate(${-frame.roll} 100 58)`);
    refs.pitchG.setAttribute("transform", `translate(0 ${frame.pitch * 1.2})`);

    // Speed scroll: place current speed at center y=58.
    refs.spdScroll.setAttribute("transform", `translate(0 ${frame.speed * 2})`);
    refs.spdText.textContent = frame.speed.toFixed(1);

    // Alt scroll
    refs.altScroll.setAttribute("transform", `translate(0 ${frame.altitude * 1.2})`);
    refs.altText.textContent = frame.altitude.toFixed(0);

    // VS arrow
    const vsClamped = Math.max(-5, Math.min(5, frame.baroVs));
    refs.vsArrow.setAttribute("transform", `translate(0 ${-vsClamped * 5})`);
    refs.vsArrow.classList.toggle("is-up", vsClamped > 0.2);
    refs.vsArrow.classList.toggle("is-down", vsClamped < -0.2);

    // Heading: 0.6 px per deg → translate so current heading is at 100.
    refs.hdgScroll.setAttribute("transform", `translate(${-frame.heading * 0.6} 0)`);
    const hdgInt = Math.round(frame.heading) % 360;
    refs.hdgText.textContent = hdgInt.toString().padStart(3, "0");

    refs.modeText.textContent = frame.mode.toUpperCase();
    refs.safetyText.textContent = frame.safetyState.toUpperCase();

    // Hide tapes if no telemetry value was meaningful (frozen frame keeps last).
    void fmtSigned;
  }

  return { update };
}
