/**
 * Lightweight popup primitive used by the pre-arm reasons panel and any
 * other "click chip → see detail" interaction. Keeps state out of the main
 * index.ts file: pop one up, optionally pin until clicked elsewhere.
 *
 * No dependencies, no animation framework — just a focused overlay that
 * dismisses on outside click or Escape.
 */

export interface PopupHandle {
  close(): void;
  isOpen(): boolean;
  setContent(html: string): void;
}

const root = document.createElement("div");
root.className = "popup-root";
root.setAttribute("role", "presentation");
let mounted = false;

function ensureMounted(): void {
  if (mounted) return;
  document.body.appendChild(root);
  mounted = true;
}

export function openPopup(opts: {
  anchor: HTMLElement;
  className?: string;
  html: string;
  onClose?: () => void;
}): PopupHandle {
  ensureMounted();
  // Close any existing popup so only one is open at a time.
  root.innerHTML = "";

  const card = document.createElement("div");
  card.className = "popup-card" + (opts.className ? " " + opts.className : "");
  card.setAttribute("role", "dialog");
  card.innerHTML = opts.html;
  root.appendChild(card);

  // Position card next to the anchor, clamped within viewport.
  const anchorRect = opts.anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  let top = anchorRect.bottom + 8;
  if (top + cardRect.height > window.innerHeight - 12) {
    top = Math.max(12, anchorRect.top - cardRect.height - 8);
  }
  let left = anchorRect.left;
  if (left + cardRect.width > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - cardRect.width - 12);
  }
  card.style.position = "fixed";
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;

  let closed = false;

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", close);
    root.innerHTML = "";
    if (opts.onClose) opts.onClose();
  }

  function onOutside(ev: Event): void {
    const t = ev.target as Node;
    if (card.contains(t)) return;
    if (opts.anchor.contains(t)) return;
    close();
  }
  function onKey(ev: KeyboardEvent): void {
    if (ev.key === "Escape") close();
  }

  setTimeout(() => {
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", close);
  }, 0);

  return {
    close,
    isOpen() { return !closed; },
    setContent(html: string) { card.innerHTML = html; },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;");
}
