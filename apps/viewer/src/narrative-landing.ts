// Narrative deep-link landing (Phase 3, 4.9). The NarrativeReader's section-jump must land the spine on
// the section whose OBJECT owns the deep-linked note. The original scan looked only at the BASE pages
// (annotationsByObject), so a note that lives ONLY on a per-reading page (readingAnnotationsByObject) was
// never found — the spine fell to section 0, stranding the link-follower on the wrong prose. This pure
// resolver scans BOTH the base notes AND every reading overlay, then maps the owning object to its
// section index. Headless-tested; NarrativeReader consumes it for both initial arrival and re-selection.
import type { W3CAnnotation } from "@render/core";

export interface NarrativeOwnerData {
  annotationsByObject: Record<string, W3CAnnotation[]>;
  /** objectId → readingId → that reading's notes (ADR-0007). */
  readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
}

/**
 * The object id that owns `noteId`, searching base pages AND per-reading pages, or null if no object
 * carries it (a tombstoned cite — ADR-0003). Order: base first, then reading overlays.
 */
export function ownerObjectOf(
  noteId: string,
  objectIds: readonly string[],
  data: NarrativeOwnerData,
): string | null {
  for (const oid of objectIds) {
    if ((data.annotationsByObject[oid] ?? []).some((a) => a.id === noteId)) return oid;
  }
  for (const oid of objectIds) {
    const byR = data.readingAnnotationsByObject[oid];
    if (!byR) continue;
    for (const rid of Object.keys(byR)) {
      if ((byR[rid] ?? []).some((a) => a.id === noteId)) return oid;
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
