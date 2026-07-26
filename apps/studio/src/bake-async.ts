// Worker-backed ingest bake (Archie perf 2026-07-24) — same API as bake.ts, off the main thread.
//
// WHY: bake.ts builds its canvas with document.createElement, so every imported image pins the UI
// thread. Measured 2026-07-24: 277 ms master + 60 ms thumbnail = ~336 ms per image, and a 70-object
// folder import runs that ~70 times => ~23.5 s of a frozen app. Ingest already fans out over files
// (ingest-flows.ts), but that fan-out buys nothing while the pixel work is all on one thread.
//
// CONTRACT: these are drop-in async equivalents of bake.ts's functions and MUST stay behaviourally
// identical — same dimension seam (fitWithin/exceedsCap, imported by the worker from the same core
// module), same "thumbnail returns null when the master is already small" rule, same "downscale returns
// the untouched bytes when under the cap" rule. If a rule changes in bake.ts, change it in
// bake-worker.ts too; the two are a pair.
//
// FALLBACK: where Worker/OffscreenCanvas are unavailable (jsdom test runs, exotic webviews) every
// function delegates to the DOM implementation in bake.ts, so callers need no capability checks.
import { bakeDisplayMaster, bakeThumbnail, downscaleIfNeeded, type BakedMaster, type BakeOptions } from "./bake.js";

/** Long-lived pool: ingest imports images in batches, so paying worker startup once per session beats
 *  paying it per image. Sized modestly — each in-flight bake holds a decoded bitmap plus its canvas. */
const POOL_MAX = 6;

interface Pending { resolve: (v: any) => void; reject: (e: Error) => void }

let pool: Worker[] | null = null;
let rr = 0;
let seq = 0;
const pending = new Map<number, Pending>();

export function bakeWorkersAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

/** Count of bakes that silently fell back to the DOM implementation. The fallback is deliberate (a
 *  worker failure must never fail an import) but it is INVISIBLE — without this counter a wholly broken
 *  worker path looks like a working one that is merely slow, and a benchmark would report DOM timings
 *  under a worker label. Non-zero in production means the pool is degraded; assert zero in perf runs. */
let fallbacks = 0;
export const bakeFallbackCount = (): number => fallbacks;

/** The pool width this machine will use. Exported so a READOUT (the Settings panel's diagnostics)
 *  reports the number the pool actually builds, rather than re-deriving it from a copied POOL_MAX —
 *  a duplicated ceiling is a readout that silently starts lying the day the ceiling moves. */
export function bakePoolSize(): number {
  return Math.max(1, Math.min(POOL_MAX, navigator.hardwareConcurrency || 4));
}

function ensurePool(): Worker[] | null {
  if (!bakeWorkersAvailable()) return null;
  if (pool) return pool;
  try {
    const size = bakePoolSize();
    pool = Array.from({ length: size }, () => {
      const wk = new Worker(new URL("./bake-worker.ts", import.meta.url), { type: "module" });
      wk.onmessage = (e: MessageEvent) => {
        const p = pending.get(e.data?.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.kind === "error") p.reject(new Error(e.data.message));
        else p.resolve(e.data);
      };
      wk.onerror = () => { /* per-call rejection is handled by the timeout-free pending map below */ };
      return wk;
    });
    return pool;
  } catch {
    pool = null;
    return null;
  }
}

/** Release the pool (tests, teardown). Safe to call when no pool exists. */
export function disposeBakePool(): void {
  for (const wk of pool ?? []) wk.terminate();
  pool = null;
  pending.clear();
}

function call<T>(msg: Record<string, unknown>): Promise<T> {
  const workers = ensurePool()!;
  const id = ++seq;
  const wk = workers[rr++ % workers.length]!;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    wk.postMessage({ ...msg, id });
  });
}

/** Worker-backed {@link bakeDisplayMaster}. Falls back to the DOM implementation off-browser. */
export async function bakeDisplayMasterAsync(file: Blob, opts: BakeOptions = {}): Promise<BakedMaster> {
  const { maxDim = 0, mime = "image/png", quality = 0.92 } = opts;
  if (!ensurePool()) { fallbacks++; return bakeDisplayMaster(file, opts); }
  try {
    const r = await call<{ blob: Blob; width: number; height: number }>({ kind: "master", file, maxDim, mime, quality });
    if (!r.blob) throw new Error("bake-worker produced no display master");
    return { blob: r.blob, width: r.width, height: r.height };
  } catch {
    fallbacks++;
    return bakeDisplayMaster(file, opts); // a worker failure must never fail an import
  }
}

/** Worker-backed {@link bakeThumbnail}. Returns null when the master is already within `dim`. */
export async function bakeThumbnailAsync(master: Blob, dim: number, mime: string, quality = 0.8): Promise<Blob | null> {
  if (!ensurePool()) { fallbacks++; return bakeThumbnail(master, dim, mime, quality); }
  try {
    const r = await call<{ blob: Blob | null }>({ kind: "thumb", master, dim, mime, quality });
    return r.blob;
  } catch {
    fallbacks++;
    return bakeThumbnail(master, dim, mime, quality);
  }
}

/** Worker-backed {@link downscaleIfNeeded}. Returns the untouched bytes when already under the cap. */
export async function downscaleIfNeededAsync(file: Blob, maxDim: number, mime: string): Promise<BakedMaster> {
  if (!ensurePool()) { fallbacks++; return downscaleIfNeeded(file, maxDim, mime); }
  try {
    const r = await call<{ blob: Blob; width: number; height: number }>({ kind: "downscale", file, maxDim, mime });
    if (!r.blob) throw new Error("bake-worker produced no downscaled master");
    return { blob: r.blob, width: r.width, height: r.height };
  } catch {
    fallbacks++;
    return downscaleIfNeeded(file, maxDim, mime);
  }
}
