// The C4 merge-contract gate, as pure decisions (Archie-7e5b S3a/S3b).
//
// WHY THIS MODULE EXISTS. `session.editNote` / `session.deleteNote` resolve a note's LINEAR head,
// which THROWS on plural heads — a conflicted note has no single head to edit or tombstone. The
// sidebar already refuses to open such a note, but three other paths reached those methods without
// asking: a canvas geometry drag, an object removal, and a bulk removal. Each failed differently and
// all three failed badly:
//
//   · the drag's throw is UNCAUGHT inside an Annotorious callback — the marker moves on screen and
//     nothing is written, so the canvas silently disagrees with the log;
//   · the removal loops are NOT transactional — a throw partway through leaves some notes tombstoned,
//     `markObjectRemoved` un-called and `removeObject` never run: a half-removed object.
//
// The decisions live here, out of App.svelte, so they can be tested. The handlers are the wiring.

/** The minimum shape these decisions need from a live head record. */
export interface HeadLike {
  logicalId: string;
  deleted?: boolean;
  target: unknown;
}

/**
 * The DISTINCT logicalIds of the live notes on one canvas.
 *
 * Deduped deliberately: a head list carries a conflicted note once PER head, so a caller looping
 * `deleteNote` over it would hit the same logicalId twice, and a canvas handed the raw list draws
 * one note as two markers sharing an id — only one of which is addressable.
 */
export function liveNoteIdsOnCanvas(
  heads: readonly HeadLike[],
  canvasId: string,
  sourceOf: (target: unknown) => string | undefined,
): string[] {
  const ids = new Set<string>();
  for (const h of heads) if (!h.deleted && sourceOf(h.target) === canvasId) ids.add(h.logicalId);
  return [...ids];
}

/**
 * Which conflicted notes would make this removal abort half-way.
 *
 * ALL-OR-NOTHING is the only honest posture. Skipping the conflicted notes and removing the object
 * anyway would strand them pointing at a canvas that no longer exists — a worse outcome than a
 * refusal, and one the author could not see. So the caller checks BEFORE mutating anything and
 * refuses the whole operation, matching the per-note edit gate: a conflict is settled in Review, not
 * routed around.
 */
export function conflictsBlockingRemoval(
  objectIds: readonly string[],
  liveIdsOn: (objectId: string) => readonly string[],
  isConflicted: (logicalId: string) => boolean,
): string[] {
  const blocking: string[] = [];
  for (const objId of objectIds) for (const id of liveIdsOn(objId)) if (isConflicted(id)) blocking.push(id);
  return blocking;
}

/** Keep one representative per logicalId, first-seen order. The canvas's dedupe. */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}
