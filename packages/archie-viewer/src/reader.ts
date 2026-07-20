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
import type { AObject, AnnotationLike, W3CAnnotation } from "@render/core";

/** What the element hands the reader to open one object: the object (source/tileSource), its published
 *  head notes (rendered as overlay regions), the canvas IRI annotations target, and the offline flag. */
export interface OpenObjectOptions {
  object: AObject;
  /** Published head notes for this object — geometry-only overlay regions (read-overlay.ts). */
  annotations: W3CAnnotation[];
  /** The canvas IRI the annotations target (defaults to the object source). */
  canvasId?: string;
  /** When true, refuse to mount a REMOTE source (http/https) — offline embeds show only embedded
   *  (blob:/data:) media. Gates the remote tile/media fetch at the mount boundary (ADR-0019 offline). */
  offline?: boolean;
  /** Fired on overlay selection (the element can drive a sidebar / deep-link). */
  onSelect?: (id: string | null) => void;
}

/** Thrown when an offline embed is asked to open a remote-sourced object. The element catches this to
 *  render a "this item lives online; this embed is offline" notice instead of a failed canvas. */
export class OfflineRemoteBlockedError extends Error {
  constructor() {
    super("This item is hosted online and can't be shown while the viewer is offline.");
    this.name = "OfflineRemoteBlockedError";
  }
}

/** A source is REMOTE if it fetches over the network. `blob:` and `data:` are in-document (embedded
 *  assets the portable load minted) and are always allowed; everything else (http/https/IIIF info.json,
 *  protocol-relative) is remote. A structured tileSource is remote unless every URL in it is blob/data. */
export function isRemoteSource(object: AObject): boolean {
  const local = (u: string): boolean => u.startsWith("blob:") || u.startsWith("data:");
  // A structured xyz/dzi descriptor overrides the source string (model.ts): classify by its URLs.
  const ts = object.tileSource as { url?: string; tilesUrl?: string; filesPath?: string } | undefined;
  if (ts) {
    const urls = [ts.url, ts.tilesUrl, ts.filesPath].filter((u): u is string => typeof u === "string");
    return urls.length === 0 ? !local(object.source) : urls.some((u) => !local(u));
  }
  return !local(object.source);
}

/**
 * Accessible-name source for the overlay's region shapes (Archie-9413): id → the note's FIRST comment
 * line as PLAIN text (render-core's canonical `stripMarkdown` — the same strip the viewer's list
 * snippets use), so a shape announces a human name instead of "annotation <rawULID>". The text comes
 * from `commentOfAnnotation` (the published-query body read) — NEVER from selector values. Unknown id or
 * an empty comment falls back to the overlay's own `annotation <id>` form.
 */
export function labelFromAnnotations(annotations: W3CAnnotation[]): (id: string) => string {
  return (id) => {
    const ann = annotations.find((a) => String((a as AnnotationLike).id ?? "") === id);
    if (!ann) return `annotation ${id}`;
    const firstLine = commentOfAnnotation(ann).split("\n").find((l) => l.trim().length > 0) ?? "";
    const label = stripMarkdown(firstLine);
    return label.length > 0 ? label : `annotation ${id}`;
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
