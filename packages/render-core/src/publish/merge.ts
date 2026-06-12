// Merge-preserving regen (Archie-9b93): the published tree is a UNION — exhibits the current
// generation OWNS (regenerable from its source: sample-data, a `--from` zip) plus exhibits that
// were published into the tree by someone else (a curated commit like the atlas, a cloner's
// authored exhibits). A regen must rewrite what it owns and CARRY what it doesn't — the old
// rm-everything regen silently deleted committed exhibits on every dev run and CI deploy.
//
// Preservation is FILE-LEVEL (the carried exhibits' dirs are not touched, zero loss — a
// loadLibrary→publishLibrary round-trip would drop readings/sections, site.ts loadLibrary doesn't
// recover them). Only the three root indexes need merging; this module is the pure half.
import type { ExhibitsJson } from "../iiif/exhibits.js";
import type { IIIFCollection } from "../iiif/presentation.js";

/** The slug a collection item points at — items reference `{baseUrl}{slug}/manifest.json`. */
export function collectionItemSlug(item: { id: string }): string | null {
  const m = /(?:^|\/)([^/]+)\/manifest\.json$/.exec(item.id);
  return m ? m[1]! : null;
}

export interface PublishedIndexes {
  exhibits: ExhibitsJson;
  collection: IIIFCollection;
}

export interface MergedIndexes extends PublishedIndexes {
  /** Slugs carried over from the existing tree (not owned by this generation), in display order. */
  preservedSlugs: string[];
}

/**
 * Merge freshly generated indexes over an existing tree's: generated exhibits keep their order
 * and WIN slug collisions (they're being regenerated); existing exhibits the generation doesn't
 * own are appended, re-numbered after the generated block. `dirExists` guards against carrying an
 * index entry whose exhibit dir is gone (a manually deleted exhibit must not resurrect as a
 * broken card).
 */
export function mergePublishedIndexes(
  generated: PublishedIndexes,
  existing: PublishedIndexes | null,
  opts: { dirExists?: (slug: string) => boolean } = {},
): MergedIndexes {
  if (!existing) return { ...generated, preservedSlugs: [] };
  const owned = new Set(generated.exhibits.exhibits.map((c) => c.slug));
  const dirExists = opts.dirExists ?? (() => true);
  const carried = existing.exhibits.exhibits
    .filter((c) => !owned.has(c.slug) && dirExists(c.slug))
    .sort((a, b) => a.order - b.order);
  if (carried.length === 0) return { ...generated, preservedSlugs: [] };

  const base = generated.exhibits.exhibits.length;
  const exhibits: ExhibitsJson = {
    ...generated.exhibits,
    exhibits: [...generated.exhibits.exhibits, ...carried.map((c, i) => ({ ...c, order: base + i }))],
  };
  const carriedSet = new Set(carried.map((c) => c.slug));
  const carriedItems = existing.collection.items.filter((it) => {
    const slug = collectionItemSlug(it);
    return slug !== null && carriedSet.has(slug);
  });
  const collection: IIIFCollection = {
    ...generated.collection,
    items: [...generated.collection.items, ...carriedItems],
  };
  return { exhibits, collection, preservedSlugs: carried.map((c) => c.slug) };
}
