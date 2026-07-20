// Reader-facing display projection for descriptive metadata (Archie-b50f — the Viewer's metadata
// panel). The authored shape is a FLAT, ordered list of {property?, label?, value} entries where a
// repeat is just a repeated entry (model.ts MetadataEntry). What a reader needs is the finding-aid
// shape: ONE labelled row per field, its values stacked in authored order. This module is that
// projection — pure, DOM-free, so the merge/repeat/long-value rules are testable without a browser
// and so every surface that shows metadata (object panel, exhibit header run) derives it identically.
//
// Layering: model-layer only (dcterms vocabulary + model types). It does NOT import iiif/ — the
// credit de-duplication compares against the RightsFields the caller already holds.

import { dctermsLabel, METADATA_EXCLUDED_PROPERTIES } from "./dcterms.js";
import type { MetadataEntry, RightsFields } from "./model.js";

/** One value inside a row. `long` is the panel's clamp hint, not a truncation — the full text is
 *  always carried (a clamp is CSS; the string stays whole for screen readers and for expand). */
export interface MetadataValue {
  text: string;
  /** Longer than a 3-line clamp can hold at the sidebar's narrowest measure → render "Show more". */
  long: boolean;
}

/** One display row: a label and every value authored under it, in authored order. */
export interface MetadataRow {
  /** Case-folded label — the merge key AND the stable key for a keyed `{#each}`. */
  key: string;
  /** Display label, in the casing of its first-seen entry. */
  label: string;
  /** ≥1 value (a row with none is never emitted). More than one = a repeat: the panel must render a
   *  per-value delimiter, since two unlabelled stacked values read as one wrapped value. */
  values: MetadataValue[];
}

/**
 * Clamp threshold in characters. The reader sidebar is `clamp(320px, 27vw, 560px)`; at its NARROWEST
 * (320px, ~0.82rem body) three lines hold roughly 140 characters. Under the threshold a value cannot
 * overflow the 3-line clamp, so it renders unclamped with no toggle; over it, the panel clamps and
 * offers "Show more". Deliberately an estimate on the pessimistic (narrow) side: over-estimating the
 * measure would clamp text with no way to expand it, under-estimating merely shows a 4th line.
 */
export const LONG_VALUE_CHARS = 140;

/** Merge/compare key: trimmed, whitespace-collapsed, case-folded. */
function fold(s: string | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The display label for one entry: the per-entry `label` override wins (Tropy's alternate-label
 * prior art — a curator who renamed a field meant it), else the dcterms vocabulary's preferred
 * label, else the property's local name for a dcterms property this build's vocabulary doesn't know
 * (forward compatibility beats printing a raw `dcterms:` prefix at a reader). `undefined` when the
 * entry carries neither — a shape `isMetadataEntry` already rejects, guarded here anyway.
 */
export function metadataEntryLabel(entry: MetadataEntry): string | undefined {
  const override = entry.label?.trim();
  if (override) return override;
  const property = entry.property;
  if (property) return dctermsLabel(property) ?? (property.slice("dcterms:".length) || undefined);
  return undefined;
}

/**
 * Project a level's `RightsFields` into display rows.
 *
 * Rules, in application order — each one closes a way the flat list misreads on the page:
 *  1. **Excluded properties drop.** An entry whose `property` is in `METADATA_EXCLUDED_PROPERTIES`
 *     collides with a NATIVE typed slot (title / summary / rights) that is already on screen;
 *     showing it publishes two disagreeing surfaces for one fact. A VERBATIM import (label only, no
 *     property) is kept even when its label reads like an excluded one — it carries no property, so
 *     it never claimed to be that field.
 *  2. **Blank values drop.** Nothing to read.
 *  3. **Credit echoes drop.** A relabeled field ("Archive" over `dcterms:source`) commonly repeats
 *     the `requiredStatement` value verbatim, so the same sentence appears twice in one sidebar in
 *     two different voices — indistinguishable from a data bug. On an EXACT (folded) match the row
 *     value yields: `requiredStatement` is IIIF's MUST-display slot and is always rendered. Only
 *     exact matches yield; a near-match (one string containing the other) keeps BOTH, because we
 *     can't know which is the fuller statement and silently hiding authored data is the worse error
 *     — form keeps them legible there (mono tracked credit line vs. the panel's key/value voice).
 *     The `rights` URI is compared the same way.
 *  4. **Same label merges.** Rows merge on the folded DISPLAY label, not on the property: the goal
 *     is that a reader never sees one label twice (in a finding aid that reads as a bug), and a
 *     verbatim-imported "Creator" pair means the same thing to a reader as `dcterms:creator`. A
 *     merged row keeps its FIRST occurrence's position and casing, so authored order still drives
 *     display order. Corollary: one property under two different labels stays two rows — the
 *     relabel was deliberate.
 *  5. **Duplicate values within a row collapse.** The same value twice under one label is never
 *     information.
 */
export function metadataRows(fields: RightsFields | undefined): MetadataRow[] {
  const entries = fields?.metadata;
  if (!entries || entries.length === 0) return [];

  const nativeValues = new Set([fold(fields?.requiredStatement?.value), fold(fields?.rights)]);
  nativeValues.delete("");

  const rows: MetadataRow[] = [];
  const byKey = new Map<string, MetadataRow>();
  for (const entry of entries) {
    if (entry.property !== undefined && METADATA_EXCLUDED_PROPERTIES.has(entry.property)) continue; // 1
    const text = entry.value.trim();
    if (text === "") continue; // 2
    const folded = fold(text);
    if (nativeValues.has(folded)) continue; // 3
    const label = metadataEntryLabel(entry);
    if (label === undefined) continue;

    const key = fold(label); // 4
    let row = byKey.get(key);
    if (row === undefined) {
      row = { key, label, values: [] };
      byKey.set(key, row);
      rows.push(row);
    }
    if (row.values.some((v) => fold(v.text) === folded)) continue; // 5
    row.values.push({ text, long: text.length > LONG_VALUE_CHARS });
  }
  // No empty-row filter needed: a row is created only at the moment its first value is pushed (the
  // rule-5 dup check is vacuously false on a fresh row), and rules 1–3 drop entries BEFORE lookup.
  return rows;
}
