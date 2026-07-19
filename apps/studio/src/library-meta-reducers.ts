// Pure reducers over LibraryMeta — the immutable patch logic App.svelte hand-rolled ~14 times. Kept
// plain (no runes) so they're unit-testable headless; the rune store (library-meta.svelte.ts) calls
// these and owns reactivity + persistence. Each returns a NEW object graph (unmatched refs preserved),
// so Svelte `$derived`/props invalidate exactly as the inline `{...exhibits.map(...)}` did before.
import type { LibraryMeta, ExhibitMeta, ObjectMeta } from "./store.js";

/** The keys of `T` that are OPTIONAL (`?`) — i.e. the only fields safe to CLEAR. `{} extends Pick<T, K>`
 *  holds exactly when K may be absent, so a required field (id / slug / title / objects) maps to `never`. */
type ClearableKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/** A patch over an exhibit where an OPTIONAL field may be SET or explicitly CLEARED (present-`undefined`),
 *  while a REQUIRED field can only ever be SET. Unlike `Partial<ExhibitMeta>` (whose optional props stay
 *  non-`undefined` under `exactOptionalPropertyTypes`, so `{ rights: undefined }` is rejected), a present
 *  `undefined` on an optional key is legal here — the type form of the reducers' "absent key = leave, present-
 *  `undefined` = clear" convention. But `{ title: undefined }` / `{ id: undefined }` are COMPILE ERRORS: a
 *  present-`undefined` required key would be DELETED by applyExhibitPatch, corrupting the exhibit. Built by
 *  omitting the clearable keys from `Partial` (an intersection would re-narrow away the `| undefined`) and
 *  re-adding them widened. `Partial<ExhibitMeta>` stays assignable, so existing set-only callers are unaffected.
 *  See `applyExhibitPatch` for how CLEAR is realized (the key is DROPPED, matching RightsEditor's `delete`). */
export type ExhibitMetaPatch =
  Omit<Partial<ExhibitMeta>, ClearableKeys<ExhibitMeta>> &
  { [K in ClearableKeys<ExhibitMeta>]?: ExhibitMeta[K] | undefined };

/** Apply a SET/CLEAR patch to one exhibit, returning a clean value: absent key = leave (base value kept),
 *  present-`undefined` = clear (key dropped), present value = set. Dropping the cleared key (rather than
 *  storing `undefined`) matches the model's convention — RightsEditor clears via `delete next.rights`, and
 *  `exactOptionalPropertyTypes` forbids an `undefined`-valued optional in the result — so a naive
 *  `{ ...e, ...fields }` spread (which would widen `rights` to `string | undefined`) can't be used. The lone
 *  cast is sound: the loop leaves no `undefined`-valued key, so `next` is a well-formed ExhibitMeta. */
function applyExhibitPatch(e: ExhibitMeta, fields: ExhibitMetaPatch): ExhibitMeta {
  const next: ExhibitMeta = { ...e };
  const bag = next as unknown as Record<string, unknown>; // a same-reference view for the dynamic-key set/clear below
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete bag[key];
    else bag[key] = value;
  }
  return next;
}

/** Merge top-level library fields (title/summary/rights). */
export function patchLibraryIn(meta: LibraryMeta, fields: Partial<LibraryMeta>): LibraryMeta {
  return { ...meta, ...fields };
}

/** Patch one exhibit (matched by slug); other exhibits keep their identity. */
export function patchExhibitIn(meta: LibraryMeta, slug: string, fields: Partial<ExhibitMeta>): LibraryMeta {
  return { ...meta, exhibits: meta.exhibits.map((e) => (e.slug === slug ? { ...e, ...fields } : e)) };
}

/** Apply ONE patch to a SET of exhibits in one pass (bulk rights edit, collection-import Phase 2 — the
 *  plural sibling of patchExhibitIn). Matched slugs get the set/clear patch applied (via applyExhibitPatch);
 *  unmatched exhibits keep identity; unknown slugs are ignored. Empty slug set OR empty patch → the SAME meta
 *  ref (no spurious persist/re-render), cf. removeExhibitsIn / removeObjectsIn. One map over `slugs` (a Set)
 *  so a large selection is O(exhibits), not O(exhibits × slugs). NB: a patch key present with an `undefined`
 *  value (a bulk clear — e.g. `{ rights: undefined }`) IS a non-empty patch and DOES clear; only a `{}` with
 *  no own keys is the no-op. */
export function patchExhibitsIn(meta: LibraryMeta, slugs: ReadonlySet<string> | readonly string[], fields: ExhibitMetaPatch): LibraryMeta {
  const hit = slugs instanceof Set ? slugs : new Set(slugs);
  if (hit.size === 0 || Object.keys(fields).length === 0) return meta;
  return { ...meta, exhibits: meta.exhibits.map((e) => (hit.has(e.slug) ? applyExhibitPatch(e, fields) : e)) };
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

/** Remove a SET of objects from one exhibit in one pass (bulk delete, Phase 2). Survivors keep their
 *  canonical relative order; other exhibits keep identity. One filter over `ids` (a Set) so a large
 *  selection is O(objects), not O(objects × ids). */
export function removeObjectsIn(meta: LibraryMeta, slug: string, ids: ReadonlySet<string> | readonly string[]): LibraryMeta {
  const drop = ids instanceof Set ? ids : new Set(ids);
  if (drop.size === 0) return meta; // nothing to remove — preserve identity (no spurious persist/re-render)
  return {
    ...meta,
    exhibits: meta.exhibits.map((e) =>
      e.slug === slug ? { ...e, objects: e.objects.filter((o) => !drop.has(o.id)) } : e,
    ),
  };
}

/** Remove a SET of exhibits in one pass (bulk delete / undo-import, collection-import Phase 2 — the
 *  plural sibling of removeExhibitIn). Survivors keep their order; unknown slugs are ignored (removal is
 *  idempotent). One filter over `slugs` (a Set) so a 520-slug undo is O(exhibits), not O(exhibits × slugs).
 *  Removing every exhibit → empty `exhibits[]` (a truly-empty library — the caller does NOT reseed
 *  DEFAULT_EXHIBITS; cf. removeExhibitIn / Archie-3f4c). */
export function removeExhibitsIn(meta: LibraryMeta, slugs: ReadonlySet<string> | readonly string[]): LibraryMeta {
  const drop = slugs instanceof Set ? slugs : new Set(slugs);
  if (drop.size === 0) return meta; // nothing to remove — preserve identity (no spurious persist/re-render)
  return { ...meta, exhibits: meta.exhibits.filter((e) => !drop.has(e.slug)) };
}
