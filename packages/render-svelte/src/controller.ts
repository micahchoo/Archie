// The @render/svelte adapter's binding LOGIC (ADR-0002 / Q-2; spike-0001 module-1 inversion) —
// createCanvasController for selection, createDotLayer for the LOD far-band dots (Archie-c1d9).
// Kept as plain TS (not runes) so it is fully testable with a mock MountSurface and so the
// "valuable shared thing is logic, not components" premise holds. Canvas.svelte is a thin reactive
// shell that wires this to Svelte $state.

import { dotsVisibleForBand, zoomBand } from "@render/core";
import type { MountSurface, ScreenRect, SelectionId, ZoomBand } from "@render/mount";

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

export interface ControllerOptions {
  /** Zoom to a marker when the USER selects it on the surface (reader UX). setSelected is the
   *  feedback-loop hazard the inversion guards against — fitBounds is not; it only moves the
   *  camera. Off by default: an EDITING canvas (Studio) anchors a popover to the marker instead,
   *  and zooming under it would be disruptive. */
  zoomOnSurfaceSelect?: boolean;
}

export function createCanvasController(surface: MountSurface, opts: ControllerOptions = {}): CanvasController {
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
    if (opts.zoomOnSurfaceSelect && id !== null) surface.fitBounds(id);
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

// ---------------------------------------------------------------------------
// createDotLayer — the LOD far-band dot SOLVER (Archie-c1d9), inverted into plain TS the same way
// createCanvasController owns selection binding. At the FAR band a region outline is a near-invisible
// few-pixel box, so the canvas paints a small dot per note at its marker's on-screen centre as a
// LOCATION signal; the dots hide in mid/near where the real WebGL marks carry the signal. This owns:
//   - the band gate (`dotsVisibleForBand` — the ONE band→visibility rule),
//   - the rAF throttle (at most one solve per frame regardless of how often OSD fires update-viewport),
//   - the rect solve (markerScreenRects — the same batched stream the marginalia rail uses).
// Canvas.svelte renders the solved state ($state band + rects) and never touches the surface here.
// ---------------------------------------------------------------------------

/** The surface reads the dot solver needs — the two MountSurface members it touches. */
export type DotLayerSurface = Pick<MountSurface, "getZoomRatio" | "markerScreenRects">;

/** One solved frame: the band the viewport is on + the per-dot screen rects for that solve. */
export interface DotLayerSolved {
  /** The band the last solve landed on — the template's visibility gate reads this. Updated on
   *  EVERY solve (an off-band solve flips the gate off). */
  band: ZoomBand;
  /** Per-dot screen rects (unresolvable ids → null). STALE on off-band solves: the rect pass is
   *  skipped entirely (review nit — no O(annotations) read when the {#each} is hidden anyway), so
   *  the previous solve's rects ride along until the viewport returns to the far band. */
  rects: Record<string, ScreenRect | null>;
}

export interface DotLayer {
  /** Re-solve on the next frame. rAF-throttled: a pending solve swallows further requests, and an
   *  empty/undefined dot set schedules nothing. */
  requestSolve(): void;
  /** Subscribe to solved frames (band always; rects refreshed only on visible bands). Returns unsubscribe. */
  onSolve(cb: (solved: DotLayerSolved) => void): () => void;
  /** Tear down: cancel any pending solve and drop subscribers. */
  destroy(): void;
}

export interface DotLayerOptions {
  /** Frame scheduler, default requestAnimationFrame — injectable so the throttle is headless-testable. */
  scheduleFrame?: (cb: () => void) => () => void;
}

export function createDotLayer(
  surface: DotLayerSurface,
  getDots: () => readonly { id: string }[] | undefined,
  opts: DotLayerOptions = {},
): DotLayer {
  const scheduleFrame =
    opts.scheduleFrame ?? ((cb) => { const h = requestAnimationFrame(cb); return () => cancelAnimationFrame(h); });
  // Initial "far" + {} matches Canvas's pre-solve $state: the gate is open but the {#each} is empty.
  let band: ZoomBand = "far";
  let rects: Record<string, ScreenRect | null> = {};
  let cancelPending: (() => void) | null = null;
  const subs = new Set<(solved: DotLayerSolved) => void>();
  const notify = (solved: DotLayerSolved): void => {
    for (const s of subs) s(solved);
  };

  return {
    requestSolve() {
      // Read dots at REQUEST time for the emptiness gate (no dots → nothing to schedule) …
      const dots = getDots();
      if (!dots || dots.length === 0 || cancelPending) return;
      cancelPending = scheduleFrame(() => {
        cancelPending = null;
        // … and re-read at FRAME time: the prop may have changed between request and paint.
        const dots = getDots();
        if (!dots || dots.length === 0) return;
        band = zoomBand(surface.getZoomRatio());
        // Off-band the {#each} is gone entirely — flip the gate, skip the rect pass too (review nit).
        if (!dotsVisibleForBand(band)) { notify({ band, rects }); return; }
        rects = surface.markerScreenRects(dots.map((d) => d.id));
        notify({ band, rects });
      });
    },
    onSolve(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    destroy() {
      cancelPending?.();
      cancelPending = null;
      subs.clear();
    },
  };
}
