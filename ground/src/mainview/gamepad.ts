/**
 * Gamepad / virtual joystick driver.
 *
 * Reads the Web Gamepad API at 25 Hz, maps the standard layout (Xbox /
 * DualShock) to roll/pitch/yaw/throttle, and forwards the override to the
 * bridge. Falls back to keyboard sticks when no gamepad is present:
 *   W/S → throttle, A/D → yaw, arrow keys → roll/pitch, Q → engage,
 *   ESC → release.
 *
 * Also drives a small virtual-stick visualisation so the operator can see
 * which axis is moving without staring at the controller.
 */

import type { ManualOverride } from "../shared/protocol";

export interface GamepadHandle {
  start(): void;
  stop(): void;
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  isActive(): boolean;
  setOnOverride(cb: (o: ManualOverride) => void): void;
  setOnVisualState(cb: (state: { connected: boolean; engaged: boolean; axes: ManualOverride }) => void): void;
}

const DEAD = 0.08;
const RATE_HZ = 25;

function applyDeadband(v: number): number {
  if (Math.abs(v) < DEAD) return 0;
  return Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD);
}

export function createGamepad(): GamepadHandle {
  let enabled = false;
  let engaged = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let onOverride: ((o: ManualOverride) => void) | null = null;
  let onVisual: ((s: { connected: boolean; engaged: boolean; axes: ManualOverride }) => void) | null = null;

  const keys = new Set<string>();

  function pollGamepad(): { connected: boolean; axes: ManualOverride } {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) {
      // Keyboard fallback.
      const roll = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
      const pitch = (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0);
      const yaw = (keys.has("d") || keys.has("D") ? 1 : 0) - (keys.has("a") || keys.has("A") ? 1 : 0);
      const thrTotal = Math.max(0, Math.min(1,
        (keys.has("w") || keys.has("W") ? 1 : 0) * 1 -
        (keys.has("s") || keys.has("S") ? 1 : 0) * 0.5 + 0.5));
      return {
        connected: false,
        axes: { roll, pitch, yaw, throttle: thrTotal, active: engaged },
      };
    }
    const a = pad.axes;
    const roll = applyDeadband(a[0] ?? 0);
    const pitch = applyDeadband(-(a[1] ?? 0));
    const yaw = applyDeadband(a[2] ?? 0);
    // Throttle: standard layout puts throttle on right stick Y; many sticks
    // expose it as -1..+1 with up = -1. Fold to 0..1.
    const throttleAxis = -(a[3] ?? 0);
    const throttle = Math.max(0, Math.min(1, (throttleAxis + 1) / 2));
    // Trigger buttons (PS/Xbox L2/R2) override engage if held > 0.5.
    const triggerEngage = pad.buttons[7]?.value ?? 0;
    if (triggerEngage > 0.7) engaged = true;
    if (pad.buttons[6]?.value > 0.7) engaged = false;
    return {
      connected: true,
      axes: { roll, pitch, yaw, throttle, active: engaged },
    };
  }

  function tick(): void {
    if (!enabled) return;
    const sample = pollGamepad();
    onVisual?.({ connected: sample.connected, engaged, axes: sample.axes });
    if (onOverride) onOverride(sample.axes);
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (!enabled) return;
    if (ev.key === "Escape") { engaged = false; }
    if (ev.key.toLowerCase() === "q") { engaged = !engaged; }
    keys.add(ev.key);
  }
  function onKeyUp(ev: KeyboardEvent): void {
    keys.delete(ev.key);
  }

  function start(): void {
    if (timer) return;
    enabled = true;
    timer = setInterval(tick, 1000 / RATE_HZ);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  }
  function stop(): void {
    enabled = false;
    engaged = false;
    if (timer) { clearInterval(timer); timer = null; }
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }
  function setEnabled(on: boolean): void {
    if (on) start();
    else stop();
  }
  function setOnOverride(cb: (o: ManualOverride) => void): void { onOverride = cb; }
  function setOnVisualState(cb: (s: { connected: boolean; engaged: boolean; axes: ManualOverride }) => void): void { onVisual = cb; }

  return {
    start, stop,
    setEnabled, isEnabled: () => enabled, isActive: () => engaged,
    setOnOverride, setOnVisualState,
  };
}

/** Render a small SVG stick indicator into a host. Returns an updater. */
export function mountVirtualStick(host: HTMLElement, label: string): (x: number, y: number) => void {
  host.innerHTML = `
    <svg viewBox="0 0 60 60" class="vstick-svg" preserveAspectRatio="xMidYMid meet">
      <rect x="2" y="2" width="56" height="56" rx="6" class="vstick-frame"/>
      <line x1="30" y1="6" x2="30" y2="54" class="vstick-cross"/>
      <line x1="6" y1="30" x2="54" y2="30" class="vstick-cross"/>
      <circle cx="30" cy="30" r="6" class="vstick-knob" data-vstick-knob/>
    </svg>
    <span class="vstick-label">${label}</span>
  `;
  const knob = host.querySelector<SVGCircleElement>("[data-vstick-knob]")!;
  return (x: number, y: number) => {
    const cx = 30 + Math.max(-1, Math.min(1, x)) * 22;
    const cy = 30 + Math.max(-1, Math.min(1, -y)) * 22;
    knob.setAttribute("cx", String(cx));
    knob.setAttribute("cy", String(cy));
  };
}
