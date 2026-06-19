// Shared Svelte context for the cite-card layer: the gallery index (exhibits.json) flows from
// ViewerShell down to every prose renderer (ProseCites) so an exhibit cite can resolve its cover +
// title WITHOUT prop-drilling through ExhibitView/Reader/NarrativeReader. The ref is a getter object
// over ViewerShell's reactive `gallery` $state, so consumers stay reactive as the library loads.
import type { ExhibitsJson } from "@render/core";

export const CITE_GALLERY = Symbol("cite-gallery");

/** A live handle to the loaded gallery index (null until the library loads). */
export interface GalleryRef {
  readonly value: ExhibitsJson | null;
}
