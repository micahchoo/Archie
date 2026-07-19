// The ONE modality implementation (Archie-5968, decision Archie-389f) — CONTEXT.md → Surfaces.
//
// Every scrimmed surface (dialog OR drawer — the distinction is presentational, never semantic) shares
// this module for the three things a modal must get right, so no surface hand-rolls them and they can't
// drift apart the way the old per-surface copies did:
//
//   1. The single-scrim invariant — at most ONE scrimmed surface exists at a time. A surface registers
//      itself on mount (`use:scrimmed`); registering while another is current REPLACES it (the previous
//      one's `onClose` fires, so opening a dialog closes an open drawer and vice versa) — the opener
//      never has to know which other surfaces exist.
//   2. The dismissal contract — the Esc ladder (topmost floater, else the one scrimmed surface),
//      scrim-click = Esc, focus trapped inside the surface and returned to its opener on close. NO
//      close-confirmations live here (autosave makes dismissal lossless — CONTEXT.md).
//   3. Focus management — first focusable focused on open, Tab wraps inside the surface, focus returns
//      to whatever was focused when the surface (or the surface it replaced) first opened.
//
// The state-machine core (present/replace/release + the Esc ladder) is DOM-free and unit-tested
// headlessly (modality.svelte.test.ts); the DOM edges (initial focus, Tab-trap, opener capture) live in
// the `scrimmed`/`trapFocus`/`floating` glue below. `restore` is a callback, not an element, precisely so
// the core needs no DOM. There is deliberately NO window listener here: App.svelte owns the single global
// keydown and routes the ladder through `modality.handleEsc()`, keeping one keyboard entry point.

interface ScrimHandle {
  id: number;
  /** Flips the surface's parent `open` bool false — the surface then unmounts and `release` fires. */
  onClose: () => void;
  /** Return focus to the surface's opener. A no-op token in headless tests. */
  restore: () => void;
  /** The surface's panel — used on a replace to decide whether the replacer's opener will survive. */
  node: { contains(el: unknown): boolean } | null;
  /** The element focused when THIS surface opened (its opener). Null = none/unknown. */
  opener: unknown;
}
interface FloaterHandle {
  id: number;
  close: () => void;
}

const s = $state<{ current: ScrimHandle | null; floaters: FloaterHandle[] }>({ current: null, floaters: [] });

let seq = 0;
/** A process-unique handle id — lets the action key its registration without a DOM node (so the core stays testable). */
export function nextModalityId(): number {
  return ++seq;
}

/** Register a scrimmed surface, enforcing single-scrim. If another is current, it is REPLACED.
 *
 *  Focus-return on a replace is opener-directed: the replacement inherits the previous surface's
 *  `restore` target ONLY when its own opener is about to unmount — i.e. the new surface was opened from
 *  INSIDE the one it replaces (opener contained in `prev.node`), or captured no opener at all. A surface
 *  opened from the still-present PAGE (a page button that survives the replace) keeps its OWN opener, so
 *  closing it returns focus to what the user actually clicked — not to a control in the vanished surface. */
export function presentScrim(handle: ScrimHandle): void {
  const prev = s.current;
  if (prev && prev.id !== handle.id) {
    const openerWillUnmount = handle.opener == null || (prev.node?.contains(handle.opener) ?? false);
    s.current = openerWillUnmount ? { ...handle, restore: prev.restore } : handle;
    prev.onClose();
  } else {
    s.current = handle;
  }
}

/** Called when a surface unmounts. Restores focus ONLY if this surface is still the current one — if it
 *  was replaced, the replacer now owns focus and this must be a silent no-op. */
export function releaseScrim(id: number): void {
  if (s.current && s.current.id === id) {
    const restore = s.current.restore;
    s.current = null;
    restore();
  }
}

/** Register an unscrimmed floater (an open menu/popover over a still-usable page). Returns an unregister. */
export function registerFloater(handle: FloaterHandle): () => void {
  s.floaters = [...s.floaters, handle];
  return () => {
    s.floaters = s.floaters.filter((f) => f.id !== handle.id);
  };
}

/** The shared dismissal ladder (CONTEXT.md): topmost floater first, else the one scrimmed surface.
 *  Returns true if it handled the Esc — App.svelte's global keydown falls through to the page-level
 *  ladder (selection / framing / view-nav) only when this returns false. */
export function handleEsc(): boolean {
  const topFloater = s.floaters[s.floaters.length - 1];
  if (topFloater) {
    topFloater.close();
    return true;
  }
  if (s.current) {
    s.current.onClose();
    return true;
  }
  return false;
}

/** Dismiss the current scrimmed surface — the scrim-click handler (scrim-click = Esc). */
export function dismissScrim(): void {
  s.current?.onClose();
}

/** The reactive facade components/App read (getters keep the module-singleton `$state` live across imports). */
export const modality = {
  get hasScrim(): boolean {
    return s.current !== null;
  },
  get hasFloater(): boolean {
    return s.floaters.length > 0;
  },
  handleEsc,
  dismiss: dismissScrim,
};

// --- DOM glue (actions + the Tab-trap keydown handler) — not exercised by the headless unit tests. ---

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusablesWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

/**
 * `use:scrimmed={{ onClose }}` on a scrimmed surface's panel. Presents to the store (single-scrim),
 * focuses the first control, and on unmount releases + returns focus to the opener. Pair it with
 * `onkeydown={trapFocus}` on the same panel (Tab-trap) and `onclick={() => modality.dismiss()}` on the
 * scrim (scrim-click = Esc). Esc itself is delivered by App.svelte's global keydown → `handleEsc`.
 */
export function scrimmed(node: HTMLElement, params: { onClose: () => void }) {
  const id = nextModalityId();
  let onClose = params.onClose;
  const opener = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  presentScrim({ id, onClose: () => onClose(), restore: () => opener?.focus?.(), node, opener });
  const first = focusablesWithin(node)[0];
  (first ?? node).focus?.();
  return {
    update(p: { onClose: () => void }) {
      onClose = p.onClose;
    },
    destroy() {
      releaseScrim(id);
    },
  };
}

/** Tab-trap for a scrimmed panel: wraps focus within the panel rather than escaping to the inert page.
 *  Uses `e.currentTarget` as the container so it can be wired declaratively (`onkeydown={trapFocus}`),
 *  which also satisfies svelte-check's a11y click/keyboard pairing on the `role="dialog"` panel. */
export function trapFocus(e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const container = e.currentTarget as HTMLElement | null;
  if (!container) return;
  const focusables = focusablesWithin(container);
  if (focusables.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = document.activeElement;
  const inside = container.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

/** `use:floating={{ onClose }}` on an unscrimmed floater (e.g. the help menu) so Esc closes it first
 *  via the shared ladder. No focus trap — a floater leaves the page usable (CONTEXT.md → Floater). */
export function floating(node: HTMLElement, params: { onClose: () => void }) {
  const id = nextModalityId();
  let onClose = params.onClose;
  const unregister = registerFloater({ id, close: () => onClose() });
  return {
    update(p: { onClose: () => void }) {
      onClose = p.onClose;
    },
    destroy() {
      unregister();
    },
  };
}

/** Test seam (module-singleton pattern, cf. reloadViewPrefsForTests): clear all modality state. */
export function _resetModalityForTests(): void {
  s.current = null;
  s.floaters = [];
  seq = 0;
}
