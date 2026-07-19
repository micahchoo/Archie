// ============================================================================
// PROBE (Archie-b766) — sections as rev-logged structure records.
// NOT WIRED INTO ANY APP. Nothing outside this module and its probe test file
// (structure-probe.test.ts) imports it; the `archie.structureRevlog` flag below
// exists precisely to say so. This module demonstrates the six decided
// structure semantics (spine gate Archie-494c) on the SAME DAG machinery the
// annotation spine uses (log.ts/merge.ts/heads.ts, generalized over DagRecord
// in this probe's A1 step). Delete or promote wholesale after the probe verdict.
// ============================================================================

import { mintRevId, type ExhibitId, type RevId, type ClientId, type Brand } from "../wadm/brand.js";
import { append, linearHead, parentsOf, type DagRecord } from "./log.js";
import { headsOf } from "./merge.js";
import type { Section } from "../model/model.js";

/** Feature flag — exists, defaults OFF, wired into nothing (probe slice shape). */
export const STRUCTURE_REVLOG_FLAG = "archie.structureRevlog" as const;
export const structureRevlogEnabled = false;

// ---- Identity (decided semantic #4): composed branded scoped key ----

/** `{exhibitId}/{localId}` — scoped so structure logs from different exhibits can share a DAG log. */
export type SectionKey = Brand<string, "SectionKey">;

/** Compose the scoped key. The localId is untrusted input at some boundaries — contain it. */
export function sectionKey(exhibitId: ExhibitId, localId: string): SectionKey {
  if (localId === "" || localId.includes("/")) {
    throw new Error(`invalid section localId: ${JSON.stringify(localId)}`);
  }
  return `${exhibitId}/${localId}` as SectionKey;
}

/** The working-model Section.id half of the key (today's persist/publish shape keeps local ids). */
export function localSectionId(key: SectionKey): string {
  return key.slice(key.indexOf("/") + 1);
}

// ---- Order (decided semantic #3): child-carried fractional key, id tiebreak ----

const ORDER_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const ORDER_BASE = ORDER_DIGITS.length;

/**
 * Midpoint of two base-36 fraction strings (digits after an implied "0."). `b === null` is the
 * open upper bound. Precondition: `a < b` lexicographically; generated keys never end in '0',
 * so a strictly-between key always exists by appending digits. Hand-rolled (no dependency —
 * probe brief); same shape as the classic fractional-indexing midpoint.
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

// ---- The structure record (decided semantics #1/#2: fully collaborative, same DAG machinery) ----

/**
 * One rev of one section in the append-only structure log. Extends the generic DagRecord the
 * annotation primitives were parameterized over — NOT AnnotationRecord (a section has no W3C
 * target/body). `order` is a CONTENT field: a concurrent reorder is an ordinary DAG conflict.
 *
 * PROBE divergence from the annotation tombstone: a section tombstone CARRIES its content
 * fields, so un-delete (decided semantic #6, atomic) is a single content-copying append with
 * no parent-walk. Flagged for the build plan; the parent-walk alternative works too.
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
  /** Prose for the section pane, as in model Section.prose. */
  prose?: string;
}

export type SectionLog = readonly SectionRecord[];

interface SectionStamp {
  lastEditor: ClientId;
  modifiedAt?: string;
  now?: number;
  rng?: () => number;
}

function iso(modifiedAt: string | undefined, now: number | undefined): string {
  return modifiedAt !== undefined ? modifiedAt : new Date(now ?? Date.now()).toISOString();
}

export interface NewSectionInput extends SectionStamp {
  key: SectionKey;
  order: string;
  objectId: string;
  title: string;
  start?: string;
  prose?: string;
}

