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

// PERF (scale/library-search): matchesTitle NFKD-normalizes + strips diacritics + lowercases BOTH its
// arguments on every call (render-core text/match.ts `fold`) — fine for filterExhibits (library-sized:
// tens of exhibits) but at 10k Objects, filterImages running matchesTitle per tile per keystroke was ~10k
// redundant title folds every time a key was pressed, with no debounce. `fold` itself isn't exported (only
// `matchesTitle` is) and render-core is out of territory for this change, so it's duplicated here — SAME
// two-line body — to precompute each image's folded title ONCE at flatten time instead of per keystroke.
// Follow-up: render-core could export `fold` directly so this wrapper isn't a second copy of the primitive.
function foldForSearch(s: string): string {
  return s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** One tile on the all-images wall — every Object across every Exhibit, in library → reading order. */
export interface GalleryImage {
  objectId: string;
  exhibitSlug: string;
  exhibitTitle: string;
  /** Object label (the wall's search + caption key). */
  title: string;
  /** `title`, NFKD-folded ONCE at flatten time (PERF: see foldForSearch above) — filterImages' search key,
   *  so a keystroke does a plain `.includes` over 10k precomputed strings instead of re-folding every title. */
  searchKey: string;
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
        searchKey: foldForSearch(o.label),
        source: o.source,
        ...(o.mediaType ? { mediaType: o.mediaType } : {}),
        ...(o.width !== undefined ? { width: o.width } : {}),
        ...(o.height !== undefined ? { height: o.height } : {}),
      });
    }
  }
  return out;
}

/** The cover object for an exhibit's card — the first IMAGE object (thumbnail-mitigations gap 5: an
 *  AV-first exhibit full of images should lead with a picture, not a glyph), falling back to the first
 *  object of any kind when no image exists (an all-AV exhibit keeps its honest motif cover), or null when
 *  empty. "Image" uses the same discriminator as the viewer's thumbKind (media-thumb.ts): an `xyz`
 *  tileSource is a map — not an image — otherwise `mediaType ?? "image"` decides. (No explicit-cover field
 *  exists on the working model yet; when one lands, prefer it here — the one place cover choice is decided.) */
export function coverOf(exhibit: ExhibitMeta): Cover | null {
  const isImage = (o: ObjectMeta): boolean => o.tileSource?.kind !== "xyz" && (o.mediaType ?? "image") === "image";
  const pick: ObjectMeta | undefined = exhibit.objects.find(isImage) ?? exhibit.objects[0];
  if (!pick) return null;
  return { slug: exhibit.slug, objectId: pick.id, source: pick.source, ...(pick.mediaType ? { mediaType: pick.mediaType } : {}) };
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

/** Filter wall tiles by object title (same primitive as the cards + the overview toolbar — ONE definition,
 *  same MATCH semantics as matchesTitle — see foldForSearch above). PERF: folds the query ONCE here rather
 *  than per-tile (matchesTitle would re-fold both sides on every call); each tile's side of the fold is
 *  already sitting in `searchKey` from flatten time, so this is a plain substring test per tile, not a
 *  normalize+strip+lowercase per tile. Empty / whitespace query still returns the input array unchanged
 *  (identity — no needless re-render), matching filterExhibits and the pre-PERF behavior exactly. */
export function filterImages(images: ReadonlyArray<GalleryImage>, query: string): ReadonlyArray<GalleryImage> {
  const trimmed = query.trim();
  if (!trimmed) return images;
  const q = foldForSearch(trimmed);
  // A query that folds away to nothing (e.g. a lone combining-diacritic keystroke) matches every title —
  // same as matchesTitle("", title) — but as an explicit filter, not the identity fast-path above.
  return images.filter((im) => q === "" || im.searchKey.includes(q));
}

/**
 * A debounced "commit" for the wall's search box (SCALE-GALLERY perf fix): call `schedule(query)` on every
 * keystroke; `onCommit` fires with the LATEST query after `delayMs` of typing silence — EXCEPT an empty
 * (trimmed) query commits immediately (clearing the box shouldn't wait to show everything again). At 10k
 * Objects, filterImages is the expensive part of a keystroke (not updating the input), so the box itself
 * stays instant while the FILTER recompute is what's coalesced. Framework-free (setTimeout/clearTimeout
 * only, mirrors library-meta.svelte.ts's schedulePersist idiom) so the debounce timing is unit-testable
 * headless, same reasoning as the rest of this module — LibraryHome.svelte just wires an oninput handler
 * to `schedule` and reads the committed query back out of `onCommit`.
 */
export function createSearchDebouncer(onCommit: (query: string) => void, delayMs = 130): { schedule: (query: string) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(query: string) {
      clearTimeout(timer);
      if (query.trim() === "") { onCommit(query); return; }
      timer = setTimeout(() => onCommit(query), delayMs);
    },
    cancel() { clearTimeout(timer); },
  };
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
