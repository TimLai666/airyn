/**
 * Telemetry log (tlog). IndexedDB-backed circular buffer of VehicleFrames
 * plus a replay scrubber.
 *
 * The recorder writes each fleet frame as it arrives. The replay reads
 * back a window of frames and lets the renderer index into them by time.
 * No external dependency — the browser's built-in IndexedDB does the work.
 */

import type { VehicleFrame } from "../shared/protocol";

const DB_NAME = "airyn-tlog";
const STORE = "frames";
const DB_VERSION = 1;
const MAX_FRAMES = 50_000;        // ~30 min at 25 Hz across 3 vehicles

interface TlogEntry {
  ts: number;                     // server simTime in seconds (sortable)
  walltime: number;               // local epoch ms
  frames: VehicleFrame[];
}

let dbHandle: IDBDatabase | null = null;
let dbOpenPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbHandle) return Promise.resolve(dbHandle);
  if (dbOpenPromise) return dbOpenPromise;
  dbOpenPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex("by_ts", "ts");
      }
    };
    req.onsuccess = () => { dbHandle = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
  return dbOpenPromise;
}

let recording = false;
let pending: TlogEntry[] = [];
let flushHandle: ReturnType<typeof setInterval> | null = null;

export function startRecording(): void {
  recording = true;
  if (!flushHandle) flushHandle = setInterval(flush, 1000);
}

export function stopRecording(): void {
  recording = false;
  flush();
  if (flushHandle) {
    clearInterval(flushHandle);
    flushHandle = null;
  }
}

export function isRecording(): boolean {
  return recording;
}

export function recordFrame(ts: number, frames: VehicleFrame[]): void {
  if (!recording) return;
  // Only deep-copy what we need to keep — avoid retaining live references.
  pending.push({
    ts,
    walltime: Date.now(),
    frames: frames.map((f) => ({ ...f, preflightReasons: f.preflightReasons.slice() })),
  });
}

async function flush(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const entry of batch) store.add(entry);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    await trim();
  } catch (err) {
    console.error("[tlog] flush failed", err);
  }
}

async function trim(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const countReq = store.count();
  await new Promise<void>((res) => { countReq.onsuccess = () => res(); countReq.onerror = () => res(); });
  const total = countReq.result || 0;
  if (total <= MAX_FRAMES) return;
  const toDelete = total - MAX_FRAMES;
  const cursorReq = store.openCursor();
  let deleted = 0;
  await new Promise<void>((res) => {
    cursorReq.onsuccess = (ev) => {
      const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
      if (!cursor || deleted >= toDelete) { res(); return; }
      cursor.delete();
      deleted++;
      cursor.continue();
    };
    cursorReq.onerror = () => res();
  });
}

export interface TlogSummary {
  count: number;
  startTs: number | null;
  endTs: number | null;
  durationSec: number;
}

export async function summary(): Promise<TlogSummary> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("by_ts");
    const countReq = store.count();
    const firstReq = idx.openCursor(null, "next");
    const lastReq = idx.openCursor(null, "prev");
    let count = 0, startTs: number | null = null, endTs: number | null = null;
    await Promise.all([
      new Promise<void>((res) => { countReq.onsuccess = () => { count = countReq.result || 0; res(); }; countReq.onerror = () => res(); }),
      new Promise<void>((res) => { firstReq.onsuccess = () => { const c = firstReq.result; if (c) startTs = (c.value as TlogEntry).ts; res(); }; firstReq.onerror = () => res(); }),
      new Promise<void>((res) => { lastReq.onsuccess = () => { const c = lastReq.result; if (c) endTs = (c.value as TlogEntry).ts; res(); }; lastReq.onerror = () => res(); }),
    ]);
    return {
      count,
      startTs,
      endTs,
      durationSec: startTs != null && endTs != null ? Math.max(0, endTs - startTs) : 0,
    };
  } catch (err) {
    console.error("[tlog] summary failed", err);
    return { count: 0, startTs: null, endTs: null, durationSec: 0 };
  }
}

export async function loadAllFrames(): Promise<TlogEntry[]> {
  try {
    const db = await openDb();
    return await new Promise<TlogEntry[]>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("by_ts");
      const out: TlogEntry[] = [];
      const cursor = idx.openCursor();
      cursor.onsuccess = (ev) => {
        const c = (ev.target as IDBRequest<IDBCursorWithValue>).result;
        if (!c) { res(out); return; }
        out.push(c.value as TlogEntry);
        c.continue();
      };
      cursor.onerror = () => rej(cursor.error);
    });
  } catch (err) {
    console.error("[tlog] load failed", err);
    return [];
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.error("[tlog] clear failed", err);
  }
}

export interface ReplayHandle {
  start(): void;
  stop(): void;
  seek(seconds: number): void;
  setPlaybackRate(rate: number): void;
  /** Cursor in seconds since first frame. */
  positionSec(): number;
  /** Total length in seconds. */
  durationSec(): number;
  isPlaying(): boolean;
}

export async function createReplay(opts: {
  onFrame: (frames: VehicleFrame[], ts: number) => void;
  onStateChange?: (state: { playing: boolean; positionSec: number; durationSec: number }) => void;
}): Promise<ReplayHandle | null> {
  const entries = await loadAllFrames();
  if (entries.length === 0) return null;
  const startTs = entries[0].ts;
  const end = entries[entries.length - 1].ts;
  let cursor = 0;
  let playing = false;
  let rate = 1;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTick = 0;

  function notify(): void {
    opts.onStateChange?.({
      playing,
      positionSec: cursor,
      durationSec: end - startTs,
    });
  }
  function emit(): void {
    // Find latest entry <= cursor.
    const target = startTs + cursor;
    let idx = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].ts <= target) idx = i;
      else break;
    }
    opts.onFrame(entries[idx].frames, entries[idx].ts);
  }
  function tick(): void {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    cursor = Math.min(end - startTs, cursor + dt * rate);
    emit();
    notify();
    if (cursor >= end - startTs) {
      stop();
    }
  }
  function startReplay(): void {
    if (playing) return;
    playing = true;
    lastTick = performance.now();
    timer = setInterval(tick, 100);
    notify();
  }
  function stop(): void {
    if (!playing) return;
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    notify();
  }
  function seek(seconds: number): void {
    cursor = Math.max(0, Math.min(end - startTs, seconds));
    emit();
    notify();
  }
  function setPlaybackRate(r: number): void {
    rate = Math.max(0.1, Math.min(16, r));
  }
  emit();
  notify();
  return {
    start: startReplay, stop, seek, setPlaybackRate,
    positionSec: () => cursor,
    durationSec: () => end - startTs,
    isPlaying: () => playing,
  };
}
