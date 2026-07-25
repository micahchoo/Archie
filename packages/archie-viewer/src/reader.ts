// The deep-zoom READER (ADR-0019) — LAZY-imported when an object is opened, so the gallery/grid path
// never pulls OpenSeadragon into the initial render. Built on `createReadOnlyMount` (render-mount):
// OSD kept, NO Annotorious / pixi (the DOM-SVG overlay), NO unsafe-eval (ADR-0019 keystone).
//
// This module is the ONLY place that imports @render/mount, so the element can `await import("./reader.js")`
// to defer the OSD weight. The element passes the chosen object + its head notes + the offline flag.

import {
  createReadOnlyMount,
  type ReadOnlyMountSurface,
} from "@render/mount";
import { commentOfAnnotation, stripMarkdown } from "@render/core";
import type { AnnotationLike, W3CAnnotation } from "@render/core";
import { isRemoteSource, OfflineRemoteBlockedError, type OpenObjectOptions } from "./reader-guards.js";

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

/**
 * Mount the read-only deep-zoom surface for ONE object into `container`. Resolves once OSD opens.
 * Offline + a remote source → throws OfflineRemoteBlockedError BEFORE constructing OSD (no network
 * touch). The returned surface is the element's handle to setAnnotations / fitBounds / destroy.
 */
export async function openObject(
  container: HTMLElement,
  opts: OpenObjectOptions,
): Promise<ReadOnlyMountSurface> {
  if (opts.offline && isRemoteSource(opts.object)) {
    throw new OfflineRemoteBlockedError();
  }

  const surface = await createReadOnlyMount(container, {
    source: opts.object.source,
    ...(opts.object.tileSource ? { tileSource: opts.object.tileSource } : {}),
    ...(opts.canvasId ? { canvasId: opts.canvasId } : {}),
    ...(opts.onSelect ? { onSelect: opts.onSelect } : {}),
    // Archie-9413: shapes announce the note's first comment line, not "annotation <rawULID>".
    labelFor: labelFromAnnotations(opts.annotations),
    // Archie-6f25: the locator mini-map, matching the full viewer (Reader.svelte passes `locator`
    // unconditionally too — read-mount mounts it auto-fading, so it stays quiet on small images).
    locator: true,
  });

  surface.setAnnotations(opts.annotations);
  return surface;
}
