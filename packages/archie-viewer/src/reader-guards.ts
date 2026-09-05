// The OSD-FREE half of the reader's public surface — the option shape, the offline refusal, and the
// remote-source predicate. Split out of reader.ts so the EAGER graph can name them without dragging
// OpenSeadragon in behind them.
//
// Why this module exists (regression guard, not tidiness): reader.ts is the only importer of
// @render/mount, and element.ts defers it with `await import("./reader.js")`. But two STATIC
// references defeated that entirely — index.ts (the barrel, which IS the bundle entry) re-exported
// `openObject`/`isRemoteSource`/`OfflineRemoteBlockedError` from reader.js, and element.ts imported
// `OfflineRemoteBlockedError` as a value for its `instanceof` check. Either one puts reader.ts in the
// entry's static graph, so the shipped `dist/archie-viewer.js` opened with a top-level
// `import … from "./chunk-<osd>.js"` and every embed paid ~231KB gz of OSD + Annotorious + pixi at
// page load — on the gallery path, before any object is opened.
//
// The rule this encodes: anything the ENTRY graph needs by VALUE lives here; anything that needs a
// canvas lives in reader.ts. A type-only import of reader.ts is always safe (erased); a value import
// is the leak. reader.ts re-exports these, so its own importers (and reader.test.ts) are unaffected.

import { ResourcePolicy } from "./resource-policy.js";
import type { AObject, W3CAnnotation } from "@render/core";

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
  /** Cancel a pending OSD open. The caller owns teardown after the surface has mounted. */
  signal?: AbortSignal;
  /** Fired on overlay selection (the element can drive a sidebar / deep-link). */
  onSelect?: (id: string | null) => void;
  /** V56: annotation id → its Reading's colour (undefined = a base note, which takes the BASE
   *  colour). The reader derives the mount's per-annotation style resolver from these colours —
   *  readingMarkerStyle + emphasis, applied at DRAW TIME via the mount's style channel (Phase 7;
   *  the reading-marks post-pass it replaces is gone). */
  markColourOf?: (id: string) => string | undefined;
  /** The row the surface mounts its OWN note card into (the element's `.reader-note`, below the
   *  canvas). Defaults to the mount container. Phase 7: the surface owns the card — `openNote`
   *  drives it — so the element's card-ownership bifurcation with the AV player is gone. */
  noteCardHost?: HTMLElement;
}

/** Thrown when an offline embed is asked to open a remote-sourced object. The element catches this to
 *  render a "this item lives online; this embed is offline" notice instead of a failed canvas.
 *  Lives here, not in reader.ts: element.ts needs it by VALUE (`instanceof`) on the eager path. */
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
  const policy = new ResourcePolicy(true);
  const local = (u: string): boolean => policy.allows(u);
  // A structured xyz/dzi descriptor overrides the source string (model.ts): classify by its URLs.
  const ts = object.tileSource as { url?: string; infoUrl?: string; template?: string; tilesUrl?: string; filesPath?: string } | undefined;
  if (ts) {
    const urls = [ts.url, ts.infoUrl, ts.template, ts.tilesUrl, ts.filesPath].filter((u): u is string => typeof u === "string");
    return urls.length === 0 ? !local(object.source) : urls.some((u) => !local(u));
  }
  return !local(object.source);
}
