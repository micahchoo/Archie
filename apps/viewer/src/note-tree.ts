// THE ONE walk over the published note maps (Phase 5, reading-surface home). Every consumer that
// asks "which note is where" or "which notes exist" resolves through here — the owner search, the
// flat index, and the exact-id lookup all used to re-implement the same base-first, first-wins
// traversal (four copies: note-arrival.ts, narrative-landing.ts, search-index.ts, and the inline
// walk in ExhibitView's `findNote`). The V100 logicalId bug (Archie-67b6) was found TWICE because
// each copy carried its own seam; there is one seam now.
//
// The maps live on the published exhibit shape (`PortableExhibit`): `annotationsByObject`
// (objectId → base-page notes) plus `readingAnnotationsByObject` (objectId → readingId →
// that reading's notes, ADR-0007). `readExhibitTree` mints a key for EVERY object (possibly `[]`),
// so walking the maps in insertion order is the same walk as walking the published object list.
import { logicalIdOf, type W3CAnnotation } from "@render/core";

/** Just the two note maps the walk reads — keeps this testable without a full PortableExhibit. */
export interface NoteTreeData {
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** objectId → readingId → that reading's notes (ADR-0007). */
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/** Where a note lives: which object, and which reading (null = the base page). */
export interface NoteOwner {
  objectId: string;
  reading: string | null;
  /** The note's id AS PUBLISHED (the full IRI), not the id the caller asked with. The second half of
   *  V100: the caller's id is typically a bare ULID from the address bar, and every downstream
   *  identity comparison (Reader/NarrativeReader `initialSelected`, `fitBounds`) matches against
   *  `annotation.id`. Handing the raw URL segment onward re-opened the same `===` gap one layer
   *  down — the object opened and the note still never selected. Callers must carry THIS id. */
  noteId: string;
}

// MATCHES ON LOGICAL ID, NEVER ON THE RAW STRING (V100, Archie-67b6). This compared `a.id === noteId`
// with `===`, where `noteId` is the ONE path segment `route.ts` parses out of `#/<slug>/a/<id>` and
// `a.id` is the full published IRI `{baseUrl}{slug}/annotations/{ULID}/v{n}`. Nothing could ever
// satisfy it, so the cite ladder's note rung had never resolved once — five spellings were driven in
// the audit and all five degraded to the exhibit. Both halves were individually correct; the defect
// was purely the seam between them.
//
// Normalising BOTH sides through `logicalIdOf` also makes the resolver indifferent to which form a
// caller holds — a bare ULID from the address bar, or a full IRI from an internal caller (the search
// overlay and keyboard index activation both pass the latter). And it drops the VERSION: `/v1` and
// `/v3` of the same note are the same note, so a cite minted before an edit still lands (ADR-0003).

/** THE canonical owner search: per-object interleaved — base page of object 1, readings of object 1,
 *  base page of object 2, … — first match wins. This is deliberately the ONE order for the whole
 *  tree: it is exactly the order `flattenNotes` walks, so "first match wins" here IS "first in the
 *  flattened tree", and it matches deep-link intent (a note carried in an EARLIER object's reading
 *  page outranks the same logical note in a LATER object's base page — the earlier owner in the
 *  exhibit's own order wins). The older `ownerObjectOf` scanned ALL base pages before ANY reading
 *  page; that order disagreed with the flat walk and is unified here (Phase 5 decision, pinned in
 *  note-tree.test.ts). `objects` is the layout's object list (only `.id` is read), so this works
 *  against either the layout descriptor or the published objects. */
export function locate(
  noteId: string,
  data: NoteTreeData,
  objects: readonly { id: string }[],
): NoteOwner | null {
  const want = logicalIdOf(noteId);
  if (want === null) return null; // unresolvable id — degrade, never throw
  const hit = (notes: W3CAnnotation[]): string | null =>
    notes.find((a) => logicalIdOf(a.id) === want)?.id ?? null;
  for (const o of objects) {
    const base = hit(data.annotationsByObject[o.id] ?? []);
    if (base !== null) return { objectId: o.id, reading: null, noteId: base };
    for (const [rid, notes] of Object.entries(data.readingAnnotationsByObject[o.id] ?? {})) {
      const found = hit(notes);
      if (found !== null) return { objectId: o.id, reading: rid, noteId: found };
    }
  }
  return null;
}

/** The canonical owner resolution over the published maps directly (no explicit object list). Every
 *  published object has a key in `annotationsByObject` (possibly `[]` — readExhibitTree mints them
 *  all), and the maps are built in published object order, so this is `locate` over the exhibit's
 *  own object order. The union with `readingAnnotationsByObject`'s keys is for hand-built data: an
 *  object keyed only as a reading page must still be findable. */
export function ownerOf(noteId: string, data: NoteTreeData): NoteOwner | null {
  const objectIds: string[] = [];
  const seen = new Set<string>();
  for (const id of Object.keys(data.annotationsByObject)) {
    objectIds.push(id);
    seen.add(id);
  }
  for (const id of Object.keys(data.readingAnnotationsByObject)) {
    if (!seen.has(id)) objectIds.push(id);
  }
  return locate(noteId, data, objectIds.map((id) => ({ id })));
}

/** Pull EVERY note in the exhibit into one flat array in the canonical order — the base page per
 *  object PLUS every per-reading page (Q-4): the finder is mode-independent and scopes ALL readings,
 *  so a note that lives only in a non-active reading is still findable. A note id can repeat across
 *  the base + a reading overlay; we de-dupe by id (first wins) so the index carries one doc per note. */
export function flattenNotes(data: NoteTreeData): W3CAnnotation[] {
  const seen = new Set<string>();
  const out: W3CAnnotation[] = [];
  const take = (a: W3CAnnotation) => {
    if (!a.id || seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  };
  for (const list of Object.values(data.annotationsByObject)) for (const a of list) take(a);
  for (const byReading of Object.values(data.readingAnnotationsByObject))
    for (const list of Object.values(byReading)) for (const a of list) take(a);
  return out;
}

/** Find a note by its PUBLISHED id (exact `annotation.id` match) across base + reading pages — the
 *  cite panel's lookup (what ExhibitView's old inline `findNote` did, including its null-data guard:
 *  before the exhibit loads there is nothing to find). A different query from `ownerOf`/`locate`:
 *  those resolve a logical id to its OWNER; this returns the note object itself when a caller
 *  already holds the published id. */
export function noteById(noteId: string, data: NoteTreeData | null | undefined): W3CAnnotation | undefined {
  if (!data) return undefined;
  for (const list of Object.values(data.annotationsByObject)) {
    const hit = list.find((a) => a.id === noteId);
    if (hit) return hit;
  }
  for (const byReading of Object.values(data.readingAnnotationsByObject))
    for (const list of Object.values(byReading)) {
      const hit = list.find((a) => a.id === noteId);
      if (hit) return hit;
    }
  return undefined;
}
