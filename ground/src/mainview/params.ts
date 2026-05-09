/**
 * Parameter editor: searchable, group-aware key/value table that mirrors
 * QGC and Mission Planner. A change pushes one `setParameter` over the
 * bridge; the bridge's `paramAck` updates the row's status.
 *
 * No commits to the FC happen until the user hits "WRITE" — until then
 * dirty rows are highlighted but not sent. (This matches QGC's behaviour
 * where you can stage many edits and apply them atomically.)
 */

import type { ParameterDescriptor, ParamValue } from "../shared/protocol";

export interface ParamEditorHandle {
  hydrate(descriptors: ParameterDescriptor[]): void;
  setSearch(q: string): void;
  /** Subscribe to dirty edits — rows that changed but haven't been written. */
  onPending(cb: (pending: PendingEdit[]) => void): void;
  /** Subscribe to write requests. Bridge sends one setParameter per item. */
  onWrite(cb: (edits: PendingEdit[]) => void): void;
  /** Apply paramAck from server. */
  applyAck(key: string, ok: boolean, value: ParamValue, message?: string): void;
}

export interface PendingEdit {
  key: string;
  value: ParamValue;
  type: ParameterDescriptor["type"];
}

export function mountParamEditor(host: HTMLElement): ParamEditorHandle {
  host.classList.add("params-host");
  host.innerHTML = `
    <header class="params-head">
      <span class="params-key">PARAMETERS</span>
      <input class="params-search" type="search" placeholder="Filter (name or group)" />
      <span class="params-meta" data-params-meta>0 / 0</span>
      <span class="params-actions">
        <button class="op-btn op-btn--primary" type="button" data-action="param-write" disabled>
          <span class="op-btn-label">WRITE</span><span class="op-btn-meta">CTRL+W</span>
        </button>
        <button class="op-btn" type="button" data-action="param-revert" disabled>
          <span class="op-btn-label">REVERT</span><span class="op-btn-meta">ESC</span>
        </button>
        <button class="op-btn" type="button" data-action="param-refresh">
          <span class="op-btn-label">REFRESH</span><span class="op-btn-meta">F5</span>
        </button>
      </span>
    </header>
    <div class="params-body" data-params-body></div>
  `;

  const body = host.querySelector<HTMLElement>("[data-params-body]")!;
  const search = host.querySelector<HTMLInputElement>(".params-search")!;
  const meta = host.querySelector<HTMLElement>("[data-params-meta]")!;
  const writeBtn = host.querySelector<HTMLButtonElement>("[data-action=param-write]")!;
  const revertBtn = host.querySelector<HTMLButtonElement>("[data-action=param-revert]")!;
  const refreshBtn = host.querySelector<HTMLButtonElement>("[data-action=param-refresh]")!;

  let baseline = new Map<string, ParameterDescriptor>();
  let working = new Map<string, ParameterDescriptor>();
  const onPendingCbs = new Set<(p: PendingEdit[]) => void>();
  const onWriteCbs = new Set<(e: PendingEdit[]) => void>();
  const onRefreshCbs = new Set<() => void>();

  function pendingEdits(): PendingEdit[] {
    const out: PendingEdit[] = [];
    for (const [key, w] of working.entries()) {
      const b = baseline.get(key);
      if (!b) continue;
      const same =
        b.type === "string" ? String(b.value) === String(w.value)
        : b.type === "bool" ? !!b.value === !!w.value
        : Number(b.value) === Number(w.value);
      if (!same) out.push({ key, value: w.value, type: w.type });
    }
    return out;
  }

  function emitPending(): void {
    const edits = pendingEdits();
    writeBtn.disabled = edits.length === 0;
    revertBtn.disabled = edits.length === 0;
    for (const cb of onPendingCbs) cb(edits);
  }

  function passesFilter(p: ParameterDescriptor, q: string): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    return p.key.toLowerCase().includes(needle)
      || (p.group ?? "").toLowerCase().includes(needle)
      || (p.hint ?? "").toLowerCase().includes(needle);
  }

  function render(): void {
    const q = search.value.trim();
    const grouped = new Map<string, ParameterDescriptor[]>();
    let visible = 0;
    const total = baseline.size;
    for (const p of working.values()) {
      if (!passesFilter(p, q)) continue;
      visible++;
      const g = p.group ?? "Other";
      let arr = grouped.get(g);
      if (!arr) { arr = []; grouped.set(g, arr); }
      arr.push(p);
    }
    const groups = Array.from(grouped.keys()).sort();
    let html = "";
    for (const g of groups) {
      const list = grouped.get(g)!.slice().sort((a, b) => a.key.localeCompare(b.key));
      html += `<section class="param-group"><header class="param-group-head">${g}</header><table class="param-table"><thead><tr><th>NAME</th><th>VALUE</th><th>UNIT</th><th>HINT</th></tr></thead><tbody>`;
      for (const p of list) {
        const base = baseline.get(p.key);
        const dirty = base && (base.value !== p.value);
        const valueAttr = p.type === "bool"
          ? (p.value ? "checked" : "")
          : `value="${escapeAttr(String(p.value))}"`;
        const minAttr = p.min != null ? `min="${p.min}"` : "";
        const maxAttr = p.max != null ? `max="${p.max}"` : "";
        const stepAttr = p.step != null ? `step="${p.step}"` : (p.type === "int" ? `step="1"` : "");
        const inputType = p.type === "bool" ? "checkbox" : p.type === "string" ? "text" : "number";
        html += `<tr class="param-row${dirty ? " is-dirty" : ""}" data-param-row="${p.key}">
          <td class="param-name">${p.key}</td>
          <td class="param-value"><input class="param-input" type="${inputType}" ${valueAttr} ${minAttr} ${maxAttr} ${stepAttr} data-param-input="${p.key}" /></td>
          <td class="param-unit">${p.unit ?? ""}</td>
          <td class="param-hint">${p.hint ?? ""}</td>
        </tr>`;
      }
      html += `</tbody></table></section>`;
    }
    body.innerHTML = html;
    meta.textContent = `${visible} / ${total}`;
  }

  body.addEventListener("change", (ev) => {
    const target = ev.target as HTMLInputElement;
    const key = target.getAttribute("data-param-input");
    if (!key) return;
    const p = working.get(key);
    if (!p) return;
    if (p.type === "bool") {
      p.value = target.checked;
    } else if (p.type === "string") {
      p.value = target.value;
    } else {
      const n = Number(target.value);
      if (!Number.isFinite(n)) return;
      p.value = p.type === "int" ? Math.round(n) : n;
    }
    const row = body.querySelector(`[data-param-row="${cssEscape(key)}"]`);
    const base = baseline.get(key);
    const dirty = base && base.value !== p.value;
    if (row) row.classList.toggle("is-dirty", !!dirty);
    emitPending();
  });

  search.addEventListener("input", render);

  writeBtn.addEventListener("click", () => {
    const edits = pendingEdits();
    if (edits.length === 0) return;
    for (const cb of onWriteCbs) cb(edits);
  });
  revertBtn.addEventListener("click", () => {
    working = new Map(Array.from(baseline.entries()).map(([k, v]) => [k, { ...v }]));
    render();
    emitPending();
  });
  refreshBtn.addEventListener("click", () => {
    for (const cb of onRefreshCbs) cb();
  });

  function hydrate(descriptors: ParameterDescriptor[]): void {
    const dirtyKeys = new Set(pendingEdits().map((e) => e.key));
    baseline = new Map(descriptors.map((d) => [d.key, { ...d }]));
    // Preserve dirty-edited values across refresh.
    const next = new Map<string, ParameterDescriptor>();
    for (const d of descriptors) {
      const existing = working.get(d.key);
      if (existing && dirtyKeys.has(d.key)) {
        next.set(d.key, { ...d, value: existing.value });
      } else {
        next.set(d.key, { ...d });
      }
    }
    working = next;
    render();
    emitPending();
  }

  function setSearch(q: string): void { search.value = q; render(); }

  function onPending(cb: (p: PendingEdit[]) => void): void { onPendingCbs.add(cb); }
  function onWrite(cb: (e: PendingEdit[]) => void): void { onWriteCbs.add(cb); }

  function applyAck(key: string, ok: boolean, value: ParamValue, message?: string): void {
    const base = baseline.get(key);
    const w = working.get(key);
    if (base) base.value = value;
    if (w && ok) w.value = value;
    if (!ok && message) console.warn(`[params] ${key} rejected: ${message}`);
    render();
    emitPending();
  }

  // Expose refresh hook
  (refreshBtn as any)._addOn = (cb: () => void) => onRefreshCbs.add(cb);
  return {
    hydrate, setSearch, onPending, onWrite, applyAck,
  } as ParamEditorHandle;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function cssEscape(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
