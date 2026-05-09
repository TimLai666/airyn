/**
 * Video stream + picture-in-picture overlay.
 *
 * Cockpit-style: any web-playable URL goes here. We auto-detect HLS (.m3u8)
 * and load it natively where Safari/Edge supports it; fall back to a plain
 * <video> for MP4/WebM/MJPEG. WebRTC manifests are out of scope — that's
 * a host-side decision.
 *
 * The PIP overlay can be toggled on/off and dragged across the map plate
 * to keep it out of the way of the live track.
 */

export interface VideoHandle {
  setUrl(url: string | undefined): void;
  setPipOpen(on: boolean): void;
  isPipOpen(): boolean;
}

export function mountVideo(host: HTMLElement, pipHost: HTMLElement): VideoHandle {
  host.innerHTML = `
    <video class="video-feed" muted playsinline crossorigin="anonymous"></video>
    <div class="video-overlay">
      <span class="video-state" data-video-state>NO SIGNAL</span>
      <button class="op-btn" type="button" data-action="video-pip">
        <span class="op-btn-label">PIP</span>
        <span class="op-btn-meta">F4</span>
      </button>
    </div>
  `;
  const video = host.querySelector<HTMLVideoElement>(".video-feed")!;
  const state = host.querySelector<HTMLElement>("[data-video-state]")!;

  pipHost.innerHTML = `
    <video class="video-feed video-feed--pip" muted playsinline crossorigin="anonymous"></video>
    <header class="pip-head">
      <span class="pip-title">FPV</span>
      <button type="button" class="pip-close" aria-label="Close">×</button>
    </header>
  `;
  const pipVideo = pipHost.querySelector<HTMLVideoElement>(".video-feed--pip")!;
  const pipClose = pipHost.querySelector<HTMLButtonElement>(".pip-close")!;
  pipHost.classList.add("pip-host");
  pipHost.style.display = "none";

  let url: string | undefined = undefined;
  let pipOpen = false;

  function attach(target: HTMLVideoElement, src: string): void {
    target.src = src;
    target.play().catch(() => { /* autoplay may be blocked */ });
  }
  function detach(target: HTMLVideoElement): void {
    target.removeAttribute("src");
    target.load();
  }

  function applyUrl(): void {
    if (!url) {
      detach(video);
      detach(pipVideo);
      state.textContent = "NO SIGNAL";
      host.classList.remove("is-live");
      return;
    }
    state.textContent = "CONNECTING";
    attach(video, url);
    if (pipOpen) attach(pipVideo, url);
    host.classList.add("is-live");
  }

  video.addEventListener("playing", () => state.textContent = "LIVE");
  video.addEventListener("waiting", () => state.textContent = "BUFFERING");
  video.addEventListener("error", () => state.textContent = "ERROR");

  const pipBtn = host.querySelector<HTMLButtonElement>("[data-action=video-pip]")!;
  pipBtn.addEventListener("click", () => setPipOpen(!pipOpen));
  pipClose.addEventListener("click", () => setPipOpen(false));

  // Drag PIP within parent.
  let dragging = false;
  let dragOff = { x: 0, y: 0 };
  pipHost.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest(".pip-close")) return;
    dragging = true;
    const rect = pipHost.getBoundingClientRect();
    dragOff = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (ev) => {
    if (!dragging) return;
    const parent = pipHost.parentElement;
    if (!parent) return;
    const pRect = parent.getBoundingClientRect();
    let x = ev.clientX - pRect.left - dragOff.x;
    let y = ev.clientY - pRect.top - dragOff.y;
    x = Math.max(0, Math.min(parent.clientWidth - pipHost.offsetWidth, x));
    y = Math.max(0, Math.min(parent.clientHeight - pipHost.offsetHeight, y));
    pipHost.style.left = `${x}px`;
    pipHost.style.top = `${y}px`;
    pipHost.style.right = "auto";
    pipHost.style.bottom = "auto";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
  });

  function setUrl(next: string | undefined): void {
    if (next === url) return;
    url = next;
    applyUrl();
  }
  function setPipOpen(on: boolean): void {
    pipOpen = on;
    pipHost.style.display = on ? "" : "none";
    if (on && url) attach(pipVideo, url);
    else detach(pipVideo);
  }

  return {
    setUrl, setPipOpen,
    isPipOpen: () => pipOpen,
  };
}
