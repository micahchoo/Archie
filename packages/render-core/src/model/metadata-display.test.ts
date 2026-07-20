import { describe, it, expect } from "vitest";
import { metadataRows, metadataEntryLabel, LONG_VALUE_CHARS } from "./metadata-display.js";
import type { MetadataEntry, RightsFields } from "./model.js";

const md = (metadata: MetadataEntry[], rest: Partial<RightsFields> = {}): RightsFields => ({ metadata, ...rest });
const LONG = "x".repeat(LONG_VALUE_CHARS + 1);

describe("metadataEntryLabel", () => {
  it("prefers the per-entry label override over the vocabulary label", () => {
    expect(metadataEntryLabel({ property: "dcterms:source", label: "Archive", value: "v" })).toBe("Archive");
  });
  it("falls back to the dcterms preferred label", () => {
    expect(metadataEntryLabel({ property: "dcterms:creator", value: "v" })).toBe("Creator");
  });
  it("falls back to the local name for a property this vocabulary build doesn't know", () => {
    expect(metadataEntryLabel({ property: "dcterms:futureTerm", value: "v" })).toBe("futureTerm");
  });
  it("uses the sole label of a verbatim import", () => {
    expect(metadataEntryLabel({ label: "Shelfmark", value: "MS 408" })).toBe("Shelfmark");
  });
  it("is undefined when an entry carries neither (a shape isMetadataEntry already rejects)", () => {
    expect(metadataEntryLabel({ value: "v" })).toBeUndefined();
    expect(metadataEntryLabel({ label: "   ", value: "v" })).toBeUndefined();
  });
});

describe("metadataRows — shape", () => {
  it("is empty for absent / empty metadata", () => {
    expect(metadataRows(undefined)).toEqual([]);
    expect(metadataRows({})).toEqual([]);
    expect(metadataRows(md([]))).toEqual([]);
  });

  it("keeps authored order as display order", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:date", value: "1404" },
        { property: "dcterms:creator", value: "A scribe" },
        { label: "Shelfmark", value: "MS 408" },
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual(["Date", "Creator", "Shelfmark"]);
  });

  it("trims values and drops blank ones", () => {
    const rows = metadataRows(md([{ property: "dcterms:date", value: "  1404  " }, { property: "dcterms:type", value: "   " }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values[0]!.text).toBe("1404");
  });
});

describe("metadataRows — repeats merge into one row", () => {
  it("merges a repeated property into one label with stacked values, in authored order", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:creator", value: "Unknown scribe" },
        { property: "dcterms:creator", value: "Unknown illustrator" },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Creator");
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["Unknown scribe", "Unknown illustrator"]);
  });

  it("merges NON-adjacent repeats into the first occurrence's position", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:creator", value: "First" },
        { property: "dcterms:date", value: "1404" },
        { property: "dcterms:creator", value: "Second" },
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual(["Creator", "Date"]);
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["First", "Second"]);
  });

  it("merges on the DISPLAY label, so a verbatim import joins its dcterms twin's row", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:creator", value: "A" },
        { label: "creator", value: "B" }, // verbatim pair, different casing
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Creator"); // first-seen casing wins
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["A", "B"]);
  });

  it("keeps ONE property under two different labels as two rows (the relabel was deliberate)", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:source", label: "Archive", value: "Beinecke" },
        { property: "dcterms:source", value: "Yale" },
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual(["Archive", "Source"]);
  });

  it("collapses a duplicate value within one row", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:subject", value: "Herbal" },
        { property: "dcterms:subject", value: "  herbal " },
      ]),
    );
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["Herbal"]);
  });
});

