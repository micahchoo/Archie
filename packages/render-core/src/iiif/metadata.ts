// Descriptive-metadata projector (Dublin Core pipeline, Archie-c6bf) — the sibling of
// iiif/rights.ts, spread by `rightsProps`/`rightsFromIIIF` so Collection (Library) / Manifest
// (Exhibit) / Canvas (Object) project and recover identically (the "same fields at every level"
// design, one seam).
//
// Two emissions per level (research asset §3.2: IIIF `metadata` is deliberately NON-semantic —
// label/value pairs for display only, the property URIs do not survive):
//   • IIIF `metadata[]` — the DISPLAY projection every pure IIIF viewer (Mirador/Clover) renders:
//     label = the entry's override ?? the vocabulary's preferred label, values as `none` language
//     maps, same-display-label repeats merged into ONE pair with multiple values (the IIIF idiom
//     for repeated fields).
//   • `archieMetadata` — the raw MetadataEntry[] as an extension property, so the round trip
//     (publish → objectsFromManifest / loadLibrary / readExhibitTree) is LOSSLESS: property names
//     and per-entry labels come back exactly, which the display pairs alone cannot do.

import { sanitizeMetadataEntries, type MetadataEntry, type RightsFields } from "../model/model.js";
import { dctermsLabel } from "../model/dcterms.js";
import type { IIIFLabelValue } from "./presentation.js";

/** Extension key carrying the raw entries on a Collection / Manifest / Canvas. Emitted only when
 *  entries exist (byte-stable when absent); pure IIIF viewers ignore it, Archie reads it back. */
export const ARCHIE_METADATA = "archieMetadata" as const;

/** The display label of one entry: per-entry override ?? vocabulary preferred label ?? the bare
 *  property name after "dcterms:" (an unknown-but-valid property still renders something). */
export function metadataDisplayLabel(entry: MetadataEntry): string {
  if (entry.label !== undefined && entry.label.trim() !== "") return entry.label;
  if (entry.property !== undefined) {
    return dctermsLabel(entry.property) ?? entry.property.slice("dcterms:".length);
  }
  return "";
}

/**
 * Project entries → IIIF `metadata[]` display pairs. Pair order = first occurrence of each display
 * label in entry order; entries sharing a display label MERGE into one pair whose value map carries
 * all their values in order (`{ none: [v1, v2] }`).
 */
export function metadataToIIIF(entries: readonly MetadataEntry[]): IIIFLabelValue[] {
  const pairs: { label: string; values: string[] }[] = [];
  const byLabel = new Map<string, { label: string; values: string[] }>();
  for (const entry of entries) {
    const label = metadataDisplayLabel(entry);
    let pair = byLabel.get(label);
    if (!pair) {
      pair = { label, values: [] };
      byLabel.set(label, pair);
      pairs.push(pair);
    }
    pair.values.push(entry.value);
  }
  return pairs.map((p) => ({ label: { none: [p.label] }, value: { none: p.values } }));
}

/** The metadata spread for a level (mirrors `rightsProps`'s shape contract): nothing when the field
 *  is absent/empty — clean IIIF, byte-stable output for metadata-free libraries. */
export function metadataProps(fields: RightsFields | undefined): { metadata?: IIIFLabelValue[]; archieMetadata?: MetadataEntry[] } {
  const entries = fields?.metadata;
  if (!entries || entries.length === 0) return {};
  return { metadata: metadataToIIIF(entries), archieMetadata: entries };
}

/**
 * Inverse of `metadataProps` (the load path): recover the raw entries from a resource's
 * `archieMetadata` extension, SANITIZED (untrusted tree — skip malformed entries, per-item
 * tolerant). The display `metadata[]` pairs are NOT read back — they are a lossy projection; a
 * third-party manifest's pairs enter through the IMPORT mapping (apps/studio iiif-import), not here.
 */
export function metadataFromIIIF(res: { archieMetadata?: unknown } | undefined): MetadataEntry[] | undefined {
  return sanitizeMetadataEntries(res?.archieMetadata);
}
