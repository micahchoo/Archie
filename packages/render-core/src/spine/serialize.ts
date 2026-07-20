// History-sidecar WADM serialization (ADR-0003 / Q-3) — "log + projection".
//
// toHeadsPage: the canvas AnnotationPage viewers load — ONLY head version(s), each linking
//   out via archie:hasHistory (→ history page) and prov:wasRevisionOf (→ prior version's
//   citation id). A pure WADM consumer assigns these to W3CAnnotation and ignores them.
//   Heads ALSO carry WADM-standard authorship (Archie-3452): `created` (the DAG root's
//   modifiedAt) + `creator` (the head's lastEditor as an Agent, synthetic ids suppressed).
// toHistory: per-logicalId AnnotationPage with the FULL version chain + an index map. These
//   are the citation-dereference targets.
//
// Citation id = {baseUrl}{logicalId}/v{n}. Under concurrency the bare grammar collides, so
// it is disambiguated (Q-6): among records sharing (logicalId, version), the lexicographically
// lowest `rev` keeps the bare id, the rest get a `~{rev}` suffix. This is stable regardless of
// merge order (rev is a content-independent ULID), keeps the common no-collision case clean,
// and guarantees a valid JSON-LD page (no two items share an id).
// NOTE: preserving a SPECIFIC externally-published citation across a later collision needs a
// published-id registry (future) — out of Phase-0 scope; this rule is deterministic, not
// publish-history-aware.

import type { LogicalId, RevId } from "../wadm/brand.js";
import type { AnnotationLog, AnnotationRecord, IsoDateTime, W3CAgent, W3CAnnotation, ArchieAnnotation, W3CAnnotationPage } from "../wadm/types.js";
import {
  WADM_CONTEXT,
  ARCHIE_HAS_HISTORY,
  PROV_WAS_REVISION_OF,
  ARCHIE_LOGICAL_ID,
  ARCHIE_READING,
  ARCHIE_SECTION,
  ARCHIE_EMPHASIS,
  ARCHIE_WHOLE_OBJECT,
  ARCHIE_GEO,
  ARCHIE_REV,
  ARCHIE_PARENT,
  ARCHIE_MERGE_PARENTS,
  ARCHIE_VERSION,
  ARCHIE_LAST_EDITOR,
  ARCHIE_DELETED,
} from "../wadm/types.js";
import { projectHeads } from "./heads.js";
import type { CarryDisposition } from "../model/carry.js";

// EXHAUSTIVENESS GUARD (Issue 21): the history serialization — `recordToAnnotation` (base WADM fields)
// plus `withDagMeta` (the archie: DAG + extension fields) — carries EVERY AnnotationRecord field, so a
// history page → deserialize round trip is lossless. This sentinel fails to compile if a field is added
// to AnnotationRecord without a carry-or-drop decision at this boundary (the hand-spread class of bug
// that silently dropped new fields). Zero runtime; it exists only to break the build loudly.
const _historyCarry = {
  target: "carry", // recordToAnnotation
  modifiedAt: "carry", // recordToAnnotation → `modified`; heads pages ALSO surface the DAG root's value as WADM `created` (Archie-3452)
  body: "carry", // recordToAnnotation
  motivation: "carry", // recordToAnnotation
  logicalId: "carry", // withDagMeta ↓
  rev: "carry",
  version: "carry",
  lastEditor: "carry", // withDagMeta → archie:lastEditor; heads pages ALSO project it as WADM `creator` unless synthetic (Archie-3452)
  parent: "carry",
  mergeParents: "carry",
  deleted: "carry",
  reading: "carry",
  section: "carry", // withDagMeta/withExtensions → archie:section, emitted only when set (byte-stable)
  emphasis: "carry",
  wholeObject: "carry",
  geo: "carry",
} satisfies Record<keyof AnnotationRecord, CarryDisposition>;

