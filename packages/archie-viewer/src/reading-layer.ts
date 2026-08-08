// reading-layer — the ONE owner of the embed's Reading layer (Phase 7 of the architecture deepening).
//
// LAZY BY CONSTRUCTION, like reader.ts: element.ts imports this module with `await import(...)`, so
// none of it — its reader-chrome + render-core query edges — is in the entry's static closure
// (.claude/rules/archie-viewer-eager-closure.md). It replaces the element's four scattered fields
// (#activeReading / #markColours / #reloadAnnotations / #layerNotes) with ONE controller handle.
//
// WHAT IT OWNS (the projection):
//   - the ACTIVE READING id — the layer of an interpretive pass overlaid on the always-visible base
//     (ADR-0007 / Q16),
//   - the notes ON the canvas: base + the active reading's overlay (reader-chrome's annotationsFor),
//   - which note gets which colour (reader-chrome's readingColourById, per object),
//   - the BASE colour for notes that belong to no Reading (reader-chrome's BASE_MARK_COLOUR), and
//   - the canvas paint: `setReading` repaints the surface (through the mount's style channel, via
//     the element's onRepaint hook) AND rebuilds the chrome's list + legend (onRebuild) in ONE call —
//     the element's old #setReading ordering hazard (V56: the colour map consulted before it was
//     built, every mark base grey) is structurally impossible because the projection, the colour
//     cache and the repaint live behind the SAME handle, and setObject() runs before any surface
//     mounts.
//
// THE LIFETIME RULES ARE CODE, NOT PROSE. The element's docblock used to describe them and was wrong
// twice; this module asserts them:
//
//   PERSIST ACROSS OBJECTS — the layer is EXHIBIT-scoped: `setObject(objectId)` re-binds the
//   projection (notes + colours) to the next object while the ACTIVE READING stays put. A reader
//   comparing one pass across a 12-folio manuscript is not dropped back to base every time they
//   press Next, and the legend's radio state still says the layer is on.
//
//   RESET ACROSS EXHIBITS — the layer is CREATED per exhibit (element.ts #openExhibit), starting at
//   base-only, and the old one is dropped. A Reading id is exhibit-scoped ({slug}/readings.json) and
//   means nothing in the next exhibit; the reset is not a call someone can forget, it is the fresh
//   instance. (`voynich` and `voynich-rosettes` publish the SAME ids — cipher/hoax/abjad — so a
//   carry-over would silently activate a different curator's layer.)
//
// Both halves are asserted end-to-end by recipes/smoke.mjs in a real browser ("a reading survives
// stepping to the next object (V56)" / "a Reading does not follow you into another exhibit (V56)").

import type { PortableExhibit, W3CAnnotation } from "@render/core";
import { annotationsFor, readingColourById, BASE_MARK_COLOUR } from "./reader-chrome.js";

export interface ReadingLayerOptions {
  /** The exhibit this layer is scoped to. One layer per exhibit — see the header's reset rule. */
  exhibit: PortableExhibit;
  /** Repaint the canvas with a projected note list (the element's surface.showAnnotations — the
   *  mount's style channel colours each mark at draw time, so repainting IS recolouring). */
  onRepaint: (annotations: W3CAnnotation[]) => void;
  /** Rebuild the reading chrome (the note list + the legend) for the current object — the element
   *  destroys and remounts the aside. Runs AFTER the repaint, so the legend's radio state reads the
   *  layer that just got painted. */
  onRebuild: () => void;
}

export interface ReadingLayer {
  /** Point the projection at an object WITHIN this exhibit (object stepping / grid round-trips) —
   *  the active reading persists (the header's persist rule). Runs before any surface mounts, so a
   *  style resolver can never see the previous object's colour map (the V56 hazard). */
  setObject(objectId: string): void;
  /** The notes ON the canvas for the open object under the active reading: base + the overlay
   *  (reader-chrome annotationsFor). The list, the legend counts and the marks all read this one
   *  projection, so the index can never disagree with the canvas. */
  notes(): W3CAnnotation[];
  /** The active reading id — null = base only. */
  readingId(): string | null;
  /** annotation id → its Reading's colour for the OPEN object. Absent = a base note (the reader's
   *  style derivation falls back to BASE_MARK_COLOUR, so the canvas and the legend's "General
   *  notes" swatch agree about what base looks like). */
  colourOf(annotationId: string): string | undefined;
  /** Switch the visible Reading layer: set the id, repaint the canvas and rebuild the legend in ONE
   *  call — no torn intermediate state where the canvas shows one layer and the legend claims
   *  another (the #setReading ordering hazard V56 shipped once). */
  setReading(id: string | null): void;
}

/**
 * Create the exhibit-scoped Reading layer (see the header for the lifetime rules it asserts).
 * `onRepaint`/`onRebuild` are the element's hooks — the layer owns WHAT to project and WHEN to
 * repaint; the element owns the DOM it paints into.
 */
export function createReadingLayer(opts: ReadingLayerOptions): ReadingLayer {
  let activeReading: string | null = null;
  let objectId: string | null = null;
  // annotation id → colour for the CURRENT object. Rebuilt on setObject (readingColourById), never
  // consulted before it is — setObject runs before any surface mounts (element.ts #openObject).
  let colourById: Record<string, string> = {};

  return {
    setObject(id: string): void {
      objectId = id;
      colourById = readingColourById(opts.exhibit, id);
    },
    notes(): W3CAnnotation[] {
      return objectId === null ? [] : annotationsFor(opts.exhibit, objectId, activeReading);
    },
    readingId(): string | null {
      return activeReading;
    },
    colourOf(annotationId: string): string | undefined {
      return colourById[annotationId];
    },
    setReading(id: string | null): void {
      activeReading = id;
      opts.onRepaint(this.notes());
      opts.onRebuild();
    },
  };
}
