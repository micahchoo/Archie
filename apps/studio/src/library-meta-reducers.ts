// Pure reducers over LibraryMeta — the immutable patch logic App.svelte hand-rolled ~14 times. Kept
// plain (no runes) so they're unit-testable headless; the rune store (library-meta.svelte.ts) calls
// these and owns reactivity + persistence. Each returns a NEW object graph (unmatched refs preserved),
// so Svelte `$derived`/props invalidate exactly as the inline `{...exhibits.map(...)}` did before.
import type { LibraryMeta, ExhibitMeta, ObjectMeta } from "./store.js";

/** Merge top-level library fields (title/summary/rights). */
export function patchLibraryIn(meta: LibraryMeta, fields: Partial<LibraryMeta>): LibraryMeta {
  return { ...meta, ...fields };
}

/** Patch one exhibit (matched by slug); other exhibits keep their identity. */
export function patchExhibitIn(meta: LibraryMeta, slug: string, fields: Partial<ExhibitMeta>): LibraryMeta {
  return { ...meta, exhibits: meta.exhibits.map((e) => (e.slug === slug ? { ...e, ...fields } : e)) };
}

/** Patch one object (matched by id) within one exhibit (matched by slug). */
export function patchObjectIn(meta: LibraryMeta, slug: string, objId: string, fields: Partial<ObjectMeta>): LibraryMeta {
  return {
    ...meta,
    exhibits: meta.exhibits.map((e) =>
      e.slug === slug ? { ...e, objects: e.objects.map((o) => (o.id === objId ? { ...o, ...fields } : o)) } : e,
    ),
  };
}

/** Append an object to one exhibit (matched by slug). */
export function appendObjectIn(meta: LibraryMeta, slug: string, obj: ObjectMeta): LibraryMeta {
  return { ...meta, exhibits: meta.exhibits.map((e) => (e.slug === slug ? { ...e, objects: [...e.objects, obj] } : e)) };
}

/** Append an exhibit to the library. */
export function addExhibitIn(meta: LibraryMeta, ex: ExhibitMeta): LibraryMeta {
  return { ...meta, exhibits: [...meta.exhibits, ex] };
}

/** Remove one exhibit (matched by slug); others keep identity. Removing the last → empty `exhibits[]`
 *  (a truly-empty library — the caller does NOT reseed DEFAULT_EXHIBITS; Archie-3f4c). */
export function removeExhibitIn(meta: LibraryMeta, slug: string): LibraryMeta {
  return { ...meta, exhibits: meta.exhibits.filter((e) => e.slug !== slug) };
}

/** Remove one object (matched by id) from one exhibit (matched by slug); others keep identity.
 *  Removing the last object → empty `objects[]` (a valid empty exhibit, post-Archie-e5c0). */
export function removeObjectIn(meta: LibraryMeta, slug: string, objId: string): LibraryMeta {
  return {
    ...meta,
    exhibits: meta.exhibits.map((e) =>
      e.slug === slug ? { ...e, objects: e.objects.filter((o) => o.id !== objId) } : e,
    ),
  };
}
