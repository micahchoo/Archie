// THROWAWAY PROTOTYPE (ticket Archie-a66d / D1). Delete once the D1 ledger is written.
//
// Hardcoded seed annotations, in the style of the Voynich seed exhibit. These are the ONE
// shared starting point every tab agrees on: identical logicalId + rev, inserted into the
// grow-only rev-log idempotently (keyed by rev), so a concurrent edit in two tabs becomes a
// pair of SIBLING revs off the same seed head — the exact branch resolveConflict handles.
//
// NOTE: we build these records by hand (not appendNew) so the seed ids are stable across tabs.
// The ids are valid 26-char Crockford-base32 ULIDs; the spine helpers don't re-validate them.

import type { AnnotationRecord, W3CBody } from "../../../packages/render-core/src/wadm/types.js";
import type { LogicalId, RevId, ClientId } from "../../../packages/render-core/src/wadm/brand.js";

const mkBody = (value: string): W3CBody => ({
  type: "TextualBody",
  value,
  format: "text/plain",
  purpose: "commenting",
});

const SEED_EDITOR = "seed" as ClientId;
const SEED_TIME = "2026-07-18T00:00:00.000Z";

// A canvas IRI in the shape the real Voynich fixture loads (Yale IIIF), with a region fragment.
const canvas = (n: number, region: string) =>
  `https://collections.library.yale.edu/iiif/2/2002046/canvas/${n}#xywh=${region}`;

export const SEED_RECORDS: AnnotationRecord[] = [
  {
    logicalId: "01JADAA0000000000000000A0A" as LogicalId,
    rev: "01JADAA0000000000000000A0R" as RevId,
    version: 1,
    parent: null,
    modifiedAt: SEED_TIME,
    lastEditor: SEED_EDITOR,
    deleted: false,
    body: mkBody("Botanical folio: root-and-leaf drawing, unlabeled."),
    target: canvas(1, "200,200,600,400"),
  },
  {
    logicalId: "01JADAB0000000000000000B0A" as LogicalId,
    rev: "01JADAB0000000000000000B0R" as RevId,
    version: 1,
    parent: null,
    modifiedAt: SEED_TIME,
    lastEditor: SEED_EDITOR,
    deleted: false,
    body: mkBody("Cipher glyph cluster in the top margin."),
    target: canvas(1, "820,90,300,120"),
  },
  {
    logicalId: "01JADAC0000000000000000C0A" as LogicalId,
    rev: "01JADAC0000000000000000C0R" as RevId,
    version: 1,
    parent: null,
    modifiedAt: SEED_TIME,
    lastEditor: SEED_EDITOR,
    deleted: false,
    body: mkBody("Zodiac roundel, outer ring of figures."),
    target: canvas(2, "140,140,720,720"),
  },
];

/** Pull the display text out of a record's body (first body if an array; TextualBody value). */
export function bodyText(body: AnnotationRecord["body"]): string {
  if (body === undefined) return "";
  const one = Array.isArray(body) ? body[0] : body;
  if (one && typeof one === "object" && "value" in one) return (one as { value: string }).value;
  return "";
}
