// The deep-zoom READER (ADR-0019) — LAZY-imported when an object is opened, so the gallery/grid path
// never pulls OpenSeadragon into the initial render. Built on `createReadOnlyMount` (render-mount):
// OSD kept, NO Annotorious / pixi (the DOM-SVG overlay), NO unsafe-eval (ADR-0019 keystone).
//
// This module is the ONLY place that imports @render/mount, so the element can `await import("./reader.js")`
// to defer the OSD weight. The element passes the chosen object + its head notes + the offline flag.
//
// Phase 7: this surface OWNS the note card (the image half of the openNote contract — the AV player
// owns the other half), and it passes a per-annotation STYLE RESOLVER through the mount's new style
// channel (render-mount read-overlay styleFor) instead of running the reading-marks post-pass.
// reading-marks.ts is gone: the overlay draws AND styles each mark in one pass, so there is no
// DOM-order pairing, no count-mismatch refusal and no deferred-draw retry loop to maintain — the
// style resolver is derived HERE from the caller's reading colours (reading-layer colourOf) +
// BASE_MARK_COLOUR + render-core's readingMarkerStyle, the ONE source of the 0.18/0.95/2 numbers.

import {
  createReadOnlyMount,
  type ReadOnlyMountSurface,
} from "@render/mount";
import { commentOfAnnotation, stripMarkdown, readingMarkerStyle, emphasisOf } from "@render/core";
import type { AnnotationLike, W3CAnnotation } from "@render/core";
import { isRemoteSource, OfflineRemoteBlockedError, type OpenObjectOptions } from "./reader-guards.js";
import { BASE_MARK_COLOUR } from "./reader-chrome.js";
import { createNoteCard } from "./note-card.js";

/**
 * The surface the EMBED holds: the read-only mount contract plus the reader's two additions —
 * `showAnnotations`, the ONE path that replaces the drawn set (the mount's style channel recolours
 * every mark at draw time, so a legend switch can never forget the colour pass), and `openNote`,
 * the image half of the openNote contract (select + fit + show the note's body in the surface's
 * own card). The AV player exposes the same `openNote(id): boolean` shape.
 */
export interface EmbedReaderSurface extends ReadOnlyMountSurface {
  showAnnotations(annotations: W3CAnnotation[]): void;
  openNote(id: string): boolean;
}

// Re-exported so this module stays the one-stop reader surface for its own importers (reader.test.ts,
// the lazy `import("./reader.js")` site). The DEFINITIONS live in reader-guards.ts precisely so the
// EAGER graph — index.ts's barrel, element.ts's `instanceof` — can reach them without pulling OSD in.
// Import them from ./reader-guards.js there, never from here; see that module's header.
export { isRemoteSource, OfflineRemoteBlockedError, type OpenObjectOptions };

/**
 * Accessible-name source for the overlay's region shapes (Archie-9413): id → the FIRST comment line
 * whose PLAIN text is non-empty (render-core's canonical `stripMarkdown` — the same strip the
 * viewer's list snippets use), so a shape announces a human name instead of "annotation <rawULID>".
 * "First non-empty AFTER stripping" matters: a comment that OPENS with a markdown-only line (an
 * image, say) still announces its real text below, not the raw id. The text comes from
 * `commentOfAnnotation` (the published-query body read) — NEVER from selector values. Unknown id or
 * a comment with no plain text at all falls back to the overlay's own `annotation <id>` form (which
 * caps the attribute length — hostile-content AT DoS is handled at that one chokepoint).
 */
export function labelFromAnnotations(annotations: W3CAnnotation[]): (id: string) => string {
  const byId = new Map(annotations.map((a) => [String((a as AnnotationLike).id ?? ""), a]));
  return (id) => {
    const ann = byId.get(id);
    if (!ann) return `annotation ${id}`;
    for (const line of commentOfAnnotation(ann).split("\n")) {
      const label = stripMarkdown(line);
      if (label.length > 0) return label;
    }
    return `annotation ${id}`;
  };
}

// V55's `reserveLocatorSpace` lived here: a ResizeObserver that published the OSD navigator's MEASURED
// height as `--archie-locator-h` so the floating note card could sit clear of the mini-map they were
// both anchored to. The card is DOCKED now (note-card.ts / `.reader-note`), so there is no corner
// contest to arbitrate and nothing to measure. See ADR-0019's layout row.

