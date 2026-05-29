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
  ARCHIE_REV,
  ARCHIE_PARENT,
  ARCHIE_MERGE_PARENTS,
  ARCHIE_VERSION,
  ARCHIE_LAST_EDITOR,
  ARCHIE_DELETED,
} from "../wadm/types.js";
import type { AnnotationLog, AnnotationRecord, W3CAnnotation, W3CAnnotationPage, W3CBody, W3CTarget } from "../wadm/types.js";
import type { RevId } from "../wadm/brand.js";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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
  const layersRaw = a[ARCHIE_LAYERS];
  const layers = Array.isArray(layersRaw) && layersRaw.every((x) => typeof x === "string") ? (layersRaw as string[]) : undefined;
  const reading = asString(a[ARCHIE_READING]);
  const emphRaw = a[ARCHIE_EMPHASIS];
  const emphasis = emphRaw === "muted" || emphRaw === "normal" || emphRaw === "strong" ? emphRaw : undefined;
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
    ...(layers !== undefined ? { layers } : {}),
    ...(reading !== undefined ? { reading } : {}),
    ...(emphasis !== undefined ? { emphasis } : {}),
  };
  return record;
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

/** Reconstruct the full append-only log from a set of history pages. */
export function fromHistory(pages: Iterable<W3CAnnotationPage>): AnnotationLog {
  const out: AnnotationRecord[] = [];
  for (const page of pages) out.push(...fromHistoryPage(page));
  return out;
}
