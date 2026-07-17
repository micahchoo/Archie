// Library Gallery view logic (SCALE-GALLERY Phase 3.3 / spike-0004 §2, §4). Pure, headless — the
// component (Gallery.svelte) owns chrome; this owns "which views exist" and "what a search shows".
// One search box filters the ACTIVE view by TITLE via the shared `matchesTitle` primitive (case- and
// diacritic-insensitive substring — @render/core), so exhibit-card and image-wall search behave identically.

import { matchesTitle, type ImageIndex, type ImageIndexEntry } from "@render/core";

/** The Gallery's two views: exhibit cards (always) and the all-images wall (only when an index loaded). */
export type GalleryView = "exhibits" | "wall";

/** The wall is offered ONLY when a non-empty image index loaded (ADR-0023 degradation: a missing/empty
 *  index → no wall toggle; cards still work from exhibits.json). */
export function hasWall(index: ImageIndex | null | undefined): boolean {
  return !!index && index.images.length > 0;
}

/** Exhibit cards filtered by exhibit title (empty/whitespace query → all). */
export function filterExhibits<T extends { title: string }>(cards: readonly T[], query: string): T[] {
  return cards.filter((c) => matchesTitle(c.title, query));
}

/** Image-index entries filtered by object title (empty/whitespace query → all). */
export function filterImages(images: readonly ImageIndexEntry[], query: string): ImageIndexEntry[] {
  return images.filter((e) => matchesTitle(e.title, query));
}

/**
 * Merge the LIVE working-store wall over the HOSTED one (STALENESS st3) — the image-index twin of
 * `mergeGalleries`. Live images front; hosted entries for a slug the live source FRONTS (`liveSlugs`) are
 * DROPPED. Without this, `loadImageIndex` returned the hosted index alone while `mergeGalleries` fronted
 * live exhibits — so a colliding-slug wall tile routed to the LIVE exhibit but carried a HOSTED object id,
 * a dead link. Pure; returns `null` only when neither source exists (→ no wall, ADR-0023 degradation).
 */
export function mergeImageIndex(
  live: ImageIndex | null,
  hosted: ImageIndex | null,
  liveSlugs: ReadonlySet<string>,
): ImageIndex | null {
  if (!live && !hosted) return null;
  const liveImages = live?.images ?? [];
  const hostedImages = (hosted?.images ?? []).filter((e) => !liveSlugs.has(e.exhibitSlug)); // drop stale/collision
  return { images: [...liveImages, ...hostedImages] };
}

/** The in-app hash route for an image on the wall → the Object in its published Exhibit (existing grammar
 *  `#/<slug>/o/<id>`; the index's objectId IS the bare object id). No new routing. */
export function wallHref(entry: ImageIndexEntry): string {
  return `#/${entry.exhibitSlug}/o/${entry.objectId}`;
}
