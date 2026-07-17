// deserialize — the inverse of serialize.ts (ADR-0003 / Q-3). Parse history-page WADM
// annotations (which carry the archie: DAG metadata) back into AnnotationRecords. This is the
// reload + merge LOAD path: the full version DAG is reconstructed from the history pages
// (annotations/history/{logicalId}.json), NOT the consumer-minimal heads page.

import { asLogicalId, asRevId, asClientId } from "../wadm/brand.js";
import {
  ARCHIE_LOGICAL_ID,
  ARCHIE_LAYERS,
  ARCHIE_READING,
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
import type { AnnotationLog, AnnotationRecord, GeoAnchor, W3CAnnotation, W3CAnnotationPage, W3CBody, W3CTarget } from "../wadm/types.js";
import type { RevId } from "../wadm/brand.js";
import { foldLayersIntoTags } from "../migrate/migrate.js";
import type { CarryDisposition } from "../model/carry.js";

// EXHAUSTIVENESS GUARD (Issue 21): the inverse of serialize's history path —
// `recordFromHistoryAnnotation` reconstructs EVERY AnnotationRecord field from a history-page
// annotation. This sentinel fails to compile if a field is added to AnnotationRecord without a parse
// decision here, so serialize and deserialize can't drift (a field written but not read, or vice versa).
const _historyParse = {
  logicalId: "carry",
  rev: "carry",
  version: "carry",
  parent: "carry",
  mergeParents: "carry",
  modifiedAt: "carry",
  lastEditor: "carry",
  deleted: "carry",
  body: "carry",
  target: "carry",
  motivation: "carry",
  reading: "carry",
  emphasis: "carry",
  wholeObject: "carry",
  geo: "carry",
} satisfies Record<keyof AnnotationRecord, CarryDisposition>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validate a parsed `archie:geo` value into a GeoAnchor (geo-truth — ADR-0015); undefined if malformed
 *  (a foreign/garbled value is skipped, not an error — matches the emphasis/reading parse contract). */
function asGeoAnchor(v: unknown): GeoAnchor | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const g = v as Record<string, unknown>;
  if (g.type === "bbox" && isNum(g.west) && isNum(g.south) && isNum(g.east) && isNum(g.north)) {
    return { type: "bbox", west: g.west, south: g.south, east: g.east, north: g.north };
  }
  if (g.type === "polygon" && Array.isArray(g.coordinates) && g.coordinates.every((c) => Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1]))) {
    return { type: "polygon", coordinates: g.coordinates as Array<[number, number]> };
  }
  return undefined;
}

/**
 * Reconstruct an AnnotationRecord from a history-page annotation. Returns null if the
 * annotation lacks archie: DAG metadata (e.g. a foreign pure-WADM annotation) — such items
 * are skipped, not errors.
 */
export function recordFromHistoryAnnotation(ann: W3CAnnotation): AnnotationRecord | null {
  const a = ann as unknown as Record<string, unknown>;
  const logical = asString(a[ARCHIE_LOGICAL_ID]);
  const rev = asString(a[ARCHIE_REV]);
  const version = a[ARCHIE_VERSION];
  const lastEditor = asString(a[ARCHIE_LAST_EDITOR]);
  if (logical === undefined || rev === undefined || typeof version !== "number" || lastEditor === undefined) {
    return null;
  }
  const parentRaw = a[ARCHIE_PARENT];
  const parent = typeof parentRaw === "string" ? asRevId(parentRaw) : null;
  const mpRaw = a[ARCHIE_MERGE_PARENTS];
  const mergeParents = Array.isArray(mpRaw) && mpRaw.every((x) => typeof x === "string") ? mpRaw.map((x) => asRevId(x as string)) : undefined;
  // Legacy `archie:layers` (ADR-0007): parsed ONLY so foldLayersIntoTags can absorb it into Tags
  // below — never assigned to the typed record (the field is retired). OLD data still carries it.
  const layersRaw = a[ARCHIE_LAYERS];
  const legacyLayers = Array.isArray(layersRaw) && layersRaw.every((x) => typeof x === "string") ? (layersRaw as string[]) : undefined;
  const reading = asString(a[ARCHIE_READING]);
  const emphRaw = a[ARCHIE_EMPHASIS];
  const emphasis = emphRaw === "muted" || emphRaw === "normal" || emphRaw === "strong" ? emphRaw : undefined;
  const wholeObject = a[ARCHIE_WHOLE_OBJECT] === true ? true : undefined;
  const geo = asGeoAnchor(a[ARCHIE_GEO]);
  const target = (Array.isArray(ann.target) ? ann.target[0] : ann.target) as W3CTarget;
  const record: AnnotationRecord = {
    logicalId: asLogicalId(logical),
    rev: asRevId(rev),
    version,
    parent,
    modifiedAt: asString(ann.modified) ?? "",
    lastEditor: asClientId(lastEditor),
    deleted: a[ARCHIE_DELETED] === true,
    target,
    ...(mergeParents !== undefined ? { mergeParents } : {}),
    ...(ann.body !== undefined ? { body: ann.body as W3CBody | W3CBody[] } : {}),
    ...(ann.motivation !== undefined ? { motivation: ann.motivation } : {}),
    ...(reading !== undefined ? { reading } : {}),
    ...(emphasis !== undefined ? { emphasis } : {}),
    ...(wholeObject !== undefined ? { wholeObject } : {}),
    ...(geo !== undefined ? { geo } : {}),
  };
  // ADR-0007 contraction: legacy `archie:layers` (OLD persisted data) folds into Tags
  // (purpose:tagging bodies) on read, losslessly — so no live reader past this boundary ever
  // sees the retired field. Attached via cast (the field is no longer on the record type) so
  // foldLayersIntoTags can absorb + strip it. Modern data (no legacy layers) skips the fold.
  if (legacyLayers === undefined || legacyLayers.length === 0) return record;
  return foldLayersIntoTags(Object.assign({}, record, { layers: legacyLayers }));
}

/** All reconstructable records on one history page. */
export function fromHistoryPage(page: W3CAnnotationPage): AnnotationRecord[] {
  const out: AnnotationRecord[] = [];
  for (const item of page.items) {
    const rec = recordFromHistoryAnnotation(item);
    if (rec !== null) out.push(rec);
  }
  return out;
}

/**
 * Reconstruct the full append-only log from a set of history pages, DEDUPED by `rev` (first-seen
 * order), mirroring `serialize.ts`'s `dedupe`. Deserialize is the inverse of serialize, so it must
 * carry the same rev-uniqueness invariant: a duplicated page or a doubly-listed record (a torn /
 * doubled write) would otherwise put the same `rev` in the log twice, and `linearHead` reads two
 * identical records as PLURAL HEADS → a spurious "resolve the concurrent merge first" throw on the
 * next edit of an otherwise-linear note (Issue 19c). Distinct revs sharing (logicalId, version) —
 * a genuine unresolved merge — are preserved; only exact `rev` collisions collapse.
 */
export function fromHistory(pages: Iterable<W3CAnnotationPage>): AnnotationLog {
  const seen = new Set<RevId>();
  const out: AnnotationRecord[] = [];
  for (const page of pages) {
    for (const rec of fromHistoryPage(page)) {
      if (seen.has(rec.rev)) continue;
      seen.add(rec.rev);
      out.push(rec);
    }
  }
  return out;
}
