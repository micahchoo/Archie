// Structure-log serialization (Archie-a911) — the SectionRecord ↔ on-disk JSON boundary.
//
// The structure sibling of serialize.ts/deserialize.ts, in ONE module (a section is not a W3C
// annotation — no WADM page, no citation-id grammar, no `archie:` extension keys — so both
// directions fit here and the round-trip sentinels sit side by side). Page shape mirrors the
// annotation history sidecar: one page per section holding the FULL version chain, plus an
// index mapping id → page url (persist writes the index LAST — it is the commit point).
//
// IDENTITY BRIDGING (probe ledger sharp edge 4): the log's composed `SectionKey`
// (`{exhibitId}/{localId}`) is STRIPPED to the local id at this boundary — pages are keyed and
// records serialized by `localId` only; the exhibit context comes from WHERE the pages live
// (the exhibit's structure directory), and the read side recomposes via `sectionKey()`, which
// stays the only composer (and re-asserts segment containment on untrusted on-disk ids).

import { asRevId, asClientId, type ExhibitId, type RevId } from "../wadm/brand.js";
import { sectionKey, localSectionId, type SectionRecord, type SectionLog } from "./structure.js";
import type { CarryDisposition } from "../model/carry.js";

/** One SectionRecord as persisted — `localId` in place of the composed `logicalId`. */
export interface SerializedSectionRecord {
  localId: string;
  rev: string;
  version: number;
  parent: string | null;
  mergeParents?: string[];
  modifiedAt: string;
  lastEditor: string;
  /** Emitted only when true (tombstone) — mirrors the annotation `archie:deleted` emission rule. */
  deleted?: true;
  order: string;
  objectId: string;
  title: string;
  start?: string;
  prose?: string;
}

/** The on-disk history page for one section: its full version chain. */
export interface StructurePage {
  format: typeof STRUCTURE_PAGE_FORMAT;
  id: string;
  localId: string;
  items: SerializedSectionRecord[];
}

/** Page self-identification — a wrong-schema file read as a structure page fails loudly, not quietly. */
export const STRUCTURE_PAGE_FORMAT = "archie/structure-history@1";

// EXHAUSTIVENESS GUARD (rule render-core-data-integrity #3): the serialize direction carries
// EVERY SectionRecord field, so a history page → deserialize round trip is lossless. A field
// added to SectionRecord fails the build here until it gets a carry-or-drop decision at the
// persistence boundary.
const _serializeCarry = {
  logicalId: "carry", // → localId (exhibit prefix STRIPPED — sharp edge 4; recomposed on read)
  rev: "carry",
  version: "carry",
  parent: "carry",
  mergeParents: "carry", // emitted only when non-empty, as in the annotation history path
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // emitted only when true
  order: "carry",
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

/** Serialize one record. The composed key drops to its local id (see the module header). */
export function serializeSectionRecord(r: SectionRecord): SerializedSectionRecord {
  return {
    localId: localSectionId(r.logicalId),
    rev: r.rev,
    version: r.version,
    parent: r.parent,
    ...(r.mergeParents !== undefined && r.mergeParents.length > 0 ? { mergeParents: [...r.mergeParents] } : {}),
    modifiedAt: r.modifiedAt,
    lastEditor: r.lastEditor,
    ...(r.deleted ? { deleted: true as const } : {}),
    order: r.order,
    objectId: r.objectId,
    title: r.title,
    ...(r.start !== undefined ? { start: r.start } : {}),
    ...(r.prose !== undefined ? { prose: r.prose } : {}),
  };
}

// EXHAUSTIVENESS GUARD (rule #3): the inverse — every SectionRecord field is reconstructed from
// the serialized item, so serialize and deserialize can't drift (a field written but never read,
// or vice versa, is a compile error at whichever sentinel loses the field).
const _deserializeCarry = {
  logicalId: "carry", // recomposed via sectionKey(exhibitId, localId) — the SOLE composer
  rev: "carry",
  version: "carry",
  parent: "carry",
  mergeParents: "carry",
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry", // absent ⇒ false
  order: "carry",
  objectId: "carry",
  title: "carry",
  start: "carry",
  prose: "carry",
} satisfies Record<keyof SectionRecord, CarryDisposition>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Reconstruct a SectionRecord from one serialized item. Returns null if the item is not a
 * well-formed serialized section record (a foreign/garbled item is SKIPPED, not an error —
 * the same per-item tolerance as `recordFromHistoryAnnotation`). The exhibit context comes
 * from the caller (where the pages live); `sectionKey` re-asserts containment on the
 * untrusted on-disk `localId`, so a hostile id (`..`, `/`) throws rather than composing.
 */
export function sectionRecordFromSerialized(v: unknown, exhibitId: ExhibitId): SectionRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const s = v as Record<string, unknown>;
  const localId = asString(s.localId);
  const rev = asString(s.rev);
  const modifiedAt = asString(s.modifiedAt);
  const lastEditor = asString(s.lastEditor);
  const order = asString(s.order);
  const objectId = asString(s.objectId);
  const title = asString(s.title);
  if (
    localId === undefined ||
    rev === undefined ||
    typeof s.version !== "number" ||
    modifiedAt === undefined ||
    lastEditor === undefined ||
    order === undefined ||
    objectId === undefined ||
    title === undefined
  ) {
    return null;
  }
  const parent = typeof s.parent === "string" ? asRevId(s.parent) : null;
  const mpRaw = s.mergeParents;
  const mergeParents = Array.isArray(mpRaw) && mpRaw.every((x) => typeof x === "string") ? mpRaw.map((x) => asRevId(x as string)) : undefined;
  const start = asString(s.start);
  const prose = asString(s.prose);
  return {
    logicalId: sectionKey(exhibitId, localId),
    rev: asRevId(rev),
    version: s.version,
    parent,
    ...(mergeParents !== undefined && mergeParents.length > 0 ? { mergeParents } : {}),
    modifiedAt,
    lastEditor: asClientId(lastEditor),
    deleted: s.deleted === true,
    order,
    objectId,
    title,
    ...(start !== undefined ? { start } : {}),
    ...(prose !== undefined ? { prose } : {}),
  };
}

