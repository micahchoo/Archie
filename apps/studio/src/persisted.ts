// The try{localStorage}catch{} idiom, extracted (Archie-3148). Before this module, the same shape —
// read/write localStorage, swallow private-mode/quota-denied errors, degrade to a documented default —
// was independently re-derived in canvas-first-use.ts, feature-flags.ts, import-freshness.ts,
// view-prefs.svelte.ts, deploy/deploy-flows.svelte.ts, binding.ts, and writer-lock.svelte.ts, in three
// recurring shapes: a bare boolean flag, an enum-like string with a fallback, and a JSON blob (often
// keyed by an id). This module gives each shape ONE implementation.
//
// These are behavior-NEUTRAL extractions: every caller keeps its own default/denied semantics (what a
// missing or unreadable key resolves to). App.svelte's own copies (FIRST_ADD_KEY, IDENTITY_KEY,
// archie.lastPlace.v1, …) are OUT of scope here — Issue-18 territory, not this ticket.

/** Read a key; `null` on absent OR any access failure (quota denied, private mode, disabled storage).
 *  This is the one place `localStorage.getItem` is allowed to throw uncaught. */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a key; a no-op on any access failure. None of the current call sites need to know whether the
 *  write landed — every one is "best effort, resets to default next load" persistence. */
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / quota denied — resets next load, harmless */
  }
}

/** Remove a key; a no-op on any access failure. */
export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* private mode / quota denied — harmless */
  }
}

/**
 * A boolean flag stored as the literal string `"1"` (true) / anything else (false) — the idiom shared
 * by canvas-first-use's hint-seen cue, feature-flags' structureRevlogEnabled, and view-prefs'
 * railCollapsed. `set` always writes an explicit `"1"`/`"0"` (never removes the key), matching
 * railCollapsed's existing write shape — a caller that only ever marks `true` (canvas-first-use) simply
 * never calls `set(false)`.
 */
export function persistedFlag(key: string): { get(): boolean; set(v: boolean): void } {
  return {
    get: () => safeGet(key) === "1",
    set: (v: boolean) => safeSet(key, v ? "1" : "0"),
  };
}

/**
 * An enum-like string with a closed set of accepted values and a fallback for everything else — absent,
 * storage-denied, garbage, OR a retired value (e.g. view-prefs' canvas→grid migration: a legacy
 * `"canvas"` simply isn't in `allowed`, so it resolves to the fallback like any other garbage, with no
 * separate migration step needed). The idiom shared by view-prefs' overviewMode / overviewDensity /
 * galleryView.
 */
export function persistedString<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): { get(): T; set(v: T): void } {
  return {
    get: () => {
      const v = safeGet(key);
      return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
    },
    set: (v: T) => safeSet(key, v),
  };
}

/**
 * Tolerant JSON read: absent, storage-denied, malformed JSON, or (when `isValid` is supplied) a
 * wrong-shaped value all collapse to `null` — never throws. Omit `isValid` to get the "trust the parse"
 * behavior some existing call sites (deploy-flows' rememberedTarget) already had — they never validated
 * shape, only tolerated absence/corruption, and this preserves that exactly rather than tightening it.
 * This is app-local convenience state, not render-core's corrupt-vs-empty contract
 * (render-core-data-integrity.md) — "corrupt" and "never written" are deliberately NOT distinguished
 * here, matching every migrated call site's original behavior.
 */
export function readJson<T>(key: string, isValid?: (v: unknown) => v is T): T | null {
  const raw = safeGet(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValid && !isValid(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

/** Write a value as JSON; a no-op on a `JSON.stringify` throw (e.g. a circular reference) or a storage
 *  failure — matches every existing call site's blanket try/catch around stringify+setItem together. */
export function writeJson(key: string, value: unknown): void {
  try {
    safeSet(key, JSON.stringify(value));
  } catch {
    /* stringify failure — harmless, nothing persisted */
  }
}
