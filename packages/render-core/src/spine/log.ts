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
import type { AnnotationLog, AnnotationRecord, W3CBody, W3CTarget } from "../wadm/types.js";

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
export function append(log: AnnotationLog, record: AnnotationRecord): AnnotationLog {
  return Object.freeze([...log, record]);
}

/** All versions of one logicalId, in log order. */
function versionsOf(log: AnnotationLog, logicalId: LogicalId): AnnotationRecord[] {
  return log.filter((r) => r.logicalId === logicalId);
}

/**
 * The single head of a logicalId — the version no other version points to as parent.
 * Throws if the note is absent, or if there are PLURAL heads (an unresolved concurrent
 * merge, Q-6): editing/deleting requires a resolved single head, so the caller must
 * resolve the merge first. Heads-projection (P0-5) returns the plural set instead.
 */
export function linearHead(log: AnnotationLog, logicalId: LogicalId): AnnotationRecord {
  const versions = versionsOf(log, logicalId);
  if (versions.length === 0) {
    throw new Error(`no such note: ${logicalId}`);
  }
  const referencedAsParent = new Set<RevId>(
    versions.map((r) => r.parent).filter((p): p is RevId => p !== null),
  );
  const heads = versions.filter((r) => !referencedAsParent.has(r.rev));
  if (heads.length > 1) {
    throw new Error(`plural heads for ${logicalId} — resolve the concurrent merge first (Q-6)`);
  }
  // A linear chain always has exactly one not-referenced-as-parent tip.
  return heads[0] ?? versions[versions.length - 1]!;
}

export interface NewNoteInput {
  /** Optional explicit logical id; a fresh ULID is minted when omitted. */
  logicalId?: LogicalId;
  target: W3CTarget;
  body?: W3CBody | W3CBody[];
  motivation?: string | string[];
  /** @deprecated Layer ids. Use `reading` (ADR-0007). */
  layers?: string[];
  /** The single Reading this note belongs to (mutually exclusive — ADR-0007). */
  reading?: string;
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

/** Append a brand-new note as version 1 (DAG root, parent null). */
export function appendNew(log: AnnotationLog, input: NewNoteInput): AppendResult {
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
    ...(input.layers !== undefined ? { layers: input.layers } : {}),
    ...(input.reading !== undefined ? { reading: input.reading } : {}),
  };
  return { log: append(log, record), record };
}

export interface EditInput {
  target?: W3CTarget;
  body?: W3CBody | W3CBody[];
  motivation?: string | string[];
  /** @deprecated Layer ids; omitted = carry forward from the head. */
  layers?: string[];
  /** Reading id (ADR-0007); omitted = carry forward, `null` = clear to base, string = set. */
  reading?: string | null;
  lastEditor: ClientId;
  modifiedAt?: string;
  now?: number;
}

/**
 * Append an edited version of an existing note. Version = head.version + 1, parent =
 * the head's version id. Unchanged fields carry forward from the head. Throws if the
 * note is absent, has plural heads (resolve merge first), or is tombstoned.
 */
export function appendEdit(log: AnnotationLog, logicalId: LogicalId, input: EditInput): AppendResult {
  const head = linearHead(log, logicalId);
  if (head.deleted) {
    throw new Error(`cannot edit a tombstoned note (resurrection undefined in v1): ${logicalId}`);
  }
  const body = input.body ?? head.body;
  const motivation = input.motivation ?? head.motivation;
  const layers = input.layers ?? head.layers;
  const reading = input.reading === undefined ? head.reading : input.reading === null ? undefined : input.reading;
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
    ...(layers !== undefined ? { layers } : {}),
    ...(reading !== undefined ? { reading } : {}),
  };
  return { log: append(log, record), record };
}

export interface DeleteInput {
  lastEditor: ClientId;
  modifiedAt?: string;
  now?: number;
}

/** Append a tombstone version (a delete is append-only, never a removal). */
export function appendDelete(log: AnnotationLog, logicalId: LogicalId, input: DeleteInput): AppendResult {
  const head = linearHead(log, logicalId);
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
  return { log: append(log, record), record };
}
