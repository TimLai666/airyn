import { BrowserWindow } from "electrobun/bun";
import { Screen } from "electrobun/bun";

// Open at 85 % of the primary display's work area, centered. The work area
// excludes the Windows taskbar, so the window lands neatly without overlap.
// Falls back to a sane fixed default if the Screen probe ever fails.
const FALLBACK = { width: 1400, height: 900 };
const COVERAGE = 0.92;

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
