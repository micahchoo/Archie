// The carry-boundary guard idiom (ISSUES.md Issue 21).
//
// Every place that hand-spreads model fields from one shape to another —
// `...(x !== undefined ? {x} : {})` chains — is a DENYLIST pretending to be an allowlist: a field
// ADDED to the source type compiles clean at the boundary while silently not carrying. This class of
// bug already bit four times (sections/readings dropped by loadLibrary; note-copy dropping
// emphasis/wholeObject/geo). The fix is to make the COMPILER own the field inventory.
//
// The idiom: co-locate a `satisfies Record<keyof Source, CarryDisposition>` SENTINEL with each
// boundary — a zero-runtime const that enumerates EVERY source field as `"carry"` or a NAMED
// `{ drop: "<reason>" }`. It fails to compile the moment `Source` grows a field nobody classified, so a
// new field can't be silently dropped: the build forces a carry-or-drop decision at each boundary, and
// deliberate exclusions (a tombstone's content fields, a template marker) are named, not silent.

/** A field's disposition at a carry boundary: `"carry"` (copy it when present) or a NAMED deliberate
 *  exclusion. Value type of a `satisfies Record<keyof Source, CarryDisposition>` sentinel — the sentinel
 *  fails to compile when `Source` grows a field nobody classified. */
export type CarryDisposition = "carry" | { readonly drop: string };
