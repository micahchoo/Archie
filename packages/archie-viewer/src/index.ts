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
 * Mount the read-only deep-zoom surface for ONE object into `container` (see reader.ts for the real
 * implementation and its contract). Lazy by construction: the OSD chunk is fetched on the first call,
 * not at import. Programmatic callers see no difference — same signature, same returned Promise.
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
