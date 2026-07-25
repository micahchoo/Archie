// The append-only annotation log — the authoritative SOURCE every projection reads
// (ADR-0003 / Q-3; source-before-projection / Q-5).
//
// SCOPE (Q-6): the helpers here enforce SINGLE-WRITER-LINEAR invariants — within one
// log produced by one client's appends, (logicalId, version) is unique by construction.
// The log TYPE deliberately does NOT enforce global version-id uniqueness: after a merge
// (P0-4) the log legitimately holds two plural-head records sharing (logicalId, version).
// Renumbering them is REJECTED (it would break citation integrity — Q-6); IRI
// disambiguation is the serialization layer's job (P0-6), not the log's.

import { mintLogicalId, mintRevId, type LogicalId, type RevId, type ClientId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord, Emphasis, GeoAnchor, IsoDateTime, W3CBody, W3CTarget } from "../wadm/types.js";
import type { CarryDisposition } from "../model/carry.js";

/**
 * The record shape the DAG machinery actually walks (PROBE Archie-b766, spine-gate Archie-494c
 * semantic #2: structure records ride the SAME machinery — extend, don't fork). The pure DAG
 * primitives (`append`, `parentsOf`, `linearHead` here; `headsOf`/`ancestors`/`classifyMerge`/…
 * in merge.ts; `projectHeads` in heads.ts) are generic over `R extends DagRecord<string>`; the
 * content-carrying helpers (`appendNew`/`appendEdit`/`appendDelete`/`resolveConflict`) remain
 * annotation-specific. `Id` is the logical-identity brand: `LogicalId` for annotations, a
 * composed scoped key for structure records. Inference keeps every existing annotation call
 * site exactly as strict as before (R = AnnotationRecord, logicalId = LogicalId).
 */
export interface DagRecord<Id extends string = LogicalId> {
  logicalId: Id;
  /** Per-record-unique DAG node id — `parent` targets this (ADR-0003 Refinement). */
  rev: RevId;
  /** The rev this one was edited from; `null` for v1 (the DAG root). */
  parent: RevId | null;
  /** Extra parents for a merge-resolution node (Q-7). */
  mergeParents?: RevId[];
  /** ISO datetime. In-card tiebreaker ONLY (Q-3). */
  modifiedAt: IsoDateTime;
  lastEditor: ClientId;
  /** Tombstone flag — a deleted version is still appended, never erased. */
  deleted: boolean;
}

// Compile-time guard: AnnotationRecord must remain assignable to the DAG shape — if a DAG field
// changes in wadm/types.ts without updating DagRecord (or vice versa), this line fails the build.
const _annotationIsDagRecord = (r: AnnotationRecord): DagRecord => r;
void _annotationIsDagRecord;

function isoOf(modifiedAt: string | undefined, now: number | undefined): string {
  if (modifiedAt !== undefined) return modifiedAt;
  return new Date(now ?? Date.now()).toISOString();
}

/**
 * The low-level append primitive: pure, returns a NEW frozen log with `record` appended.
 * Performs NO global-uniqueness check — that is intentional (Q-6). Invariant enforcement
 * lives in the typed helpers below; direct callers (e.g. the future mergeLog) may assemble
 * logs with colliding (logicalId, version) plural-head records.
 */
export function append<R extends DagRecord<string>>(log: readonly R[], record: NoInfer<R>): readonly R[] {
  // NoInfer: R comes from the LOG alone, so appending a foreign record type (e.g. a structure
  // record onto an annotation log) is a compile error instead of a silent union widening.
  return Object.freeze([...log, record]);
}

/** All versions of one logicalId, in log order. */
function versionsOf<R extends DagRecord<string>>(log: readonly R[], logicalId: R["logicalId"]): R[] {
  return log.filter((r) => r.logicalId === logicalId);
}

/**
 * All parents of a record: the primary `parent` plus any `mergeParents` (Q-7 merge nodes).
 * THE single definition of "referenced as a parent" — `linearHead` here and
 * `headsOf`/`ancestors` (merge.ts) all consume it, so every head count agrees: after
 * `resolveConflict`, the non-primary heads are referenced via `mergeParents` and the merge
 * node is the ONE head everywhere (the OQ-1 fix — a parent-only set here made resolved
 * notes permanently uneditable). Lives in log.ts because merge.ts imports log.ts, not
 * vice versa.
 */