export interface StructureSerializeOptions {
  /** Prefix for per-section history page urls in the index. Default `structure/history/`. */
  historyBase?: string;
}

export interface StructureHistoryOutput {
  /** localId -> history page url. */
  index: Record<string, string>;
  /** localId -> full-chain page. */
  pages: Record<string, StructurePage>;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dedupe a log by rev, preserving first-seen order (mirrors serialize.ts). */
function dedupe(log: SectionLog): SectionRecord[] {
  const seen = new Set<RevId>();
  const out: SectionRecord[] = [];
  for (const r of log) {
    if (!seen.has(r.rev)) {
      seen.add(r.rev);
      out.push(r);
    }
  }
  return out;
}

/**
 * The structure history sidecar: one page per section holding the FULL version chain (sorted
 * version-then-rev, as the annotation history pages are), plus the index mapping localId → page
 * url. A pure idempotent function of the log.
 */
export function toStructureHistory(log: SectionLog, opts: StructureSerializeOptions = {}): StructureHistoryOutput {
  const historyBase = opts.historyBase ?? "structure/history/";
  const byLocal = new Map<string, SectionRecord[]>();
  for (const r of dedupe(log)) {
    const localId = localSectionId(r.logicalId);
    const arr = byLocal.get(localId);
    if (arr) arr.push(r);
    else byLocal.set(localId, [r]);
  }
  const index: Record<string, string> = {};
  const pages: Record<string, StructurePage> = {};
  for (const [localId, recs] of byLocal) {
    const url = `${historyBase}${localId}.json`;
    index[localId] = url;
    const items = [...recs].sort((a, b) => a.version - b.version || cmp(a.rev, b.rev)).map(serializeSectionRecord);
    pages[localId] = { format: STRUCTURE_PAGE_FORMAT, id: url, localId, items };
  }
  return { index, pages };
}

/**
 * Parse one on-disk page into records. THROWS if the value is not a structure history page at
 * all (wrong format marker / no items array) — the persist read catches that and reports the
 * page corrupt. Within a well-formed page, a malformed ITEM is skipped (per-item tolerance).
 */
export function sectionRecordsFromPage(v: unknown, exhibitId: ExhibitId): SectionRecord[] {
  if (typeof v !== "object" || v === null || (v as { format?: unknown }).format !== STRUCTURE_PAGE_FORMAT || !Array.isArray((v as { items?: unknown }).items)) {
    throw new Error(`not a structure history page (expected format ${STRUCTURE_PAGE_FORMAT})`);
  }
  const out: SectionRecord[] = [];
  for (const item of (v as { items: unknown[] }).items) {
    const rec = sectionRecordFromSerialized(item, exhibitId);
    if (rec !== null) out.push(rec);
  }
  return out;
}

/**
 * Reconstruct the log from per-page record arrays, DEDUPED by rev — the same invariant the
 * annotation `fromHistory` carries (Issue 19c): a doubled write must not put one rev in the log
 * twice, or `linearHead` reads two identical records as PLURAL heads and refuses further edits.
 * Distinct revs sharing (key, version) — a genuine unresolved merge — are preserved.
 */
export function logFromPageRecords(pages: Iterable<readonly SectionRecord[]>): SectionLog {
  const seen = new Set<RevId>();
  const out: SectionRecord[] = [];
  for (const page of pages) {
    for (const rec of page) {
      if (seen.has(rec.rev)) continue;
      seen.add(rec.rev);
      out.push(rec);
    }
  }
  return out;
}