/** Append a brand-new section as version 1 (DAG root). */
export function appendNewSection(log: SectionLog, input: NewSectionInput): { log: SectionLog; record: SectionRecord } {
  if (log.some((r) => r.logicalId === input.key)) {
    throw new Error(`section already exists: ${input.key}`);
  }
  const record: SectionRecord = {
    logicalId: input.key,
    rev: mintRevId(input.now, input.rng),
    version: 1,
    parent: null,
    modifiedAt: iso(input.modifiedAt, input.now),
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

/** Append an edited version (order is edited like any content field). Throws on tombstoned head. */
export function appendEditSection(log: SectionLog, key: SectionKey, input: EditSectionInput): { log: SectionLog; record: SectionRecord } {
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
    modifiedAt: iso(input.modifiedAt, input.now),
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

/**
 * Append ONE tombstone for the section (decided semantic #6): the subtree (its notes) is hidden
 * at READ time by projection ancestry — no cascade writes. Content is carried on the tombstone
 * so un-delete is atomic and lossless.
 */
export function appendDeleteSection(log: SectionLog, key: SectionKey, input: SectionStamp): { log: SectionLog; record: SectionRecord } {
  const head = linearHead(log, key);
  if (head.deleted) throw new Error(`section already deleted: ${key}`);
  const record: SectionRecord = {
    ...contentOf(head),
    logicalId: key,
    rev: mintRevId(input.now, input.rng),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: iso(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: true,
  };
  return { log: append(log, record), record };
}

/** Atomic un-delete (semantic #6): one append flips the whole subtree visible again at read. */
export function appendUndeleteSection(log: SectionLog, key: SectionKey, input: SectionStamp): { log: SectionLog; record: SectionRecord } {
  const head = linearHead(log, key);
  if (!head.deleted) throw new Error(`section is not deleted: ${key}`);
  const record: SectionRecord = {
    ...contentOf(head),
    logicalId: key,
    rev: mintRevId(input.now, input.rng),
    version: head.version + 1,
    parent: head.rev,
    modifiedAt: iso(input.modifiedAt, input.now),
    lastEditor: input.lastEditor,
    deleted: false,
  };
  return { log: append(log, record), record };
}

function contentOf(r: SectionRecord): Pick<SectionRecord, "order" | "objectId" | "title" | "start" | "prose"> {
  return {
    order: r.order,
    objectId: r.objectId,
    title: r.title,
    ...(r.start !== undefined ? { start: r.start } : {}),
    ...(r.prose !== undefined ? { prose: r.prose } : {}),
  };
}

export interface SectionResolution extends SectionStamp {
  order?: string;
  objectId?: string;
  title?: string;
  start?: string;
  prose?: string;
}

/**
 * Resolve plural heads with a multi-parent merge node — same shape as resolveConflict for
 * annotations: primary = lexicographically-first head (deterministic), the rest in mergeParents,
 * version = max + 1, content = resolution ?? primary's.
 */
export function resolveSectionConflict(log: SectionLog, key: SectionKey, resolution: SectionResolution): SectionLog {
  const heads = headsOf(log, key);
  if (heads.length < 2) throw new Error(`no conflict to resolve for ${key} (${heads.length} head(s))`);
  const sorted = [...heads].sort((a, b) => (a.rev < b.rev ? -1 : a.rev > b.rev ? 1 : 0));
  const primary = sorted[0]!;
  const start = resolution.start ?? primary.start;
  const prose = resolution.prose ?? primary.prose;
  const record: SectionRecord = {
    logicalId: key,
    rev: mintRevId(resolution.now, resolution.rng),
    version: Math.max(...heads.map((h) => h.version)) + 1,
    parent: primary.rev,
    mergeParents: sorted.slice(1).map((h) => h.rev),
    modifiedAt: iso(resolution.modifiedAt, resolution.now),
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
  /** The head record this row projects (plural heads of one key each project a row — honest degradation). */
  rev: RevId;
  /** The working-model Section shape (id = localId, today's persist/publish grammar). */
  section: Section;
  /** Semantic #5: the objectId dangles (missing or tombstoned object) — flagged, never fatal. */
  missingObject: boolean;
  /** This key has plural live heads (unresolved concurrent structure edit). */
  conflicted: boolean;
}

export interface StructureProjection {
  /** Live sections in display order: (order asc, key asc, rev asc) — id tiebreak on equal keys (#3). */
  sections: ProjectedSection[];
  /** Keys whose every head is a tombstone — the hide-by-ancestry set (#6). */
  tombstoned: ReadonlySet<SectionKey>;
}

/**
 * Pure, idempotent projection of the structure log. `liveObjectIds` is the exhibit's current
 * object-id set; a dangling reference degrades to a flag on the row (never a throw, never a
 * write) — decided semantic #5.
 */
export function projectSections(log: SectionLog, liveObjectIds: ReadonlySet<string>): StructureProjection {
  const keys: SectionKey[] = [...new Set(log.map((r) => r.logicalId))];
  const rows: ProjectedSection[] = [];
  const tombstoned = new Set<SectionKey>();
  for (const key of keys) {
    const heads = headsOf(log, key);
    const live = heads.filter((h) => !h.deleted);
    if (live.length === 0) {
      tombstoned.add(key);
      continue;
    }
    for (const head of live) {
      rows.push({
        key,
        rev: head.rev,
        section: {
          id: localSectionId(key),
          title: head.title,
          objectId: head.objectId,
          ...(head.start !== undefined ? { start: head.start } : {}),
          ...(head.prose !== undefined ? { prose: head.prose } : {}),
        },
        missingObject: !liveObjectIds.has(head.objectId),
        conflicted: live.length > 1,
      });
    }
  }
  const orderByRev = new Map<RevId, string>(log.map((r) => [r.rev, r.order]));
  rows.sort(
    (x, y) => cmp(orderByRev.get(x.rev) ?? "", orderByRev.get(y.rev) ?? "") || cmp(x.key, y.key) || cmp(x.rev, y.rev),
  );
  return { sections: rows, tombstoned };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The working-model `Exhibit.sections` array today's publish path consumes. */
export function toWorkingSections(projection: StructureProjection): Section[] {
  return projection.sections.map((p) => p.section);
}

// ---- Hide-by-ancestry (decided semantic #6), read-derivation only ----

/**
 * Is a note attributed to `sectionOfNote` hidden because its ancestor section is tombstoned?
 * (Notes do not yet carry a section field — the build plan owns that; the harness supplies the
 * attribution. The point proven here: hiding is derived at READ from ONE section tombstone,
 * with zero cascade writes to note records, and un-delete atomically un-hides.)
 */
export function noteHiddenByStructure(projection: StructureProjection, sectionOfNote: SectionKey | undefined): boolean {
  return sectionOfNote !== undefined && projection.tombstoned.has(sectionOfNote);
}

// Re-export for the probe harness: parentsOf works on SectionRecord via DagRecord (proof of #2).
export { parentsOf as structureParentsOf };
