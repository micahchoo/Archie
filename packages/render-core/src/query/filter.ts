// Layer + tag filtering over Notes (CONTEXT: Layers = per-note membership v1, cross-object;
// Tags = a body with purpose:tagging). Pure functions over AnnotationRecords. The Archie viewer
// uses these to filter; pure WADM consumers show all (three-tier degradation).

import type { AnnotationRecord, W3CBody } from "../wadm/types.js";

function bodiesOf(record: AnnotationRecord): W3CBody[] {
  const b = record.body;
  if (b === undefined) return [];
  return Array.isArray(b) ? b : [b];
}

/** Tag values on a Note (bodies with purpose:tagging). */
export function tagsOf(record: AnnotationRecord): string[] {
  return bodiesOf(record)
    .filter((b) => (b as { purpose?: string }).purpose === "tagging")
    .map((b) => (b as { value?: unknown }).value)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** @deprecated Layer ids a Note belongs to (multi-valued). Use {@link readingOf} (ADR-0007). */
export function layersOf(record: AnnotationRecord): string[] {
  return record.layers ?? [];
}

/** The single Reading a Note belongs to, or undefined = base (ADR-0007; mutually exclusive). */
export function readingOf(record: AnnotationRecord): string | undefined {
  return record.reading;
}

/** Notes in Reading `readingId` (a note is in exactly one reading or none). */
export function filterByReading(records: readonly AnnotationRecord[], readingId: string): AnnotationRecord[] {
  return records.filter((r) => r.reading === readingId);
}

/** Notes in NO reading — the always-visible base (ADR-0007 / Q16). */
export function baseNotes(records: readonly AnnotationRecord[]): AnnotationRecord[] {
  return records.filter((r) => r.reading === undefined);
}

/** All distinct reading ids across the notes, sorted (base/undefined excluded). */
export function allReadings(records: readonly AnnotationRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) if (r.reading !== undefined) set.add(r.reading);
  return [...set].sort();
}

/** Notes that are members of `layerId`. */
export function filterByLayer(records: readonly AnnotationRecord[], layerId: string): AnnotationRecord[] {
  return records.filter((r) => layersOf(r).includes(layerId));
}

/** Notes carrying `tag`. */
export function filterByTag(records: readonly AnnotationRecord[], tag: string): AnnotationRecord[] {
  return records.filter((r) => tagsOf(r).includes(tag));
}

/** All distinct layer ids across the notes, sorted. */
export function allLayers(records: readonly AnnotationRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) for (const l of layersOf(r)) set.add(l);
  return [...set].sort();
}

/** All distinct tags across the notes, sorted. */
export function allTags(records: readonly AnnotationRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) for (const tag of tagsOf(r)) set.add(tag);
  return [...set].sort();
}
