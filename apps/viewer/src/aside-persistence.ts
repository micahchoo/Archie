// Resizable/collapsible reader-aside persistence (Phase-2 expandability) — the localStorage load/save
// that Reader.svelte and NarrativeReader.svelte shared VERBATIM (they differed only in their key strings).
// Pure helpers parameterized by key, NOT a rune factory: each reader keeps its own bindable $state for
// ResizeDivider's bind:width / bind:collapsed, so this is just the duplicated I/O contract in one place.
// Viewer-local (studio's App.svelte keeps its own copy — out of scope here).

/** Read a persisted aside width override — null = no override (use the responsive clamp() default). */
export function loadAsideWidth(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) || null : null;
  } catch {
    return null;
  }
}

/** Read the persisted collapsed flag (default: expanded). */
export function loadAsideCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** The aside state ResizeDivider commits (width override + collapsed flag). */
export interface AsideState { width: number | null; collapsed: boolean }

/** Persist the aside state (width override + collapsed flag). Private-mode throws are swallowed — the
 *  size simply resets next load, harmless. */
export function saveAside(widthKey: string, collapsedKey: string, s: AsideState): void {
  try {
    if (s.width == null) localStorage.removeItem(widthKey);
    else localStorage.setItem(widthKey, String(Math.round(s.width)));
    localStorage.setItem(collapsedKey, s.collapsed ? "1" : "0");
  } catch {
    /* private mode — harmless */
  }
}

/** Persist ONLY the width override — for a host that scopes its collapsed flag differently
 *  (the narrative: width is a global reading-measure taste, collapse is per-exhibit). */
export function saveAsideWidth(widthKey: string, width: number | null): void {
  try {
    if (width == null) localStorage.removeItem(widthKey);
    else localStorage.setItem(widthKey, String(Math.round(width)));
  } catch {
    /* private mode — harmless */
  }
}

// ── Per-exhibit, session-scoped collapse (Archie-c5cb) ────────────────────────────────────────────
//
// Two deliberate departures from the width idiom above, both because of what the narrative spine IS
// after Archie-0d6c: not a panel of prose but the mode's INPUT DEVICE — the surface whose scroll
// drives the camera.
//
// 1. SCOPED BY EXHIBIT. A global flag meant collapsing the spine on one narrative collapsed it on
//    every narrative the reader opened afterwards, including ones they had never seen.
// 2. sessionStorage, NOT localStorage. A reader returning days later to a narrative whose driving
//    surface is gone has no way to know what they are missing — the collapse is a within-visit
//    "give the canvas the page" gesture, so it lives for the visit. Inside the tab it still holds:
//    hide it on A, wander to B, come back to A, and A is still hidden, which is the span in which
//    the reader actually made the choice.
//
// No corpus donor either way: anvil's two resizable sidebars (`app/src/read/Sidebar.svelte`,
// `app/src/editor/Sidebar.svelte`) persist WIDTH in localStorage under a flat global key and have no
// collapse at all, so the corpus has nothing to say about persisting a hidden panel. Stated rather
// than stretched.

/** The per-exhibit collapse key — `archie.narrativeAsideCollapsed.v1:<slug>`. */
export function scopedKey(base: string, scope: string): string {
  return `${base}:${scope}`;
}

/** Read the session-scoped collapsed flag (default: expanded). */
export function loadSessionCollapsed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Persist the session-scoped collapsed flag. Private-mode throws are swallowed. */
export function saveSessionCollapsed(key: string, collapsed: boolean): void {
  try {
    sessionStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    /* private mode — harmless */
  }
}