describe("metadataRows — long values", () => {
  it("flags a value past the clamp threshold and carries the FULL text", () => {
    const rows = metadataRows(md([{ property: "dcterms:provenance", value: LONG }]));
    expect(rows[0]!.values[0]!.long).toBe(true);
    expect(rows[0]!.values[0]!.text).toBe(LONG); // never truncated — the clamp is CSS
  });

  it("does not flag a value at or under the threshold", () => {
    const rows = metadataRows(md([{ property: "dcterms:provenance", value: "x".repeat(LONG_VALUE_CHARS) }]));
    expect(rows[0]!.values[0]!.long).toBe(false);
  });

  it("flags per value, not per row", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:provenance", value: "Short" },
        { property: "dcterms:provenance", value: LONG },
      ]),
    );
    expect(rows[0]!.values.map((v) => v.long)).toEqual([false, true]);
  });
});

describe("metadataRows — native slots are never rows", () => {
  it("drops an entry whose property collides with a native typed slot", () => {
    const rows = metadataRows(
      md([
        { property: "dcterms:title", value: "A second title" },
        { property: "dcterms:rights", value: "All rights reserved" },
        { property: "dcterms:description", value: "A second summary" },
        { property: "dcterms:creator", value: "kept" },
      ]),
    );
    expect(rows.map((r) => r.label)).toEqual(["Creator"]);
  });

  it("keeps a VERBATIM pair whose label merely reads like an excluded field (no property claimed)", () => {
    const rows = metadataRows(md([{ label: "Title of the plate", value: "f25v" }]));
    expect(rows.map((r) => r.label)).toEqual(["Title of the plate"]);
  });

  it("drops a row value that exactly echoes the credit line (the relabel-duplicates-credit case)", () => {
    const credit = "Beinecke Rare Book & Manuscript Library, Yale University";
    const rows = metadataRows(
      md([{ property: "dcterms:source", label: "Archive", value: `  ${credit.toLowerCase()}  ` }], {
        requiredStatement: { label: "Attribution", value: credit },
      }),
    );
    expect(rows).toEqual([]);
  });

  it("drops only the echoing VALUE, keeping the rest of its row", () => {
    const credit = "Beinecke Library";
    const rows = metadataRows(
      md([
        { property: "dcterms:source", value: credit },
        { property: "dcterms:source", value: "Villa Mondragone, Frascati" },
      ], { requiredStatement: { label: "Attribution", value: credit } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["Villa Mondragone, Frascati"]);
  });

  it("keeps BOTH on a NEAR match — only an exact echo yields", () => {
    // The real pair this rule was written against, kept verbatim from the Voynich seed as it shipped
    // before the Archie-b50f review: a relabeled "Archive" holding the institution name, and a credit
    // line that ADDS a shelfmark and a rights phrase to it. Neither string contains the other exactly,
    // and we cannot know which is the fuller statement — so both survive, and the panel's FORM (mono
    // tracked credit line vs. the list's key/value voice) is what keeps them legible.
    //
    // The seed itself no longer ships this pair (its Archive row is the Yale catalog record, clearly
    // distinct from the credit) — the flagship sample shouldn't showcase the awkward case as its
    // default impression. The CASE lives here instead: this test is the near-match example.
    const rows = metadataRows(
      md([{ property: "dcterms:source", label: "Archive", value: "Beinecke Rare Book & Manuscript Library, Yale University" }], {
        requiredStatement: { label: "Source", value: "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)" },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Archive");
    expect(rows[0]!.values.map((v) => v.text)).toEqual(["Beinecke Rare Book & Manuscript Library, Yale University"]);
  });

  it("drops a value that echoes the license URI", () => {
    const uri = "http://creativecommons.org/publicdomain/mark/1.0/";
    const rows = metadataRows(md([{ label: "Usage", value: uri }], { rights: uri }));
    expect(rows).toEqual([]);
  });

  it("does not treat an ABSENT credit as an empty-string match", () => {
    const rows = metadataRows(md([{ property: "dcterms:creator", value: "A" }], { requiredStatement: { label: "Attribution", value: "" } }));
    expect(rows).toHaveLength(1);
  });
});
