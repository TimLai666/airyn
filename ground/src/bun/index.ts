import { BrowserWindow, Screen } from "electrobun/bun";
import { startBridge } from "./bridge";
import { BRIDGE_PORT } from "../shared/protocol";

// Boot order matters: spin up the simulator/bridge BEFORE the window so
// that the renderer's WebSocket connect attempt at load time succeeds on
// the first try.
startBridge(BRIDGE_PORT);

// Open near full work area because the ground station is an operations
// surface: map, controls, and telemetry must all be visible immediately.
// The work
// area excludes the Windows taskbar, so the window lands neatly without
// overlap. Falls back to a sane fixed default if the Screen probe fails.
const FALLBACK = { width: 1600, height: 920 };
const COVERAGE = 0.98;

function computeFrame(): { x: number; y: number; width: number; height: number } {
  try {
    const d = Screen.getPrimaryDisplay();
    const wa = d.workArea;
    if (!wa.width || !wa.height) throw new Error("empty work area");
    const width = Math.round(wa.width * COVERAGE);
    const height = Math.round(wa.height * COVERAGE);
    return {
      width,
      height,
      x: wa.x + Math.round((wa.width - width) / 2),
      y: wa.y + Math.round((wa.height - height) / 2),
    };
  } catch {
    return { x: 80, y: 60, ...FALLBACK };
  }
}

const mainWindow = new BrowserWindow({
  title: "Airyn Ground",
  url: "views://mainview/index.html",
  frame: computeFrame(),
});

mainWindow.focus();

console.log("Airyn Ground started");
