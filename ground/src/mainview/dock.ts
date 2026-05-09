/**
 * Lightweight draggable instrument dock. Each "panel" is the existing
 * `.cb-cam`, `.cb-telem`, etc. block — we attach a drag handle and persist
 * left/top deltas in localStorage, applied via CSS transform.
 *
 * Doesn't try to compete with full grid layout libraries: this just lets
 * the operator nudge a panel out of the way without rebuilding the page.
 * "Reset layout" zeros every transform and clears storage.
 */

const STORAGE_KEY = "airyn.dock.v1";

interface DockState { [panelId: string]: { x: number; y: number } }

function loadState(): DockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as DockState : {};
  } catch {
    return {};
  }
}

function persist(state: DockState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* */ }
}

export function makeDraggable(panel: HTMLElement, panelId: string): void {
  panel.dataset["panelId"] = panelId;
  panel.classList.add("dock-panel");
  let handle = panel.querySelector<HTMLElement>(".dock-handle");
  if (!handle) {
    handle = document.createElement("span");
    handle.className = "dock-handle";
    handle.title = "Drag to reposition";
    handle.textContent = "⠿";
    panel.appendChild(handle);
  }
  const state = loadState();
  const saved = state[panelId];
  if (saved) {
    panel.style.transform = `translate(${saved.x}px, ${saved.y}px)`;
  }
  let dragging = false;
  let startX = 0, startY = 0;
  let baseX = saved?.x ?? 0, baseY = saved?.y ?? 0;
  handle.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    startX = ev.clientX;
    startY = ev.clientY;
    document.body.style.userSelect = "none";
    handle!.classList.add("is-dragging");
  });
  window.addEventListener("mousemove", (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const x = baseX + dx;
    const y = baseY + dy;
    panel.style.transform = `translate(${x}px, ${y}px)`;
  });
  window.addEventListener("mouseup", (ev) => {
    if (!dragging) return;
    dragging = false;
    handle!.classList.remove("is-dragging");
    document.body.style.userSelect = "";
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    baseX += dx;
    baseY += dy;
    const cur = loadState();
    cur[panelId] = { x: baseX, y: baseY };
    persist(cur);
  });
  // Double-click handle resets just this panel.
  handle.addEventListener("dblclick", () => {
    baseX = 0; baseY = 0;
    panel.style.transform = "";
    const cur = loadState();
    delete cur[panelId];
    persist(cur);
  });
}

export function resetAllDockPositions(): void {
  persist({});
  const panels = document.querySelectorAll<HTMLElement>(".dock-panel");
  panels.forEach((p) => { p.style.transform = ""; });
}
