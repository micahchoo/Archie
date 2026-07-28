// Sections as rev-logged structure records (Archie-08af; spine gate Archie-494c).
//
// The PARALLEL content family to the annotation helpers in log.ts/merge.ts: SectionRecord rides
// the SAME generic DAG machinery (`append`, `linearHead`, `headsOf`, `mergeLogs`, …) via
// `DagRecord<SectionKey>`, but its content-level append family lives here — annotations and
// sections deliberately do NOT share content helpers (different tombstone semantics, different
// field inventories). Promoted from the reviewed probe `probe/structure-revlog`
// (`structure-probe.ts` @ 099f622, ledger `ledgers/PROBE-structure-revlog-2026-07-18.md`) with the probe's
// debts paid: carry sentinels on every hand-mapper (rule render-core-data-integrity #3),
// containment negatives on `sectionKey`, and the merge contract's C13/C14 re-derivation for
// section fields.
//
// Decided semantics (Archie-494c, fixed):
//   #1 fully collaborative  #2 same DAG machinery  #3 child-carried fractional order key
//   (content field, id tiebreak)  #4 composed branded identity `{exhibitId}/{localId}`
//   #5 referential tolerance  #6 hide-by-ancestry deletes with first-class un-delete.

import { mintRevId, type ExhibitId, type RevId, type ClientId, type Brand } from "../wadm/brand.js";
import type { IsoDateTime } from "../wadm/types.js";
import { append, linearHead, type DagRecord } from "./log.js";
import { headsOf } from "./merge.js";
import { headsByLogicalId } from "./heads.js";
import type { Section } from "../model/model.js";
import type { CarryDisposition } from "../model/carry.js";

// ---- Identity (semantic #4): composed branded scoped key ----

/** `{exhibitId}/{localId}` — scoped so structure logs from different exhibits can share a DAG log. */
export type SectionKey = Brand<string, "SectionKey">;

/**
 * Containment for one key segment — the SAME rule set as `fs/names.ts` `assertSafeName` (empty,
 * ".", "..", separators, NUL), restated here with domain wording rather than imported: a section
 * id is an IDENTITY segment today, but persist (Archie-a911) will join it into paths, and the
 * `/` rejection is also what keeps the composed-key grammar parseable (`localSectionId` splits on
 * the FIRST `/`). Local ids arrive from untrusted input (a `.archie.zip` can carry any string) —
 * same trust posture as the tauri-fs seam. Keep the predicates in step with `assertSafeName`.
 */
function assertSafeKeySegment(segment: string, role: "exhibitId" | "section localId"): void {
  if (segment === "" || segment === "." || segment === ".." || /[/\\]/.test(segment) || segment.includes("\0")) {
    throw new Error(`invalid ${role}: ${JSON.stringify(segment)}`);
  }
}

/**
 * Compose the scoped key — the SOLE composer (never template-literal a SectionKey elsewhere).
 * Rejects unsafe segments on BOTH sides: the localId is untrusted input at zip/import boundaries,
 * and an exhibitId bearing a `/` would corrupt the key grammar itself.
 */
export function sectionKey(exhibitId: ExhibitId, localId: string): SectionKey {
  assertSafeKeySegment(exhibitId, "exhibitId");
  assertSafeKeySegment(localId, "section localId");
  return `${exhibitId}/${localId}` as SectionKey;
}

/** The working-model `Section.id` half of the key (today's persist/publish grammar keeps local ids). */
export function localSectionId(key: SectionKey): string {
  return key.slice(key.indexOf("/") + 1);
}

// ---- Order (semantic #3): child-carried fractional key, id tiebreak at sort time ----

const ORDER_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const ORDER_BASE = ORDER_DIGITS.length;