export function parentsOf(record: DagRecord<string>): RevId[] {
  return [record.parent, ...(record.mergeParents ?? [])].filter((p): p is RevId => p !== null);
}

/**
 * The single head of a logicalId — the version no other version points to as a parent
 * (via `parent` OR `mergeParents`). Throws if the note is absent, or if there are PLURAL
 * heads (an unresolved concurrent merge, Q-6): editing/deleting requires a resolved single
 * head, so the caller must resolve the merge first. Heads-projection (P0-5) returns the
 * plural set instead.
 */
export function linearHead(log: AnnotationLog, logicalId: LogicalId): AnnotationRecord;
export function linearHead<R extends DagRecord<string>>(log: readonly R[], logicalId: R["logicalId"]): R;
export function linearHead<R extends DagRecord<string>>(log: readonly R[], logicalId: R["logicalId"]): R {
  const versions = versionsOf(log, logicalId);
  const referencedAsParent = new Set<RevId>(versions.flatMap(parentsOf));
  return linearHeadOf(logicalId, versions, versions.filter((r) => !referencedAsParent.has(r.rev)));
}

/**
 * The linear-head GUARDS, over an already-computed (versions, heads) pair for one logicalId.
 *
 * Exists so the incremental projection (spine/head-index.ts) can reach the same decision WITHOUT the
 * whole-log `filter` that `linearHead` above performs — that scan is O(log) per edit, and `appendEdit`
 * / `appendDelete` call it on every mutation, which made bulk note operations quadratic. Both routes
 * share this function, so the "no such note" / plural / cyclic rules have exactly ONE definition and
 * the fast path cannot silently accept something the slow path refuses.
 */
export function linearHeadOf<R extends DagRecord<string>>(
  logicalId: R["logicalId"],
  versions: readonly R[],
  heads: readonly R[],
): R {
  if (versions.length === 0) {
    throw new Error(`no such note: ${logicalId}`);
  }
  if (heads.length > 1) {
    throw new Error(`plural heads for ${logicalId} — resolve the concurrent merge first (Q-6)`);
  }
  // A finite, acyclic version DAG ALWAYS has exactly one tip not referenced as anyone's parent.
  // heads.length === 0 ⟺ every version IS referenced as a parent ⟺ a cycle (corruption — Issue 19d).
  // The old `?? versions[last]` silently HANDED BACK a version here, masking the corruption; a cycle
  // is not a recoverable state, so report it rather than guess a head.
  if (heads.length === 0) {
    throw new Error(`cyclic version DAG for ${logicalId} — corrupt annotation store (no head: every version is referenced as a parent)`);
  }
  return heads[0]!;
}

export interface NewNoteInput {
  /** Optional explicit logical id; a fresh ULID is minted when omitted. */
  logicalId?: LogicalId;
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
  motivation?: string | string[];
  /** The single Reading this note belongs to (mutually exclusive — ADR-0007). */
  reading?: string;
  /** Section attribution (Archie-6b8e): the section's LOCAL id, exhibit-scoped; omitted = unattributed. Mirrors `reading`. */
  section?: string;
  /** Authored per-note emphasis (1489); omitted = default `"normal"`. Mirrors `reading`. */
  emphasis?: Emphasis;
  /** Region-override (ADR-0018): force the whole-object frame on a region note; omitted/false = none. */
  wholeObject?: boolean;
  /** Geographic anchor (geo-truth, ADR-0015) for a Map note; omitted = none. Mirrors `emphasis`. */
  geo?: GeoAnchor;
  lastEditor: ClientId;
  /** Explicit ISO datetime; otherwise derived from `now`/Date.now(). In-card tiebreaker only (Q-3). */
  modifiedAt?: string;
  now?: number;
  rng?: () => number;
}

export interface AppendResult {
  log: AnnotationLog;
  record: AnnotationRecord;
}

