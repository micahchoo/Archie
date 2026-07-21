// Storage telemetry for the bottom chip — REFRAMED after docs/research/browser-storage-quota.md.
//
// The first cut showed usage as a fraction of `estimate().quota`. That number is a privacy constant
// (Chromium reports `usage + 10 GiB`, kStaticStorageQuota), so the fraction was structurally unable
// to warn: 75% required 30 GB stored, while real imports start failing whenever a single batch needs
// more than the constant. There is no observable ceiling — so this store now tracks the two things
// that ARE true: how many bytes this origin holds (absolute usage), and whether the most recent
// asset write actually failed for space ("storage full" is an EVENT we witness, not a percentage we
// predict). ingest-flows' persistAsset seam reports both directions.
//
// A `.svelte.ts` rune module like save-queue.svelte.ts: the $state container is never reassigned,
// so reads stay live across modules.
//
// NATIVE (Archie-623e Phase 3): under isTauri() the whole chip subsystem is INERT. The desktop working
// store is a native folder with no quota and no eviction, and `navigator.storage.estimate().usage` would
// report only OPFS CACHE residue (not the real folder library) — worse than nothing. So refreshQuota
// leaves usage null (the chip's `unknown` branch renders nothing), requestPersistence skips persist()
// (no eviction to exempt from), and a write failure does NOT raise the "storage full" chip: on native fs
// the throw is ENOSPC/EACCES, not QuotaExceededError, and it surfaces through the normal save-error path
// (enqueueSave → saveStatus), not this predictor.

import { isTauri } from "./tauri-fs.js";

const s = $state<{
  /** Bytes this origin currently uses, per estimate(). Null = not yet read / engine can't estimate. */
  usage: number | null;
  /** The most recent asset write failed for space, and no write has succeeded since. */
  storageFull: boolean;
  /** Origin usage at the moment of failure — an observed in-app usage DROP below this (the user
   *  deleted exhibits) also clears the flag, since no successful write may follow deletion. */
  usageAtFailure: number;
}>({ usage: null, storageFull: false, usageAtFailure: 0 });

export type StorageLevel = "unknown" | "calm" | "critical";

/** Bytes → a short human string. Two significant places under 10 units so "9.3 GB" keeps its
 *  precision while "512 MB" doesn't grow a pointless decimal. */
export function formatBytes(n: number): string {
  const GB = 1024 ** 3, MB = 1024 ** 2, KB = 1024;
  if (n >= GB) { const v = n / GB; return `${v >= 10 ? Math.round(v) : v.toFixed(1)} GB`; }
  if (n >= MB) { const v = n / MB; return `${v >= 10 ? Math.round(v) : v.toFixed(1)} MB`; }
  if (n >= KB) return `${Math.round(n / KB)} KB`;
  return `${n} B`;
}

/** Re-read origin usage. Never throws and never blocks: an engine without `estimate()` (or one that
 *  refuses it in a private window) leaves usage null and the chip hides — never a fabricated zero.
 *  NOTE: only `usage` is read; `quota` is deliberately ignored (it's the privacy constant). */
export async function refreshQuota(): Promise<void> {
  if (isTauri()) { s.usage = null; return; } // native folder: no quota — estimate() would show only OPFS cache
  try {
    const storage = (globalThis.navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
    } | undefined)?.storage;
    const est = await storage?.estimate?.();
    s.usage = est && typeof est.usage === "number" ? est.usage : null;
  } catch {
    s.usage = null; // permissions / private mode — unknown, not zero
  }
  // In-app deletion recovery: usage dropped below where it stood when the write failed → space was
  // freed inside Archie, even though no asset write has run since to report success.
  if (s.storageFull && s.usage !== null && s.usage < s.usageAtFailure) s.storageFull = false;
}

// One-shot durability request (docs/research/browser-storage-quota.md §2): persist() does NOT
// increase quota — it only exempts this origin from LRU eviction under storage pressure, which for a
// local-first working store is exactly the guarantee worth asking for. Chrome grants or denies
// silently on engagement heuristics (never prompts); Firefox may show a prompt, which is why this
// waits for the FIRST asset write (a user actively keeping bytes) instead of firing at boot.
let persistRequested = false;
export function requestPersistence(): void {
  if (isTauri()) return; // native folder has no eviction to be exempted from — persist() is meaningless
  if (persistRequested) return;
  persistRequested = true;
  try {
    const storage = (globalThis.navigator as Navigator & { storage?: { persist?: () => Promise<boolean> } } | undefined)?.storage;
    void storage?.persist?.()?.catch(() => {}); // denial is fine — best-effort mode just stays
  } catch { /* absent API (headless/test env) — nothing to ask */ }
}

/** An asset write failed for space (persistAsset → false). The chip goes critical until a write
 *  succeeds or usage is observed to drop. */
export function reportStorageFailure(): void {
  if (isTauri()) return; // native fs failure (ENOSPC/EACCES) surfaces via the save-error path, not this chip
  s.storageFull = true;
  s.usageAtFailure = s.usage ?? 0;
}

/** An asset write landed — storage is demonstrably not full. */
export function reportStorageOk(): void {
  s.storageFull = false;
}

/** Reactive storage state for the chrome. */
export const storageQuota = {
  get usage(): number | null { return s.usage; },
  get level(): StorageLevel {
    if (s.storageFull) return "critical"; // a witnessed failure outranks a missing estimate
    return s.usage === null ? "unknown" : "calm";
  },
};