/**
 * Midpoint of two base-36 fraction strings (digits after an implied "0."). `b === null` is the
 * open upper bound. Precondition: `a < b` lexicographically. Generated keys never end in '0'
 * (the final emitted digit always comes from the `db - da > 1` branch with `da >= 0`, so it is
 * >= '1'), which is what guarantees a strictly-between key always exists by appending digits.
 * Hand-rolled — same shape as the classic fractional-indexing midpoint; no dependency.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let i = 0;
    while (i < b.length && (a.charAt(i) || "0") === b.charAt(i)) i++;
    if (i > 0) return b.slice(0, i) + midpoint(a.slice(i), b.slice(i));
  }
  const da = a === "" ? 0 : ORDER_DIGITS.indexOf(a.charAt(0));
  const db = b === null ? ORDER_BASE : ORDER_DIGITS.indexOf(b.charAt(0));
  if (db - da > 1) return ORDER_DIGITS[Math.floor((da + db) / 2)]!;
  // Consecutive digits: keep a's digit, go strictly above a's tail (open top).
  return ORDER_DIGITS[da]! + midpoint(a.slice(1), null);
}

/** A key strictly between `a` and `b` (null = open end). `orderKeyBetween(null, null)` seeds "i". */
export function orderKeyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`orderKeyBetween: "${a}" >= "${b}"`);
  }
  return midpoint(a ?? "", b);
}

// ---- The structure record (semantics #1/#2: fully collaborative, same DAG machinery) ----

/**
 * One rev of one section in the append-only structure log. Extends the generic DagRecord the
 * annotation primitives are parameterized over — NOT AnnotationRecord (a section has no W3C
 * target/body). `order` is a CONTENT field: a concurrent reorder is an ordinary DAG conflict.
 *
 * Tombstone semantics DIVERGE from annotations (`_deleteCarry` in log.ts drops content): a
 * section tombstone CARRIES its content fields, so un-delete (semantic #6, first-class) is a
 * single lossless content-copying append with no parent-walk. Decided default for this ticket.
 */
export interface SectionRecord extends DagRecord<SectionKey> {
  /** Citation ordinal per key — same meaning as AnnotationRecord.version. */
  version: number;
  /** Fractional order key (content field, child-carried). Sibling order = (order, key) ascending. */
  order: string;
  /** The Object this section activates — a REFERENCE that may dangle (semantic #5: read-time tolerance). */
  objectId: string;
  title: string;
  /** Camera media-fragment (ADR-0005 grammar), as in model Section.start. */
  start?: string;
  /** Prose for the section pane, as in model Section.prose. Raw `archie:` cites — publish rewrites projections, never the log. */
  prose?: string;
}

export type SectionLog = readonly SectionRecord[];

/** The authorship stamp shared by every section append. `now`/`rng` feed deterministic rev minting in tests. */
export interface SectionStamp {
  lastEditor: ClientId;
  /** Explicit ISO datetime; otherwise derived from `now`/Date.now(). In-card tiebreaker only (Q-3). */
  modifiedAt?: string;
  now?: number;
  rng?: () => number;
}

function isoOf(modifiedAt: string | undefined, now: number | undefined): IsoDateTime {
  return modifiedAt !== undefined ? modifiedAt : new Date(now ?? Date.now()).toISOString();
}

export interface AppendSectionResult {
  log: SectionLog;
  record: SectionRecord;
}

export interface NewSectionInput extends SectionStamp {
  key: SectionKey;
  order: string;
  objectId: string;
  title: string;
  start?: string;
  prose?: string;
}