/**
 * Build a brand-new note record (version 1, DAG root, parent null) WITHOUT appending it.
 *
 * Split out from `appendNew` so a caller that maintains its own log storage can obtain the record
 * without paying `append`'s whole-array copy. That copy is O(log), which makes building or bulk-
 * editing a log O(log²) — measured at 638 ms of the 777 ms it took to create 20 000 notes. The
 * three `appendX` functions below are unchanged in behaviour: each is now this builder plus
 * `append`. Keeping the builders separate also makes it STRUCTURAL, rather than an assumption a
 * caller has to verify, that `log` is used for nothing but the append itself.
 */
export function newRecord(input: NewNoteInput): AnnotationRecord {
  const logicalId = input.logicalId ?? mintLogicalId(input.now, input.rng);
  const record: AnnotationRecord = {
    logicalId,
    rev: mintRevId(input.now, input.rng),
    version: 1,
    parent: null,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: false,
    target: input.target,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.motivation !== undefined ? { motivation: input.motivation } : {}),
    ...(input.reading !== undefined ? { reading: input.reading } : {}),
    ...(input.section !== undefined ? { section: input.section } : {}),
    ...(input.emphasis !== undefined ? { emphasis: input.emphasis } : {}),
    ...(input.wholeObject ? { wholeObject: true } : {}),
    ...(input.geo !== undefined ? { geo: input.geo } : {}),
  };
  return record;
}

/** Append a brand-new note as version 1 (DAG root, parent null). */
export function appendNew(log: AnnotationLog, input: NewNoteInput): AppendResult {
  const record = newRecord(input);
  return { log: append(log, record), record };
}

export interface EditInput {
  target?: W3CTarget;
  body?: W3CBody | W3CBody[];
  motivation?: string | string[];
  /** Reading id (ADR-0007); omitted = carry forward, `null` = clear to base, string = set. */
  reading?: string | null;
  /** Section attribution (Archie-6b8e); omitted = carry forward, `null` = clear to unattributed, string = set. Mirrors `reading`. */
  section?: string | null;
  /** Emphasis (1489); omitted = carry forward, `null` = clear to default `"normal"`, value = set. */
  emphasis?: Emphasis | null;
  /** Region-override (ADR-0018); omitted = carry forward, `null`/`false` = clear, `true` = set. */
  wholeObject?: boolean | null;
  /** Geographic anchor (ADR-0015); omitted = carry forward, `null` = clear, value = set. Mirrors `emphasis`. */
  geo?: GeoAnchor | null;
  lastEditor: ClientId;
  modifiedAt?: string;
  now?: number;
}

// EXHAUSTIVENESS GUARD (Issue 21): appendEdit's record construction accounts for EVERY
// AnnotationRecord field — the identity/DAG fields are re-minted/computed, the content fields carry
// forward from the head (or the input), and `mergeParents` is the one NAMED exclusion (an edit is a
// single-parent version, not a merge node). A field added to AnnotationRecord fails the build here
// until it is classified, so an edit can't silently drop a new field.
const _editCarry = {
  logicalId: "carry", // set to the edited note's id
  rev: "carry", // re-minted
  version: "carry", // head.version + 1
  parent: "carry", // head.rev
  mergeParents: { drop: "an edit is a single-parent version; mergeParents is a merge-node-only field" },
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // false (an edit un-nothing; delete is appendDelete)
  body: "carry", // forwarded from head unless input overrides
  target: "carry",
  motivation: "carry",
  reading: "carry",
  section: "carry", // forwarded from head unless input overrides — same tri-state as reading
  emphasis: "carry",
  wholeObject: "carry",
  geo: "carry",
} satisfies Record<keyof AnnotationRecord, CarryDisposition>;

/**
 * Append an edited version of an existing note. Version = head.version + 1, parent =
 * the head's version id. Unchanged fields carry forward from the head. Throws if the
 * note is absent, has plural heads (resolve merge first), or is tombstoned.
 */
