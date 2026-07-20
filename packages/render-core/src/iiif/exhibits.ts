// exhibits.json — the Library-level Gallery source (CONTEXT §Gallery; UX-Q7). The survey's
// MAJOR greenfield gap: nobody emits a multi-exhibit index, so this is ours to build. Studio
// library-browse and the published Gallery share this one source.
//
// Schema designed FORWARD so v1.1 curation (hero/sections/featured) is additive, not a
// migration: a top-level `library` object (not a flat array), explicit ordering, first-class
// cover/title/description, and a reserved `presentation` namespace.

import type { Exhibit, Library, Reading, RightsFields } from "../model/model.js";
import type { W3CAnnotationCollection } from "../wadm/types.js";
import { WADM_CONTEXT } from "../wadm/types.js";
import { thumbnailUrl } from "./resolve.js";

export interface ExhibitCard {
  slug: string;
  title: string;
  cover?: string;
  description?: string;
  /** Explicit display order (array index at emit time). */
  order: number;
}

export interface ExhibitsJson {
  /** Library framing for the Gallery. Carries `RightsFields` (credit/license) in the friendly model
   *  shape so the Viewer renders the quiet credit line directly and `loadLibrary` restores it raw —
   *  the Archie-convenience mirror of `collection.json`'s IIIF `requiredStatement`/`rights`. */
  library: { id: string; title?: string; summary?: string } & RightsFields;
  exhibits: ExhibitCard[];
  /** Reserved namespace for v1.1 curated-landing config. Empty in v1. */
  presentation: Record<string, never>;
}

/** Derived-cover width — matches the viewer MediaThumbnail plate width (media-thumb.ts thumbSrc). */
const COVER_WIDTH = 480;

/**
 * Cover fallback (thumbnail-mitigations gap 5): when no cover is authored, derive one from the first
 * IMAGE object — the same discriminator the viewer's `thumbKind` uses (an `xyz` tileSource is a map,
 * not an image; otherwise `mediaType ?? "image"` decides) — preferring its baked `thumbnail`, else a
 * renderable URL for its source via `thumbnailUrl` (IIIF service base → sized JPEG; plain image URL →
 * passthrough). All-AV and empty exhibits stay coverless: an `<img>` can't render an audio source, and
 * the Gallery's title-text card is the honest fallback there.
 *
 * Working `/assets/…` and `/assets-thumb/…` refs are emitted TREE-RELATIVE under the exhibit's slug
 * (`{slug}/assets-thumb/{name}` — the layout publishLibrary's asset pass writes): this projection runs
 * BEFORE that pass and deliberately takes no baseUrl (self-contained — one derivation site for hosted,
 * portable, and live galleries alike). A consumer that serves the tree from its own root resolves them
 * directly; one that can't (e.g. the hosted viewer's separate data base) degrades to the Gallery's
 * broken-cover title fallback (#10) — never worse than the pre-derivation text card.
 */
function deriveCover(e: Exhibit): string | undefined {
  const img = e.objects.find((o) => o.tileSource?.kind !== "xyz" && (o.mediaType ?? "image") === "image");
  if (!img) return undefined;
  const ref = img.thumbnail ?? thumbnailUrl(img.tileSource ?? img.source, COVER_WIDTH);
  return /^\/assets(-thumb)?\//.test(ref) ? `${e.slug}${ref}` : ref;
}

export function toExhibitsJson(library: Library): ExhibitsJson {
  return {
    library: {
      id: library.id,
      ...(library.title !== undefined ? { title: library.title } : {}),
      ...(library.summary !== undefined ? { summary: library.summary } : {}),
      ...(library.rights !== undefined ? { rights: library.rights } : {}),
      ...(library.requiredStatement !== undefined ? { requiredStatement: library.requiredStatement } : {}),
      // Library-level descriptive metadata passes through raw (Archie-c6bf), exactly as
      // rights/requiredStatement do — loadLibrary restores it from here (the IIIF display pairs
      // live on collection.json via rightsProps; THIS is the lossless model-shape mirror).
      ...(library.metadata && library.metadata.length ? { metadata: library.metadata } : {}),
    },
    exhibits: library.exhibits.map((e, order) => {
      const cover = e.cover ?? deriveCover(e); // authored cover always wins; derivation is the gap-5 fallback
      return {
        slug: e.slug,
        title: e.title,
        ...(cover !== undefined ? { cover } : {}),
        ...(e.summary !== undefined ? { description: e.summary } : {}),
        order,
      };
    }),
    presentation: {},
  };
}

/**
 * One IIIF AnnotationCollection per Reading (ADR-0007): the `partOf` target each per-canvas reading
 * page cites. Header-only (no `total`/`first` — the member annotations live in the per-canvas pages,
 * not embedded here), carrying the Reading's name/description as `label`/`summary` so a pure IIIF
 * consumer can label the group. The `id` is supplied by the caller (the published collId path), so
 * this serializer stays origin-agnostic. Uses the `en` language tag to match the Reading's authored
 * copy (NOT the `none` map the spatial layers use).
 */
export function toReadingCollection(reading: Reading, id: string): W3CAnnotationCollection {
  return {
    "@context": WADM_CONTEXT,
    id,
    type: "AnnotationCollection",
    label: { en: [reading.name] },
    ...(reading.description ? { summary: { en: [reading.description] } } : {}),
  };
}

/**
 * The single-exhibit collapse THRESHOLD (UX-Q7): skip the Gallery only when there is exactly
 * one Exhibit AND no Library title/intro to frame it; otherwise render it.
 */
export function shouldRenderGallery(library: Library): boolean {
  const single = library.exhibits.length === 1;
  const hasFraming = (library.title ?? "").length > 0 || (library.summary ?? "").length > 0;
  return !(single && !hasFraming);
}

/**
 * Consumer-side collapse threshold: the Viewer fetches `exhibits.json` (an ExhibitsJson), not a
 * Library, so it can't call shouldRenderGallery. Same rule, on the published shape — skip the
 * Gallery only when exactly one Exhibit AND no Library title/summary to frame it.
 */
export function shouldRenderGalleryFromJson(ex: ExhibitsJson): boolean {
  const single = ex.exhibits.length === 1;
  const hasFraming = (ex.library.title ?? "").length > 0 || (ex.library.summary ?? "").length > 0;
  return !(single && !hasFraming);
}