// EXHAUSTIVENESS GUARD (rule render-core-data-integrity #3): appendNewSection's record
// construction accounts for EVERY SectionRecord field — identity/DAG fields minted/fixed for a
// v1 root, content fields taken from the input. A field added to SectionRecord fails the build
// here (and forces a NewSectionInput decision) instead of silently never being authorable.
const _newSectionCarry = {
  logicalId: "carry", // input.key
  rev: "carry", // minted
  version: "carry", // 1
  parent: "carry", // null (DAG root)
  mergeParents: { drop: "a v1 root is not a merge node; mergeParents is a merge-node-only field" },
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // false
  order: "carry",
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

/** Append a brand-new section as version 1 (DAG root). Throws if the key already has history
 *  (revive a tombstoned key via `appendUndeleteSection`, never a fresh create). */
export function appendNewSection(log: SectionLog, input: NewSectionInput): AppendSectionResult {
  if (log.some((r) => r.logicalId === input.key)) {
    throw new Error(`section already exists: ${input.key}`);
  }
  const record: SectionRecord = {
    logicalId: input.key,
    rev: mintRevId(input.now, input.rng),
    version: 1,
    parent: null,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: false,
    order: input.order,
    objectId: input.objectId,
    title: input.title,
    ...(input.start !== undefined ? { start: input.start } : {}),
    ...(input.prose !== undefined ? { prose: input.prose } : {}),
  };
  return { log: append(log, record), record };
}

export interface EditSectionInput extends SectionStamp {
  order?: string;
  objectId?: string;
  title?: string;
  /** omitted = carry forward; null = clear. */
  start?: string | null;
  prose?: string | null;
}

// EXHAUSTIVENESS GUARD (rule #3): an edit accounts for every field — identity/DAG re-minted or
// computed, content carried from the head unless the input overrides. Mirrors `_editCarry`
// (log.ts): `mergeParents` is the one NAMED exclusion.
const _editSectionCarry = {
  logicalId: "carry", // the edited section's key
  rev: "carry", // re-minted
  version: "carry", // head.version + 1
  parent: "carry", // head.rev
  mergeParents: { drop: "an edit is a single-parent version; mergeParents is a merge-node-only field" },
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // false (a delete is appendDeleteSection)
  order: "carry", // forwarded from head unless input overrides (a reorder is an ordinary edit)
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

/**
 * Append an edited version (order is edited like any content field). Throws on an absent key,
 * plural heads (resolve first — C4), or a tombstoned head (`appendUndeleteSection` is the
 * sanctioned revive; the annotation "resurrection undefined" refusal does NOT apply to sections,
 * but edit-the-tombstone is still not the path).
 */
export function appendEditSection(log: SectionLog, key: SectionKey, input: EditSectionInput): AppendSectionResult {
  const head = linearHead(log, key);
  if (head.deleted) {
    throw new Error(`cannot edit a tombstoned section (use appendUndeleteSection): ${key}`);
  }
  const start = input.start === undefined ? head.start : input.start === null ? undefined : input.start;
  const prose = input.prose === undefined ? head.prose : input.prose === null ? undefined : input.prose;
  const record: SectionRecord = {
    logicalId: key,
    rev: mintRevId(input.now, input.rng),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: false,
    order: input.order ?? head.order,
    objectId: input.objectId ?? head.objectId,
    title: input.title ?? head.title,
    ...(start !== undefined ? { start } : {}),
    ...(prose !== undefined ? { prose } : {}),
  };
  return { log: append(log, record), record };
}

// EXHAUSTIVENESS GUARD (rule #3) for `contentOf` — the section content picker used by
// delete/undelete. Identity/DAG fields are NAMED drops (the appending boundary re-mints or
// computes them); every content field carries. A new SectionRecord field fails the build here
// until classified content-vs-identity.
const _contentOfCarry = {
  logicalId: { drop: "identity — set by the appending boundary" },
  rev: { drop: "DAG — re-minted by the appending boundary" },
  version: { drop: "DAG — computed (head.version + 1) by the appending boundary" },
  parent: { drop: "DAG — set to head.rev by the appending boundary" },
  mergeParents: { drop: "merge-node-only field; never part of content" },
  modifiedAt: { drop: "stamp — set by the appending boundary" },
  lastEditor: { drop: "stamp — set by the appending boundary" },
  deleted: { drop: "the flag being flipped by the appending boundary" },
  order: "carry",
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

function contentOf(r: SectionRecord): Pick<SectionRecord, "order" | "objectId" | "title" | "start" | "prose"> {
  return {
    order: r.order,
    objectId: r.objectId,
    title: r.title,
    ...(r.start !== undefined ? { start: r.start } : {}),
    ...(r.prose !== undefined ? { prose: r.prose } : {}),
  };
}

// EXHAUSTIVENESS GUARD (rule #3) shared by appendDeleteSection AND appendUndeleteSection (their
// record construction is identical except the `deleted` flag and the precondition). This sentinel
// is where the tombstone-semantics divergence from annotations is COMPILER-VISIBLE: annotation
// `_deleteCarry` (log.ts) drops six content fields; a section tombstone carries ALL content
// (via `contentOf`) so un-delete is one lossless append.
const _tombstoneFlipCarry = {
  logicalId: "carry",
  rev: "carry", // re-minted
  version: "carry", // head.version + 1
  parent: "carry", // head.rev
  mergeParents: { drop: "a tombstone/revive is a single-parent version, not a merge node" },
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // flipped
  order: "carry", // tombstone carries content — the un-delete losslessness contract
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

function flipDeleted(log: SectionLog, key: SectionKey, input: SectionStamp, head: SectionRecord, deleted: boolean): AppendSectionResult {
  const record: SectionRecord = {
    ...contentOf(head),
    logicalId: key,
    rev: mintRevId(input.now, input.rng),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: isoOf(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted,
  };
  return { log: append(log, record), record };
}

/**
 * Append ONE content-carrying tombstone (semantic #6): the section's subtree (its notes) is
 * hidden at READ time by projection ancestry — zero cascade writes.
 */
export function appendDeleteSection(log: SectionLog, key: SectionKey, input: SectionStamp): AppendSectionResult {
  const head = linearHead(log, key);
  if (head.deleted) throw new Error(`section already deleted: ${key}`);
  return flipDeleted(log, key, input, head, true);
}

/**
 * First-class atomic un-delete (semantic #6): ONE append restores the pre-delete content
 * (deep-equal — the tombstone carried it) and flips the whole subtree visible again at read.
 * The annotation family's resurrection-refusal deliberately does NOT apply to sections.
 */
export function appendUndeleteSection(log: SectionLog, key: SectionKey, input: SectionStamp): AppendSectionResult {
  const head = linearHead(log, key);
  if (!head.deleted) throw new Error(`section is not deleted: ${key}`);
  return flipDeleted(log, key, input, head, false);
}

// ---- Conflict resolution: the ONE merge contract (spine/MERGE-CONTRACT.md), section fields ----

export interface SectionResolution extends SectionStamp {
  /** Resolved content; each omitted field defaults per C13/C14 (required → primary head's;
   *  optional `start`/`prose` → inherited from the first head in sorted order that carries it). */
  order?: string;
  objectId?: string;
  title?: string;
  start?: string;
  prose?: string;
}

// EXHAUSTIVENESS GUARD (rule #3): the merge node accounts for every field — mirrors `_mergeCarry`
// (merge.ts). This is the C13/C14 re-derivation the contract's scale-up section calls for:
// required content (order/objectId/title) defaults to the PRIMARY head (C13); optional content
// (start/prose) is INHERITED from any head that carries it (C14), so "has prose" vs "no prose"
// keeps the prose instead of dropping it on rev ordering. Unlike annotations (OQ-3), a tombstone
// primary still contributes content — section tombstones carry it.
const _resolveSectionCarry = {
  logicalId: "carry",
  rev: "carry", // minted
  version: "carry", // max(head versions) + 1
  parent: "carry", // lexicographically-first head (deterministic primary — C12)
  mergeParents: "carry", // the other reconciled heads, sorted
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // false — resolve-live-then-delete is the sanctioned path (C15)
  order: "carry", // resolution ?? primary (C13)
  objectId: "carry", // resolution ?? primary (C13)
  title: "carry", // resolution ?? primary (C13)
  start: "carry", // resolution ?? inherited from any head (C14)
  prose: "carry", // resolution ?? inherited from any head (C14)
} satisfies Record<keyof SectionRecord, CarryDisposition>;

/**
 * Resolve plural heads with one multi-parent MERGE NODE — same contract as annotation
 * `resolveConflict` (C12): primary = lexicographically-first head, the rest in `mergeParents`,
 * `version = max + 1`, `deleted: false` always, content = resolution ?? defaults (see
 * `_resolveSectionCarry`). After this, `headsOf` returns the single merge node on every replica
 * that merges it in. Throws if there is no conflict (< 2 heads).
 */
export function resolveSectionConflict(log: SectionLog, key: SectionKey, resolution: SectionResolution): SectionLog {
  const heads = headsOf(log, key);
  if (heads.length < 2) {
    throw new Error(`no conflict to resolve for ${key} (${heads.length} head(s))`);
  }
  const sorted = [...heads].sort((a, b) => cmp(a.rev, b.rev));
  const primary = sorted[0]!;
  const start = resolution.start ?? sorted.find((h) => h.start !== undefined)?.start;
  const prose = resolution.prose ?? sorted.find((h) => h.prose !== undefined)?.prose;
  const record: SectionRecord = {
    logicalId: key,
    rev: mintRevId(resolution.now, resolution.rng),
    version: Math.max(...heads.map((h) => h.version)) + 1,
    parent: primary.rev,
    mergeParents: sorted.slice(1).map((h) => h.rev),
    modifiedAt: isoOf(resolution.modifiedAt, resolution.now),
    lastEditor: resolution.lastEditor,
    deleted: false,
    order: resolution.order ?? primary.order,
    objectId: resolution.objectId ?? primary.objectId,
    title: resolution.title ?? primary.title,
    ...(start !== undefined ? { start } : {}),
    ...(prose !== undefined ? { prose } : {}),
  };
  return append(log, record);
}

// ---- Projection: rev-log → ordered working sections (read-derivation only) ----

export interface ProjectedSection {
  key: SectionKey;
  /** The head record this row projects (plural live heads of one key each project a row — honest degradation). */
  rev: RevId;
  /** This head's fractional order key — drives the row sort; callers use it to compute insert positions. */
  order: string;
  /** The working-model Section shape (id = localId, today's persist/publish grammar). */
  section: Section;
  /** Semantic #5: the objectId dangles (missing or removed object) — flagged, never fatal, reference kept raw. */
  missingObject: boolean;
  /** This key has plural heads (unresolved concurrent edit — writes are gated until resolved, C4).
   *  Includes part-hidden delete-vs-edit branches (C15): plural heads with one live row. */
  conflicted: boolean;
}

export interface StructureProjection {
  /** Live sections in display order: (order asc, key asc, rev asc) — id tiebreak on equal order keys (#3). */
  sections: ProjectedSection[];
  /** Keys whose every head is a tombstone — the hide-by-ancestry set (#6). */
  tombstoned: ReadonlySet<SectionKey>;
}

// EXHAUSTIVENESS GUARD (rule #3): the head → working-`Section` mapper accounts for every
// SectionRecord field. DAG/stamp fields are NAMED drops (they live on the row / in the log, not
// in the working shape); a new content field fails the build here until the projection decides
// whether the working Section carries it.
const _projectionCarry = {
  logicalId: "carry", // → Section.id via localSectionId (prefix stripped), and the row's `key`
  rev: { drop: "DAG node id — carried on the row as `rev`, not part of the working Section" },
  version: { drop: "citation ordinal — serialization concern, not part of the working Section" },
  parent: { drop: "DAG topology — projection reads heads only" },
  mergeParents: { drop: "DAG topology — projection reads heads only" },
  modifiedAt: { drop: "stamp — in-card tiebreaker only (Q-3), not part of the working Section" },
  lastEditor: { drop: "stamp — not part of the working Section" },
  deleted: { drop: "consumed by the projection itself (live-vs-tombstoned split)" },
  order: { drop: "carried on the row as `order` — working Section order is the ARRAY order" },
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

/**
 * Pure, idempotent projection of the structure log. `liveObjectIds` is the exhibit's current
 * object-id set; a dangling reference degrades to a flag on the row (never a throw, never a
 * write) — semantic #5. Tombstoned keys are omitted from `sections` and reported in `tombstoned`.
 *
 * Cost is O(records) via the single-pass group-by `headsByLogicalId` (heads.ts, Archie-c16d) —
 * replaced the per-key `headsOf` O(records × keys) scan the probe ledger flagged (sharp edge #3;
 * 8–12ms at 2000 records). Per-key semantics are identical, pinned by projection-groupby.test.ts.
 */
export function projectSections(log: SectionLog, liveObjectIds: ReadonlySet<string>): StructureProjection {
  const rows: ProjectedSection[] = [];
  const tombstoned = new Set<SectionKey>();
  for (const [key, heads] of headsByLogicalId(log)) {
    const live = heads.filter((h) => !h.deleted);
    if (live.length === 0) {
      tombstoned.add(key);
      continue;
    }
    for (const head of live) {
      rows.push({
        key,
        rev: head.rev,
        order: head.order,
        section: {
          id: localSectionId(key),
          title: head.title,
          objectId: head.objectId,
          ...(head.start !== undefined ? { start: head.start } : {}),
          ...(head.prose !== undefined ? { prose: head.prose } : {}),
        },
        missingObject: !liveObjectIds.has(head.objectId),
        conflicted: heads.length > 1,
      });
    }
  }
  rows.sort((x, y) => cmp(x.order, y.order) || cmp(x.key, y.key) || cmp(x.rev, y.rev));
  return { sections: rows, tombstoned };
}

/** The working-model `Exhibit.sections` array today's publish path consumes. */
export function toWorkingSections(projection: StructureProjection): Section[] {
  return projection.sections.map((p) => p.section);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