/**
 * Mount the read-only deep-zoom surface for ONE object into `container`. Resolves once OSD opens.
 * Offline + a remote source → throws OfflineRemoteBlockedError BEFORE constructing OSD (no network
 * touch). The returned surface is the element's handle to setAnnotations / fitBounds / destroy —
 * and now to its own note card (openNote) and the mount's draw-time style channel (styleFor).
 */
export async function openObject(
  container: HTMLElement,
  opts: OpenObjectOptions,
): Promise<EmbedReaderSurface> {
  if (opts.offline && isRemoteSource(opts.object)) {
    throw new OfflineRemoteBlockedError();
  }

  // The surface OWNS the note card (Phase 7 — the openNote contract; the element no longer does).
  // Mounts into the element's `.reader-note` row (handed over as noteCardHost), defaulting to the
  // mount container for programmatic hosts; the sheet layer rides the shadow root (createNoteCard).
  // Declared BEFORE the mount so the mount's own onSelect closure can drive it; if the mount fails
  // (offline-blocked / load error), the catch destroys the card so nothing is orphaned in the
  // element's note row.
  const card = createNoteCard(opts.noteCardHost ?? container);
  // The card resolves ids against the CURRENT projection — re-armed on every showAnnotations, so a
  // legend switch (the reading layer's setReading → showAnnotations) re-targets the card too.
  let current: W3CAnnotation[] = opts.annotations;

  let surface: ReadOnlyMountSurface;
  try {
    surface = await createReadOnlyMount(container, {
      source: opts.object.source,
      ...(opts.object.tileSource ? { tileSource: opts.object.tileSource } : {}),
      ...(opts.canvasId ? { canvasId: opts.canvasId } : {}),
      // V56 canvas half, Phase 7: the mount's per-annotation style channel. Every drawn mark is
      // styled AT DRAW TIME by this resolver — reading colours from the caller (the element's
      // reading layer), base colour fallback, numbers from render-core's readingMarkerStyle. The
      // reading-marks post-pass (DOM-order pairing + 12-frame retry) is what this replaces; the
      // overlay now draws AND styles in one pass, so neither the pairing nor the retry can exist.
      styleFor: (id, ann) => {
        const colour = opts.markColourOf?.(id) ?? BASE_MARK_COLOUR;
        const spec = readingMarkerStyle(colour, emphasisOf(ann));
        return {
          stroke: spec.stroke,
          fill: spec.fill,
          fillOpacity: String(spec.fillOpacity),
          strokeOpacity: String(spec.strokeOpacity),
          strokeWidth: String(spec.strokeWidth),
        };
      },
      // Archie-9413: shapes announce the note's first comment line, not "annotation <rawULID>".
      labelFor: labelFromAnnotations(opts.annotations),
      // Archie-6f25: the locator mini-map, matching the full viewer (Reader.svelte passes `locator`
      // unconditionally too — read-mount mounts it auto-fading, so it stays quiet on small images).
      locator: true,
      // Overlay selection — a region shape click / the whole-object frame / a background click. The
      // CARD is driven here (this surface owns it — see above); the element's onSelect hook only
      // highlights the index row (V70's other direction). A null (background) click hides the card.
      onSelect: (id) => {
        if (id === null) card.hide();
        else card.showNote(current, id);
        opts.onSelect?.(id);
      },
    });
  } catch (e) {
    card.destroy(); // the mount failed — don't leave the card behind in the element's note row
    throw e;
  }

  // ONE path sets the drawn set: the initial load below and every legend switch go through the same
  // function, so the colour pass can never be forgotten by a future caller — the mount's style
  // channel makes recolouring intrinsic to redrawing.
  const showAnnotations = (annotations: W3CAnnotation[]): void => {
    current = annotations;
    surface.setAnnotations(annotations);
  };

  // The image half of the openNote contract: select (visual state) + fit (camera) + show the body
  // (the surface's own card) — the ADR-0006 nav pair the element used to call by hand, plus the
  // card it used to own. False = no such note on this object (nothing opened — the caller keeps the
  // row un-styled, the S1 rule the AV path already enforced).
  const openNote = (id: string): boolean => {
    if (!current.some((a) => String((a as AnnotationLike).id ?? "") === id)) return false;
    surface.setSelected(id);
    surface.fitBounds(id);
    card.showNote(current, id);
    return true;
  };

  showAnnotations(opts.annotations);

  const destroy = surface.destroy;
  return Object.assign(surface, {
    showAnnotations,
    openNote,
    destroy(): void {
      destroy();
      card.destroy();
    },
  });
}
