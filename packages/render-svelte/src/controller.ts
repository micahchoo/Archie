// CanvasController — the @render/svelte adapter's binding LOGIC (ADR-0002 / Q-2; spike-0001
// module-1 inversion). Kept as plain TS (not runes) so it is fully testable with a mock
// MountSurface and so the "valuable shared thing is logic, not components" premise holds.
// Canvas.svelte is a thin reactive shell that wires this to Svelte $state.

import type { MountSurface, SelectionId } from "@render/mount";

export interface CanvasController {
  /** The current selection (mirrors the surface). */
  readonly selected: SelectionId | null;
  /** Programmatic select (sidebar / deep-link): drives the surface + fits the viewport. */
  select(id: SelectionId | null): void;
  /** Subscribe to selection changes (both user-driven and programmatic). Returns unsubscribe. */
  onSelectChange(cb: (id: SelectionId | null) => void): () => void;
  /** Tear down: unsubscribe from the surface and destroy it. */
  destroy(): void;
}

export function createCanvasController(surface: MountSurface): CanvasController {
  let selected: SelectionId | null = null;
  const subs = new Set<(id: SelectionId | null) => void>();
  const notify = (id: SelectionId | null): void => {
    for (const s of subs) s(id);
  };

  // INVERSION: user selection on the surface flows IN here (replaces anvil's $effect on
  // selectedId). It updates state + notifies, but must NOT re-drive the surface (no loop).
  const unsub = surface.onSelect((id) => {
    selected = id;
    notify(id);
  });

  return {
    get selected() {
      return selected;
    },
    select(id) {
      selected = id;
      surface.setSelected(id);
      if (id !== null) surface.fitBounds(id);
      notify(id);
    },
    onSelectChange(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    destroy() {
      unsub();
      subs.clear();
      surface.destroy();
    },
  };
}
