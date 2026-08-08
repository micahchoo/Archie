// Deep-link / search-jump arrival resolver (A0 selection seam). Given a note id, find which object
// OWNS it and which reading it lives in — the base page (reading: null) or a per-reading page
// (reading: rid). Pulled OUT of ExhibitView's onMount so the search overlay (Q-4) and keyboard index
// activation (Q-5) can resolve an arrival the SAME way the deep-link path does, and so the owner+reading
// search is unit-testable in isolation. An unknown id (tombstoned cite, ADR-0003) resolves null.
//
// Phase 5: a THIN composition over note-tree.ts — the ONE canonical walk (owner search + flat
// flatten + exact-id lookup all live there now; the V100 reasoning lives with it, in the `locate`
// doc comment). This module keeps its exported names + signatures so callers and the seam tests
// don't churn: the resolution logic IS `noteTree.locate` over the layout's object list.
import { locate } from "./note-tree.js";
import type { W3CAnnotation } from "@render/core";

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

// The V100 docblock lives on `note-tree.locate` — the canonical implementation. This wrapper exists
// to keep the public seam (and the note-arrival.test.ts contract) stable; it adds no logic.
export function resolveNoteArrival(
  noteId: string,
  objects: { id: string }[],
  data: NoteArrivalData,
): NoteArrival | null {
  return locate(noteId, data, objects);
}
