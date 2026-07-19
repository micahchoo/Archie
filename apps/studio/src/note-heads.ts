// One representative head per note, for LIST rendering (Archie-d48e).
//
// `session.notes()` returns projectHeads — EVERY live head per logicalId. An edit-vs-edit conflict is
// exactly `headsOf(id).length > 1`, so after such a merge the note list holds 2+ records sharing one
// logicalId. Keying the inspector's `{#each}` by logicalId (so a live edit doesn't remount the row) then
// hits duplicate keys — a Svelte 5 runtime error — and the review-gate branch would emit a duplicate
// `id="note-editor-{logicalId}"`. Both bite precisely in the conflicted state the gate exists for.
//
// This collapses the plural heads to ONE representative per note (the max-rev head — a deterministic
// tiebreak; rev ids are mint-ordered) so the list, region ids, and object-scoped counts are per-NOTE, not
// per-head. Both competing sides stay reachable for resolution via `session.conflictHeads(id)` (MergeReview)
// — this projection is only for display. First-seen order is preserved (the caller's ordering is untouched).
// Pure + headless-testable (cf. roving.ts / reorder-state.ts).

/** Keep one representative record per logicalId (the max-rev head), preserving first-seen order. */
export function dedupeHeadsByLogicalId<R extends { logicalId: string; rev: string }>(records: readonly R[]): R[] {
  const byId = new Map<string, R>();
  const order: string[] = [];
  for (const r of records) {
    const existing = byId.get(r.logicalId);
    if (existing === undefined) {
      byId.set(r.logicalId, r);
      order.push(r.logicalId);
    } else if (r.rev > existing.rev) {
      byId.set(r.logicalId, r); // a plural head → keep the max-rev one as the row's representative
    }
  }
  return order.map((id) => byId.get(id)!);
}
