// Deep-link / search-jump arrival resolver (A0 selection seam). Given a note id, find which object
// OWNS it and which reading it lives in — the base page (reading: null) or a per-reading page
// (reading: rid). Pulled OUT of ExhibitView's onMount so the search overlay (Q-4) and keyboard index
// activation (Q-5) can resolve an arrival the SAME way the deep-link path does, and so the owner+reading
// search is unit-testable in isolation. An unknown id (tombstoned cite, ADR-0003) resolves null.
import { logicalIdOf, type W3CAnnotation } from "@render/core";

/** Just the fields the resolver reads off the published exhibit — keeps it testable without a full PortableExhibit. */
export interface NoteArrivalData {
  annotationsByObject: Record<string, W3CAnnotation[]>;
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/** Where a note lives: which object, and which reading (null = the base page). */
export interface NoteArrival {
  objectId: string;
  reading: string | null;
  /** The note's id AS PUBLISHED (the full IRI), not the id the caller asked with. The second half of
   *  V100: the caller's id is typically a bare ULID from the address bar, and every downstream
   *  identity comparison (Reader/NarrativeReader `initialSelected`, `fitBounds`) matches against
   *  `annotation.id`. Handing the raw URL segment onward re-opened the same `===` gap one layer
   *  down — the object opened and the note still never selected. Callers must carry THIS id. */
  noteId: string;
}

// Replicates the ExhibitView owner+reading search (was inline in onMount, §82/§124): scan each object's
// base page first, then its per-reading pages; first match wins. `objects` is the layout's object list
// (only `.id` is read), so this works against either the layout descriptor or the published objects.
//
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
export function resolveNoteArrival(
  noteId: string,
  objects: { id: string }[],
  data: NoteArrivalData,
): NoteArrival | null {
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
