// @render/archie-viewer — the <archie-viewer> embeddable custom element (ADR-0019).
//
// Importing this module REGISTERS the element (the jsDelivr `<script src=…><archie-viewer>` use:
// side-effect registration is what a CDN embed expects). The class + seams are also named-exported for
// programmatic use (e.g. registering under a custom tag, or driving openFile in a host app).

export { ArchieViewerElement, defineArchieViewer } from "./element.js";
export {
  openLibraryFromFile,
  openLibraryFromSrc,
  openLibraryFromTree,
  openZipBytes,
  openFilesystem,
  readExhibit,
  SRC_MAX_BYTES,
  type LoadedLibrary,
} from "./load.js";
// The OSD-free reader surface re-exports directly. `openObject` deliberately does NOT: a static
// re-export from reader.js puts OpenSeadragon in THIS module's graph, and this module is the bundle
// entry — every embed would download the canvas engine before opening anything. The wrapper below
// keeps the public API byte-identical to callers (it was already async) while deferring that weight.
export { isRemoteSource, OfflineRemoteBlockedError, type OpenObjectOptions } from "./reader-guards.js";

import type { ReadOnlyMountSurface } from "@render/mount";
import type { OpenObjectOptions } from "./reader-guards.js";

/**
 * LOW-LEVEL MOUNT (Phase 7 — demoted, deliberately). Mount the read-only deep-zoom surface for ONE
 * object into `container`. The ELEMENT is the documented entrance: <archie-viewer> owns the reading
 * layer, the note card, the chrome, the address ladder and the style channel — this wrapper exposes
 * NONE of that. It is the raw OSD mount for a programmatic host that wants a bare canvas + overlay
 * and is willing to feed it annotations + a `markColourOf`/`styleFor` channel itself. Kept rather
 * than deleted because the wrapper is cheap and programmatic hosts exist; the element's #openObject
 * does NOT go through here (it lazy-imports reader.js directly so the reading layer's options — the
 * noteCardHost, the layer-bound colour source — stay element-private).
 *
 * Lazy by construction: the OSD chunk is fetched on the first call, not at import. Programmatic
 * callers see no difference — same signature, same returned Promise.
 */
export async function openObject(
  container: HTMLElement,
  opts: OpenObjectOptions,
): Promise<ReadOnlyMountSurface> {
  const { openObject: open } = await import("./reader.js");
  return open(container, opts);
}

import { defineArchieViewer } from "./element.js";
defineArchieViewer();
