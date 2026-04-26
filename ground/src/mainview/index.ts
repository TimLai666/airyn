/**
 * Airyn Ground — mainview entry script.
 *
 * Responsibilities:
 *  - Tick the masthead clock and date.
 *  - Switch between chapter views (MAP / CAMERAS / SENSORS / MISSION /
 *    CALIBRATION / LOG / SETTINGS) when the operator clicks a tab.
 *  - Switch between camera feeds when the operator clicks a thumbnail.
 *
 * Real link / telemetry / sensor wiring is intentionally out of scope here
 * and lives in src/bun/ once the flight-link transport is in place.
 */

const clockEl = document.querySelector<HTMLTimeElement>("#clock");
const dateEl = document.querySelector<HTMLSpanElement>("#date");

const tabs = document.querySelectorAll<HTMLButtonElement>(".tab[data-tab]");
const views = document.querySelectorAll<HTMLElement>(".view[data-view]");

const camThumbs = document.querySelectorAll<HTMLButtonElement>(".cam--thumb[data-cam]");
const camMainClass = document.querySelector<HTMLElement>(".cam--main .cam-class");

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function renderClock(): void {
  const now = new Date();
  if (clockEl) {
    clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  if (dateEl) {
    dateEl.textContent = `${now.getFullYear()}·${pad(now.getMonth() + 1)}·${pad(now.getDate())}`;
  }
}

function setView(name: string): void {
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset["tab"] === name);
  });
  views.forEach((view) => {
    view.hidden = view.dataset["view"] !== name;
  });
}

function setCam(name: string): void {
  let label: string | null = null;
  camThumbs.forEach((thumb) => {
    const isActive = thumb.dataset["cam"] === name;
    thumb.classList.toggle("is-active", isActive);
    if (isActive) {
      const classEl = thumb.querySelector<HTMLElement>(".cam-class");
      label = classEl?.textContent ?? null;
    }
  });
  if (camMainClass && label) {
    camMainClass.textContent = `FEED · ${label}`;
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset["tab"];
    if (name) setView(name);
  });
});

camThumbs.forEach((thumb) => {
  thumb.addEventListener("click", () => {
    const name = thumb.dataset["cam"];
    if (name) setCam(name);
  });
});

renderClock();
setInterval(renderClock, 1000);
