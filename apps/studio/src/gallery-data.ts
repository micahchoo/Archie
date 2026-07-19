// Studio Library-Gallery data shaping (SCALE-GALLERY Phase 3.2) — pure, framework-free (cf.
// overview-selection.ts), so the flatten / cover-pick / filter logic is unit-testable headless; the
// Svelte components (LibraryHome, GalleryWall, GalleryThumb) render what these return.
//
// The wall item shape is CONGRUENT to the published `images.json` index entry (render-core
// buildImageIndex: { objectId, exhibitSlug, title, thumbnail?, width?, height? }) so a future shared
// component could render both — but Studio reads OPFS LIVE (never the baked index; unpublished edits
// would make it stale), so it carries `source`/`mediaType` for OPFS thumb resolution instead of a baked
// `thumbnail` ref, plus `exhibitTitle` (Studio has no exhibits.json to join against). No apps/viewer reach.
import { matchesTitle } from "@render/core";
import type { ExhibitMeta, ObjectMeta } from "./store.js";

/** One tile on the all-images wall — every Object across every Exhibit, in library → reading order. */
export interface GalleryImage {
  objectId: string;
  exhibitSlug: string;
  exhibitTitle: string;
  /** Object label (the wall's search + caption key). */
  title: string;
  /** The object's source (`/assets/{name}` OPFS import, or a remote/IIIF URL) — drives thumb resolution. */
  source: string;
  mediaType?: string;
  width?: number;
  height?: number;
}

/** The object a card shows as its cover — an explicit exhibit cover (the model has none today) or the
 *  first object; null for an empty exhibit. Just enough for GalleryThumb to resolve a thumbnail. */
export interface Cover {
  slug: string;
  objectId: string;
  source: string;
  mediaType?: string;
}

/** Flatten the whole Library into wall tiles: every exhibit (library order), every object (reading order). */
export function flattenLibraryImages(exhibits: ReadonlyArray<ExhibitMeta>): GalleryImage[] {
  const out: GalleryImage[] = [];
  for (const e of exhibits) {
    for (const o of e.objects) {
      out.push({
        objectId: o.id,
        exhibitSlug: e.slug,
        exhibitTitle: e.title,
        title: o.label,
        source: o.source,
        ...(o.mediaType ? { mediaType: o.mediaType } : {}),
        ...(o.width !== undefined ? { width: o.width } : {}),
        ...(o.height !== undefined ? { height: o.height } : {}),
      });
    }
  }
  return out;
}

/** The cover object for an exhibit's card — its first object, or null when empty. (No explicit-cover field
 *  exists on the working model yet; when one lands, prefer it here — the one place cover choice is decided.) */
export function coverOf(exhibit: ExhibitMeta): Cover | null {
  const first: ObjectMeta | undefined = exhibit.objects[0];
  if (!first) return null;
  return { slug: exhibit.slug, objectId: first.id, source: first.source, ...(first.mediaType ? { mediaType: first.mediaType } : {}) };
}

/** Filter exhibits by title OR description for the cards view (case-insensitive, diacritic-folded — the
 *  same matchesTitle primitive, applied to both fields, so there's ONE matcher not two idioms). Matching
 *  the description is load-bearing: PLAN §8 stamps each imported exhibit's provenance trail ("From: {root}
 *  › {sub-collection}") into its `summary`, and the "search Documents → select all" flatten-mitigation
 *  workflow (§9) only works if that trail is reachable from this box. A missing description (`summary`
 *  undefined) folds to "" → never matches, never throws. Empty / whitespace query returns the input array
 *  unchanged (identity — no needless re-render). */
export function filterExhibits(exhibits: ReadonlyArray<ExhibitMeta>, query: string): ReadonlyArray<ExhibitMeta> {
  const q = query.trim();
  if (!q) return exhibits;
  return exhibits.filter((e) => matchesTitle(e.title, q) || matchesTitle(e.summary ?? "", q));
}

/** Filter wall tiles by object title (same primitive as the cards + the overview toolbar — ONE definition). */
export function filterImages(images: ReadonlyArray<GalleryImage>, query: string): ReadonlyArray<GalleryImage> {
  const q = query.trim();
  return q ? images.filter((im) => matchesTitle(im.title, q)) : images;
}

/**
 * Commit a just-minted thumbnail blob URL, or drop it if the tile was destroyed DURING the async mint.
 * A GalleryThumb can unmount (scroll away, view toggle, leave the Library) between calling readThumbUrl
 * and its promise resolving; assigning the URL then would leak the OPFS-pinned blob (nothing revokes it on
 * a dead component). So: cancelled → revoke the orphan and return null; live → return the URL to install.
 * Pure (the async read + revoke are injected) so the exact destroy-during-mint race is unit-testable.
 */
export function commitMintedThumb(url: string | null, cancelled: boolean, revoke: (u: string) => void): string | null {
  if (cancelled) {
    if (url) revoke(url);
    return null;
  }
  return url;
}
