// Deep-link / search-jump arrival resolver (A0 selection seam). Given a note id, find which object
// OWNS it and which reading it lives in — the base page (reading: null) or a per-reading page
// (reading: rid). Pulled OUT of ExhibitView's onMount so the search overlay (Q-4) and keyboard index
// activation (Q-5) can resolve an arrival the SAME way the deep-link path does, and so the owner+reading
// search is unit-testable in isolation. An unknown id (tombstoned cite, ADR-0003) resolves null.
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
}

// Replicates the ExhibitView owner+reading search (was inline in onMount, §82/§124): scan each object's
// base page first, then its per-reading pages; first match wins. `objects` is the layout's object list
// (only `.id` is read), so this works against either the layout descriptor or the published objects.
export function resolveNoteArrival(
  noteId: string,
  objects: { id: string }[],
  data: NoteArrivalData,
): NoteArrival | null {
  for (const o of objects) {
    if ((data.annotationsByObject[o.id] ?? []).some((a) => a.id === noteId)) {
      return { objectId: o.id, reading: null };
    }
    for (const [rid, notes] of Object.entries(data.readingAnnotationsByObject[o.id] ?? {})) {
      if (notes.some((a) => a.id === noteId)) return { objectId: o.id, reading: rid };
    }
  }
  return null;
}
