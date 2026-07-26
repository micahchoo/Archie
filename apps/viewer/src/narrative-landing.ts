// Narrative deep-link landing (Phase 3, 4.9). The NarrativeReader's section-jump must land the spine on
// the section whose OBJECT owns the deep-linked note. The original scan looked only at the BASE pages
// (annotationsByObject), so a note that lives ONLY on a per-reading page (readingAnnotationsByObject) was
// never found — the spine fell to section 0, stranding the link-follower on the wrong prose. This pure
// resolver scans BOTH the base notes AND every reading overlay, then maps the owning object to its
// section index. Headless-tested; NarrativeReader consumes it for both initial arrival and re-selection.
import { logicalIdOf, type W3CAnnotation } from "@render/core";

export interface NarrativeOwnerData {
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** objectId → readingId → that reading's notes (ADR-0007). */
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/**
 * The object id that owns `noteId`, searching base pages AND per-reading pages, or null if no object
 * carries it (a tombstoned cite — ADR-0003). Order: base first, then reading overlays.
 */
// Matches on LOGICAL id — the same V100 defect `resolveNoteArrival` carried, found by the audit this
// ticket asked for. A deep-linked note carries a bare ULID; `a.id` is the full published IRI. With raw
// `===` this always returned null, so `arrivalSectionIndex` silently fell back to section 0 and a cited
// note in a narrative exhibit landed at the top of the spine instead of at its own beat — a
// plausible-looking result, which is why it went unnoticed.
export function ownerObjectOf(
  noteId: string,
  objectIds: readonly string[],
  data: NarrativeOwnerData,
): string | null {
  const want = logicalIdOf(noteId);
  if (want === null) return null;
  const has = (notes: W3CAnnotation[]): boolean => notes.some((a) => logicalIdOf(a.id) === want);
  for (const oid of objectIds) {
    if (has(data.annotationsByObject[oid] ?? [])) return oid;
  }
  for (const oid of objectIds) {
    const byR = data.readingAnnotationsByObject[oid];
    if (!byR) continue;
    for (const rid of Object.keys(byR)) {
      if (has(byR[rid] ?? [])) return oid;
    }
  }
  return null;
}

/**
 * The section INDEX the spine should land on for a deep-linked note: the index of the section whose
 * `objectId` matches the note's owning object. Falls back to 0 when the note is unknown OR its owner has
 * no section in the spine (the safe landing — the spine still renders from the top, never a broken state).
 */
export function arrivalSectionIndex(
  noteId: string | null | undefined,
  objectIds: readonly string[],
  sections: readonly { objectId: string }[],
  data: NarrativeOwnerData,
): number {
  if (!noteId) return 0;
  const ownerId = ownerObjectOf(noteId, objectIds, data);
  if (ownerId === null) return 0;
  const idx = sections.findIndex((s) => s.objectId === ownerId);
  return idx >= 0 ? idx : 0;
}
