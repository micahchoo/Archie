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

/**
 * The LISTED enumeration (Archie-77b2): the public hall shows only cards the producer did NOT mark
 * `unlisted`. Default LISTED — a card without the flag stays in the hall (zero change for existing
 * exhibits). An unlisted exhibit is still reachable by direct URL (its `/{slug}/` page is built); this
 * only drops it from the hall's cards. Pure — the component composes it with title-search + sort.
 */
export function listedExhibits<T extends { slug: string; unlisted?: boolean }>(cards: readonly T[]): T[] {
  return cards.filter((c) => !c.unlisted);
}

/** Slugs the hall HIDES (unlisted) — so their tiles also drop from the all-images wall, keeping an
 *  unlisted exhibit out of the WHOLE hall surface, not just the cards. Empty set = nothing hidden. */
export function unlistedSlugSet(cards: readonly { slug: string; unlisted?: boolean }[]): Set<string> {
  return new Set(cards.filter((c) => c.unlisted).map((c) => c.slug));
}

/** Image-index entries filtered by object title (empty/whitespace query → all). */
export function filterImages(images: readonly ImageIndexEntry[], query: string): ImageIndexEntry[] {
  return images.filter((e) => matchesTitle(e.title, query));
}

/**
 * Is a search live? (audit V6 — the read-side twin of Studio's W7.)
 *
 * The lens used to govern what the box searched, signalled ONLY by a placeholder swap
 * ("Search exhibits…" → "Search images…"), so a reader who typed before noticing searched the wrong
 * corpus and read an empty result as "this library doesn't have it". Studio settled this in
 * `Archie-2308`: **the lens browses, the search finds everything.** A live query filters BOTH corpora
 * and renders both result groups regardless of lens, and the lens toggle hides while it's live —
 * there is nothing left for it to govern. This predicate is that mode switch, kept here so the rule is
 * headless-testable and stated once.
 */
export function searchActive(query: string): boolean {
  return query.trim().length > 0;
}

/**
 * Cover fallback per exhibit slug (audit V7): the FIRST image-index entry for a slug, which is emitted
 * in library→reading order (ADR-0023), so "first" is the exhibit's opening object.
 *
 * Studio's `LibraryHome` has always done "explicit cover ELSE first object's thumbnail"
 * (`gallery-data.ts` `coverOf`, decision `Archie-2308`, spec SCALE-GALLERY-PLAN P3b); the viewer had no
 * fallback at all, so an exhibit without an explicit cover rendered as its title on a blank wash — in
 * the seeded library, the FIRST card, top-left, where the eye lands.
 *
 * Returns an empty map when no index loaded, which is the honest degradation: without `images.json`
 * there is no thumbnail to borrow and the title-on-a-wash placeholder remains the only option.
 */
export function coverFallbacks(index: ImageIndex | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of index?.images ?? []) {
    if (e.thumbnail && !out.has(e.exhibitSlug)) out.set(e.exhibitSlug, e.thumbnail);
  }
  return out;
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
