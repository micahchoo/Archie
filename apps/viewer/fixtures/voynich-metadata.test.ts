// Archie-b50f review nits 2 & 3 — what the FLAGSHIP seed's Details tab actually reads like.
//
// The seed is the default impression of the metadata panel: whatever it ships is what a first-time
// visitor (and every screenshot) sees. Two things were wrong with the first cut, and both are
// properties of the projected ROWS, not of the authored entries — so this asserts through
// `metadataRows`, at the level a reader meets them.
//
//  • nit 2: the relabeled "Archive" row held the holding institution's name, a NEAR (not exact) match
//    for the requiredStatement credit line above it. The exact-echo-only dedupe rule is correct and
//    unchanged — hiding authored data is the worse failure — so both survived, and every folio showed
//    a row restating its own credit in a second voice. The seed now carries the Yale catalog record
//    instead; the near-match CASE lives in render-core's metadata-display.test.ts.
//  • nit 3: `dcterms:subject` is derived by splitting the object label on the em-dash separator. A
//    label without one yielded the junk value " section". Guarded at the source; asserted here as the
//    invariant that guard exists to hold.
//
// The shape assertions are deliberate too: this seed is the only place the panel's four hard cases
// (repeat / relabel / verbatim pair / long value) are visible in the shipped app, so a future edit
// that quietly drops one should fail here rather than silently make the feature undemonstrable.
import { describe, it, expect } from "vitest";
import { metadataRows, type RightsFields } from "@render/core";
import { voynichObjects } from "./voynich.js";

/** The image folios — o12 is the SOUND object and carries its own rights/no folio metadata. */
const folios = voynichObjects.filter((o) => o.mediaType !== "sound");
const rowsOf = (o: (typeof voynichObjects)[number]) => metadataRows(o as RightsFields);

const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Does one string RESTATE the other, as a reader would judge it?
 *
 * Containment alone is too crude a test: the seed's "MS 408" shelfmark is a substring of the credit
 * line "Beinecke … Yale University — MS 408 (public domain)", but nobody reads a two-token shelfmark
 * as a second copy of the credit — it's a shared token, and dropping it would cost real information.
 * What nit 2 is about is a value that carries substantially the SAME sentence. So: containment AND
 * the shorter string covering at least half the longer one. The seed's old Archive value (56 of the
 * credit's 79 chars, 0.71) trips it; the shelfmark (6 of 79, 0.08) does not.
 */
function restates(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.includes(short) && short.length >= long.length / 2;
}

describe("Voynich seed metadata — the default impression (Archie-b50f nits 2 & 3)", () => {
  it("covers every image folio", () => {
    expect(folios.length).toBeGreaterThan(0);
    for (const o of folios) expect(rowsOf(o).length).toBeGreaterThan(0);
  });

  it("no row value near-duplicates the folio's own credit line", () => {
    // The nit-2 contract, stated as what a reader sees: nothing in the list restates the credit
    // above it — not exactly (the rule would drop that), and not by containment either (the rule
    // KEEPS that, by design, which is exactly why the seed must not author it).
    for (const o of folios) {
      const credit = fold(o.requiredStatement?.value ?? "");
      expect(credit).not.toBe("");
      for (const row of rowsOf(o)) {
        for (const v of row.values) {
          expect({ row: row.label, value: v.text, restatesCredit: restates(fold(v.text), credit) })
            .toMatchObject({ restatesCredit: false });
        }
      }
    }
  });

  it("emits no junk subject row — every value is meaningful text", () => {
    // The nit-3 contract. " section" (an empty split half plus the suffix) is the specific junk the
    // guard prevents; the general assertion is that no value is blank, untrimmed, or a bare suffix.
    for (const o of folios) {
      for (const row of rowsOf(o)) {
        for (const v of row.values) {
          expect(v.text).toBe(v.text.trim());
          expect(v.text).not.toBe("");
          expect(v.text.toLowerCase()).not.toBe("section");
        }
      }
    }
  });

  it("still showcases all four panel shapes on every folio", () => {
    for (const o of folios) {
      const rows = rowsOf(o);
      const byLabel = new Map(rows.map((r) => [r.label, r]));
      // REPEAT — one label, two stacked values (needs the middot gutter).
      expect(byLabel.get("Creator")?.values).toHaveLength(2);
      // RELABEL — "Archive" over dcterms:source, so the curator's rename is what's displayed.
      expect(byLabel.has("Archive")).toBe(true);
      expect(byLabel.has("Source")).toBe(false);
      // VERBATIM imported pair — a label with no property survives the excluded-property rule.
      expect(byLabel.get("Shelfmark")?.values[0]?.text).toBe("MS 408");
      // LONG — provenance clamps and offers a Show more (the toggle nit 1 is about).
      expect(byLabel.get("Provenance")?.values[0]?.long).toBe(true);
      // The derived subject row is present and carries a real section name.
      expect(byLabel.get("Subject")?.values[0]?.text).toMatch(/\S+ section$/);
    }
  });
});