export function editRecord(logicalId: LogicalId, input: EditInput, head: AnnotationRecord): AnnotationRecord {
  if (head.deleted) {
    throw new Error(`cannot edit a tombstoned note (resurrection undefined in v1): ${logicalId}`);
  }
  const body = input.body ?? head.body;
  const motivation = input.motivation ?? head.motivation;
  const reading = input.reading === undefined ? head.reading : input.reading === null ? undefined : input.reading;
  const section = input.section === undefined ? head.section : input.section === null ? undefined : input.section;
  const emphasis = input.emphasis === undefined ? head.emphasis : input.emphasis === null ? undefined : input.emphasis;
  // wholeObject normalizes to true|undefined (only `true` is meaningful — emit-when-true): carry forward
  // on undefined, clear on null/false.
  const wholeObject = input.wholeObject === undefined ? head.wholeObject : input.wholeObject || undefined;
  const geo = input.geo === undefined ? head.geo : input.geo === null ? undefined : input.geo;
  const record: AnnotationRecord = {
    logicalId,
    rev: mintRevId(input.now),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: false,
    target: input.target ?? head.target,
    ...(body !== undefined ? { body } : {}),
    ...(motivation !== undefined ? { motivation } : {}),
    ...(reading !== undefined ? { reading } : {}),
    ...(section !== undefined ? { section } : {}),
    ...(emphasis !== undefined ? { emphasis } : {}),
    ...(wholeObject ? { wholeObject: true } : {}),
    ...(geo !== undefined ? { geo } : {}),
  };
  return record;
}

/** Append an edited version. See {@link editRecord} for the carry rules and {@link newRecord} for
 *  why the builder is separate. */
export function appendEdit(log: AnnotationLog, logicalId: LogicalId, input: EditInput, head: AnnotationRecord = linearHead(log, logicalId)): AppendResult {
  const record = editRecord(logicalId, input, head);
  return { log: append(log, record), record };
}

export interface DeleteInput {
  lastEditor: ClientId;
  modifiedAt?: string;
  now?: number;
}

// EXHAUSTIVENESS GUARD (Issue 21): a tombstone DELIBERATELY carries only identity/DAG + `target`
// (kept for citation/dereference) — the seven content fields are dropped ON PURPOSE (a deleted version
// has no content). Encoding that as NAMED `{drop}`s (not silence) means a NEW AnnotationRecord field
// forces a decision: does a tombstone keep it, or is it another content field to drop?
const _deleteCarry = {
  logicalId: "carry",
  rev: "carry", // re-minted
  version: "carry", // head.version + 1
  parent: "carry", // head.rev
  mergeParents: { drop: "a tombstone is a single-parent version, not a merge node" },
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // true
  target: "carry", // kept for citation/dereference of the deleted note
  body: { drop: "tombstone: a deleted version has no content" },
  motivation: { drop: "tombstone: a deleted version has no content" },
  reading: { drop: "tombstone: a deleted version has no content" },
  section: { drop: "tombstone: a deleted version has no content — mirrors reading; a note tombstone severs the attribution, so section un-delete never auto-revives bulk-deleted notes (visibility.ts documents the asymmetry)" },
  emphasis: { drop: "tombstone: a deleted version has no content" },
  wholeObject: { drop: "tombstone: a deleted version has no content" },
  geo: { drop: "tombstone: a deleted version has no content" },
} satisfies Record<keyof AnnotationRecord, CarryDisposition>;

/** Append a tombstone version (a delete is append-only, never a removal). */
export function deleteRecord(logicalId: LogicalId, input: DeleteInput, head: AnnotationRecord): AnnotationRecord {
  if (head.deleted) {
    throw new Error(`note already deleted: ${logicalId}`);
  }
  const record: AnnotationRecord = {
    logicalId,
    rev: mintRevId(input.now),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: true,
    target: head.target, // keep the target for citation/dereference
  };
  return record;
}

/** Append a tombstone version (a delete is append-only, never a removal). */
export function appendDelete(log: AnnotationLog, logicalId: LogicalId, input: DeleteInput, head: AnnotationRecord = linearHead(log, logicalId)): AppendResult {
  const record = deleteRecord(logicalId, input, head);
  return { log: append(log, record), record };
}