export interface SerializeOptions {
  /** Prefix for citation ids, e.g. `https://user.github.io/lib/exhibit/`. Default "" (relative). */
  baseUrl?: string;
  /** Prefix for per-logicalId history page urls. Default `annotations/history/`. */
  historyBase?: string;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Dedupe a log by rev, preserving first-seen order. */
function dedupe(log: AnnotationLog): AnnotationRecord[] {
  const seen = new Set<RevId>();
  const out: AnnotationRecord[] = [];
  for (const r of log) {
    if (!seen.has(r.rev)) {
      seen.add(r.rev);
      out.push(r);
    }
  }
  return out;
}

/** logicalId → the DAG-root record's `modifiedAt`: the note's creation time (Archie-3452). The root
 *  is the `parent: null` record (v1); a partial log missing its root simply yields no entry (the
 *  heads page then omits `created` rather than inventing one). Plural roots per logicalId cannot
 *  arise from the append family (logicalIds are minted ULIDs), but a hand-built log is tolerated
 *  deterministically: earliest `modifiedAt` wins, ties broken by lowest `rev`. */
function rootCreatedAt(log: AnnotationLog): Map<LogicalId, IsoDateTime> {
  const roots = new Map<LogicalId, AnnotationRecord>();
  for (const r of dedupe(log)) {
    if (r.parent !== null) continue;
    const cur = roots.get(r.logicalId);
    if (cur === undefined || r.modifiedAt < cur.modifiedAt || (r.modifiedAt === cur.modifiedAt && r.rev < cur.rev)) roots.set(r.logicalId, r);
  }
  const out = new Map<LogicalId, IsoDateTime>();
  for (const [lid, r] of roots) out.set(lid, r.modifiedAt);
  return out;
}

/** Synthetic session ids that must NEVER surface as a WADM `creator` (Archie-3452 charting decision).
 *  These stamp `lastEditor` on records authored without a real identity: "anonymous" (the studio's
 *  no-display-name fallback, App.svelte), "working-reader" (publish/working.ts's read-session default)
 *  and "viewer-live" (the viewer's live-source probe, published.ts). They are machine ids, not
 *  authorship — a pure IIIF/WADM consumer (Mirador) would render them as a person's name. Only real
 *  authored names become a creator; `archie:lastEditor` on history pages is untouched either way. */
const SYNTHETIC_EDITORS: ReadonlySet<string> = new Set(["anonymous", "working-reader", "viewer-live"]);

/** The WADM Agent for a head record's `lastEditor`, or undefined when the stamp is synthetic/blank. */
function creatorOf(lastEditor: string): W3CAgent | undefined {
  if (lastEditor.trim() === "" || SYNTHETIC_EDITORS.has(lastEditor)) return undefined;
  return { type: "Person", name: lastEditor };
}

/**
 * Citation context for heads-page emission — built from the FULL log (Q-6 ids need every record;
 * `created` needs each logicalId's DAG root), then shared across per-canvas head subsets.
 */
export interface CitationContext {
  /** rev → collision-disambiguated citation id (Q-6). */
  ids: Map<RevId, string>;
  /** logicalId → the DAG-root record's `modifiedAt` (the note's WADM `created` — Archie-3452). */
  createdAt: Map<LogicalId, IsoDateTime>;
}

/** Map every record's rev to its (collision-disambiguated) citation id (Q-6). */
function citationIds(log: AnnotationLog, baseUrl: string): Map<RevId, string> {
  const groups = new Map<string, AnnotationRecord[]>();
  for (const r of dedupe(log)) {
    const key = `${r.logicalId}/v${r.version}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const map = new Map<RevId, string>();
  for (const [key, recs] of groups) {
    const sorted = [...recs].sort((a, b) => cmp(a.rev, b.rev));
    sorted.forEach((r, i) => {
      map.set(r.rev, i === 0 ? `${baseUrl}${key}` : `${baseUrl}${key}~${r.rev}`);
    });
  }
  return map;
}

/** Build a base WADM Annotation from a record with an explicit id. Pure (no link-outs). */
export function recordToAnnotation(record: AnnotationRecord, id: string, withContext = false): ArchieAnnotation {
  const ann: ArchieAnnotation = {
    ...(withContext ? { "@context": WADM_CONTEXT } : {}),
    id,
    type: "Annotation",
    target: record.target,
    modified: record.modifiedAt,
    ...(record.body !== undefined ? { body: record.body } : {}),
    ...(record.motivation !== undefined ? { motivation: record.motivation } : {}),
  };
  return ann;
}

function withProvLink(ann: ArchieAnnotation, parent: RevId | null, ids: Map<RevId, string>): ArchieAnnotation {
  if (parent !== null) {
    const parentId = ids.get(parent);
    if (parentId !== undefined) ann[PROV_WAS_REVISION_OF] = parentId;
  }
  return ann;
}

/** WADM-standard authorship on a HEAD annotation (Archie-3452): `created` = the logicalId's DAG-root
 *  `modifiedAt`, `creator` = the head's `lastEditor` as a WADM Agent — so a pure IIIF/WADM consumer
 *  sees when a note was born and who last authored it, not just `modified`. Each field is emitted
 *  ONLY when known/real: no root in the log ⇒ no `created`; a synthetic/blank editor ⇒ no `creator`.
 *  Heads-page only — history pages keep the canonical `archie:lastEditor` and stay byte-stable. */
function withAuthorship(ann: ArchieAnnotation, record: AnnotationRecord, createdAt: Map<LogicalId, IsoDateTime>): ArchieAnnotation {
  const created = createdAt.get(record.logicalId);
  if (created !== undefined) ann.created = created;
  const creator = creatorOf(record.lastEditor);
  if (creator !== undefined) ann.creator = creator;
  return ann;
}

/** Embed the archie DAG metadata as extension fields (history annotations only — Archie reads
 *  these to reconstruct the log; pure consumers ignore them). */
function withDagMeta(ann: ArchieAnnotation, record: AnnotationRecord): ArchieAnnotation {
  const a = ann as ArchieAnnotation & Record<string, unknown>;
  a[ARCHIE_LOGICAL_ID] = record.logicalId;
  a[ARCHIE_REV] = record.rev;
  a[ARCHIE_VERSION] = record.version;
  a[ARCHIE_LAST_EDITOR] = record.lastEditor;
  a[ARCHIE_PARENT] = record.parent; // RevId | null
  if (record.mergeParents !== undefined && record.mergeParents.length > 0) a[ARCHIE_MERGE_PARENTS] = record.mergeParents;
  if (record.deleted) a[ARCHIE_DELETED] = true;
  if (record.reading !== undefined) a[ARCHIE_READING] = record.reading;
  if (record.section !== undefined) a[ARCHIE_SECTION] = record.section;
  if (record.emphasis !== undefined) a[ARCHIE_EMPHASIS] = record.emphasis;
  if (record.wholeObject === true) a[ARCHIE_WHOLE_OBJECT] = true;
  if (record.geo !== undefined) a[ARCHIE_GEO] = record.geo;
  return ann;
}

/**
 * Embed a head annotation's Archie extension fields — ONE cast site for all of them (was five
 * near-identical `withX` mutators, each carrying its own `as unknown as Record` cast). Each field
 * is emitted ONLY when set, so notes without it stay byte-identical (a pure consumer ignores every
 * `archie:` key; `emphasisOf`/`geoOf` read absence as the default). `archie:layers` is NO LONGER
 * emitted: the ADR-0007 contraction landed — legacy layers fold into Tags at the load boundary
 * (deserialize.ts), so no record past load carries `layers` to serialize.
 */
function withExtensions(ann: ArchieAnnotation, record: AnnotationRecord): ArchieAnnotation {
  const a = ann as ArchieAnnotation & Record<string, unknown>;
  if (record.reading !== undefined) a[ARCHIE_READING] = record.reading;
  if (record.section !== undefined) a[ARCHIE_SECTION] = record.section;
  if (record.emphasis !== undefined) a[ARCHIE_EMPHASIS] = record.emphasis;
  if (record.wholeObject === true) a[ARCHIE_WHOLE_OBJECT] = true;
  if (record.geo !== undefined) a[ARCHIE_GEO] = record.geo;
  return ann;
}

/** The source IRI a record targets (the canvas id, for grouping heads into per-canvas pages). */
export function targetSource(record: AnnotationRecord): string {
  const t = record.target;
  return typeof t === "string" ? t : t.source;
}

/**
 * Build a heads AnnotationPage from an ALREADY-SELECTED set of head records (e.g. those
 * targeting one canvas). `cite` must be built from the FULL log (citationIdMap) so
 * prov:wasRevisionOf can resolve parents — and `created` its DAG roots — that live in
 * history, not in this subset.
 */
export function headsPageFromRecords(heads: AnnotationRecord[], pageId: string, cite: CitationContext, opts: SerializeOptions = {}): W3CAnnotationPage {
  const historyBase = opts.historyBase ?? "annotations/history/";
  const items: W3CAnnotation[] = heads.map((head) => {
    const ann = withExtensions(withAuthorship(withProvLink(recordToAnnotation(head, cite.ids.get(head.rev)!), head.parent, cite.ids), head, cite.createdAt), head);
    ann[ARCHIE_HAS_HISTORY] = `${historyBase}${head.logicalId}.json`;
    return ann;
  });
  return { "@context": WADM_CONTEXT, id: pageId, type: "AnnotationPage", items };
}

/**
 * Phase-2 / ADR-0007: partition a canvas's head records into one AnnotationPage PER Reading,
 * plus a base page for no-reading notes — the multi-AnnotationPage Canvas a IIIF viewer (Mirador)
 * toggles. Deceptively-simple cases handled explicitly: (a) the base page (undefined reading) has
 * NO `partOf`; (b) a reading with zero notes on this canvas emits NO page (only readings present in
 * `heads` appear); (c) each reading-page's `partOf` points at the reading's AnnotationCollection id.
 * Stable order: base first, then reading ids sorted. A pure function of the (already canvas-scoped) heads.
 */
export function headsPagesByReading(
  heads: AnnotationRecord[],
  cite: CitationContext,
  pageId: (reading: string | undefined) => string,
  collectionId: (reading: string) => string,
  opts: SerializeOptions = {},
): { reading: string | undefined; page: W3CAnnotationPage }[] {
  const groups = new Map<string | undefined, AnnotationRecord[]>();
  for (const h of heads) {
    const arr = groups.get(h.reading);
    if (arr) arr.push(h);
    else groups.set(h.reading, [h]);
  }
  // NB: Array.sort moves `undefined` elements to the END regardless of comparator, so we sort the
  // DEFINED reading keys and prepend base (undefined) explicitly to guarantee base-first order.
  const defined = [...groups.keys()].filter((k): k is string => k !== undefined).sort(cmp);
  const keys: (string | undefined)[] = groups.has(undefined) ? [undefined, ...defined] : defined;
  return keys.map((reading) => {
    const page = headsPageFromRecords(groups.get(reading)!, pageId(reading), cite, opts);
    // IIIF P3 models partOf as an ARRAY of {id,type} objects (a bare string crashes IIIF parsers
    // that `.map()` over it, e.g. Clover) — link the reading page to its AnnotationCollection.
    if (reading !== undefined) (page as { partOf?: unknown }).partOf = [{ id: collectionId(reading), type: "AnnotationCollection" }];
    return { reading, page };
  });
}

/**
 * The canvas heads page: only the current head version(s) per logicalId (tombstones omitted),
 * each carrying archie:hasHistory + prov:wasRevisionOf. A pure idempotent function of the log.
 */
export function toHeadsPage(log: AnnotationLog, pageId: string, opts: SerializeOptions = {}): W3CAnnotationPage {
  return headsPageFromRecords(projectHeads(log), pageId, citationIdMap(log, opts.baseUrl ?? ""), opts);
}

/** Build the citation context — rev→citation-id map + logicalId→created map — for a log
 *  (exported so per-canvas publish can build it ONCE from the full log and share it). */
export function citationIdMap(log: AnnotationLog, baseUrl = ""): CitationContext {
  return { ids: citationIds(log, baseUrl), createdAt: rootCreatedAt(log) };
}

export interface HistoryOutput {
  /** logicalId -> history page url. */
  index: Record<string, string>;
  /** logicalId -> full-chain AnnotationPage. */
  pages: Record<string, W3CAnnotationPage>;
}

/**
 * The history sidecar: a per-logicalId AnnotationPage holding the FULL version chain
 * (citation-dereference targets) plus an index mapping logicalId -> page url.
 */
export function toHistory(log: AnnotationLog, opts: SerializeOptions = {}): HistoryOutput {
  const baseUrl = opts.baseUrl ?? "";
  const historyBase = opts.historyBase ?? "annotations/history/";
  const ids = citationIds(log, baseUrl);
  const byLogical = new Map<LogicalId, AnnotationRecord[]>();
  for (const r of dedupe(log)) {
    const arr = byLogical.get(r.logicalId);
    if (arr) arr.push(r);
    else byLogical.set(r.logicalId, [r]);
  }
  const index: Record<string, string> = {};
  const pages: Record<string, W3CAnnotationPage> = {};
  for (const [lid, recs] of byLogical) {
    const url = `${historyBase}${lid}.json`;
    index[lid] = url;
    const items: W3CAnnotation[] = [...recs]
      .sort((a, b) => a.version - b.version || cmp(a.rev, b.rev))
      .map((r) => withDagMeta(withProvLink(recordToAnnotation(r, ids.get(r.rev)!), r.parent, ids), r));
    pages[lid] = { "@context": WADM_CONTEXT, id: url, type: "AnnotationPage", items };
  }
  return { index, pages };
}
