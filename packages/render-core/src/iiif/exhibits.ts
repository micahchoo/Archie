// exhibits.json — the Library-level Gallery source (CONTEXT §Gallery; UX-Q7). The survey's
// MAJOR greenfield gap: nobody emits a multi-exhibit index, so this is ours to build. Studio
// library-browse and the published Gallery share this one source.
//
// Schema designed FORWARD so v1.1 curation (hero/sections/featured) is additive, not a
// migration: a top-level `library` object (not a flat array), explicit ordering, first-class
// cover/title/description, and a reserved `presentation` namespace.

import type { Library } from "../model/model.js";

export interface ExhibitCard {
  slug: string;
  title: string;
  cover?: string;
  description?: string;
  /** Explicit display order (array index at emit time). */
  order: number;
}

export interface ExhibitsJson {
  library: { id: string; title?: string; summary?: string };
  exhibits: ExhibitCard[];
  /** Reserved namespace for v1.1 curated-landing config. Empty in v1. */
  presentation: Record<string, never>;
}

export function toExhibitsJson(library: Library): ExhibitsJson {
  return {
    library: {
      id: library.id,
      ...(library.title !== undefined ? { title: library.title } : {}),
      ...(library.summary !== undefined ? { summary: library.summary } : {}),
    },
    exhibits: library.exhibits.map((e, order) => ({
      slug: e.slug,
      title: e.title,
      ...(e.cover !== undefined ? { cover: e.cover } : {}),
      ...(e.summary !== undefined ? { description: e.summary } : {}),
      order,
    })),
    presentation: {},
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
