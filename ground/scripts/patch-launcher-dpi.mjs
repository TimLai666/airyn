#!/usr/bin/env node
/**
 * Patch every Electrobun-owned Windows .exe with a DPI-aware manifest.
 *
 * Why
 * ---
 * Windows DPI awareness is a per-process flag and is NOT inherited from the
 * parent process. Electrobun's launcher.exe spawns bun.exe, which in turn
 * creates the native HWND that hosts WebView2 via libNativeWrapper.dll.
 * If bun.exe declares no DPI awareness, Windows renders that window at
 * logical pixels and bitmap-stretches the whole thing — text comes out
 * blurry on high-DPI displays (e.g. 200 % scale on 2880 × 1800).
 *
 * Patching just launcher.exe is not enough; we also have to patch bun.exe.
 * process_helper.exe and extractor.exe get the same treatment so that any
 * helper window created by them is also sharp.
 *
 * Mechanism: embed `build-tools/launcher.manifest` (declaring
 * `dpiAware = true/PM` and `dpiAwareness = PerMonitorV2`) as the manifest
 * resource of each exe via the `rcedit` npm package. Falls back to mt.exe
 * (Windows SDK) if rcedit fails.
 *
 * Idempotent: skips files that already contain the `PerMonitorV2` marker.
 *
 * Cross-platform: silently no-ops on macOS / Linux. Postinstall on those
 * hosts can still complete cleanly.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ELECTROBUN_BIN_DIR = resolve(ROOT, "node_modules/electrobun/dist-win-x64");
const MANIFEST = resolve(ROOT, "build-tools/launcher.manifest");
const MARKER = "PerMonitorV2";

// Every Windows .exe Electrobun ships. Order does not matter; we patch each
// independently and skip what is already done.
const TARGETS = [
  "launcher.exe",
  "bun.exe",
  "process_helper.exe",
  "extractor.exe",
  "bsdiff.exe",
  "bspatch.exe",
  "zig-zstd.exe",
];

function log(msg) {
  console.log(`[patch-launcher-dpi] ${msg}`);
}

if (process.platform !== "win32") {
  log(`skipping on ${process.platform} (Windows-only)`);
  process.exit(0);
}

if (!existsSync(MANIFEST)) {
  log(`manifest not found at ${MANIFEST}`);
  process.exit(1);
}

if (!existsSync(ELECTROBUN_BIN_DIR)) {
  log(`electrobun bin dir not found at ${ELECTROBUN_BIN_DIR}`);
  log("(this is expected if electrobun is not installed yet)");
  process.exit(0);
}

let rcedit;
try {
  ({ default: rcedit } = await import("rcedit"));
} catch (err) {
  log("rcedit not installed yet; will retry on next install");
  log(String(err));
  process.exit(0);
}

async function patchOne(filename) {
  const full = resolve(ELECTROBUN_BIN_DIR, filename);
  if (!existsSync(full)) {
    log(`${filename} not present, skipping`);
    return;
  }

  const sizeMB = (statSync(full).size / 1024 / 1024).toFixed(1);

  const buf = readFileSync(full);
  if (buf.includes(MARKER)) {
    log(`${filename} (${sizeMB} MB) already patched — skip`);
    return;
  }

  log(`patching ${filename} (${sizeMB} MB) ...`);
  try {
    await rcedit(full, { "application-manifest": MANIFEST });
    log(`  ${filename} patched via rcedit`);
    return;
  } catch (err) {
    log(`  rcedit failed for ${filename}: ${err}`);
  }

  // mt.exe fallback (requires Windows SDK)
  try {
    execFileSync(
      "mt.exe",
      ["-manifest", MANIFEST, `-outputresource:${full};#1`],
      { stdio: "inherit" },
    );
    log(`  ${filename} patched via mt.exe`);
  } catch (mtErr) {
    log(`  mt.exe also failed for ${filename}: ${mtErr}`);
    log(`  text in windows owned by ${filename} may stay blurry on high-DPI displays`);
  }
}

for (const target of TARGETS) {
  await patchOne(target);
}

log("done");
