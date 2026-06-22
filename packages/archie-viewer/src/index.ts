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
export { openObject, isRemoteSource, OfflineRemoteBlockedError, type OpenObjectOptions } from "./reader.js";

import { defineArchieViewer } from "./element.js";
defineArchieViewer();
