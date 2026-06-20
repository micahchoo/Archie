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
