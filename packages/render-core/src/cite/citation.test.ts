import { describe, it, expect } from "vitest";
import { citationFor, cslItemFor, citationText, cslName, yearOf } from "./citation.js";
import type { RightsFields } from "../model/model.js";

// V102 (Archie-3ea1). The CSL item is the part that must be RIGHT — it is the interchange format a
// reader pastes into Zotero — so most of these pin the field MAPPING (quire `page.js`'s shape), not
// the prose. The rendered string is built from the item, so testing it also guards the mapping.

// The real voynich shape: an institutional credit, a licence, and Dublin Core entries.
const voynich: RightsFields = {
  rights: "http://creativecommons.org/publicdomain/mark/1.0/",
  requiredStatement: {
    label: "Source",
    value: "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)",
  },
  metadata: [
    { property: "dcterms:subject", label: "Subject", value: "Beinecke MS 408 — the Voynich manuscript" },
    { property: "dcterms:date", label: "Date", value: "ca. 1404–1438" },
    { property: "dcterms:creator", label: "Creator", value: "Christopher Moseley" },
    { property: "dcterms:publisher", label: "Publisher", value: "Beinecke Rare Book & Manuscript Library" },
  ],
};

describe("cslName", () => {
  it("splits a personal name family-last (quire name.js's rule)", () => {
    expect(cslName("Christopher Moseley")).toEqual({ family: "Moseley", given: "Christopher" });
  });

  it("keeps an INSTITUTION whole — CSL's literal-name case", () => {
    // "Beinecke Rare Book & Manuscript Library" split family-last would cite an author named
    // "Library", which is worse than not splitting at all.
    expect(cslName("Beinecke Rare Book & Manuscript Library")).toEqual({
      family: "Beinecke Rare Book & Manuscript Library",
    });
  });

  it("keeps a single-token name whole", () => {
    expect(cslName("Anonymous")).toEqual({ family: "Anonymous" });
  });

  it("KNOWN LIMIT: a two-word non-personal name still splits", () => {
    // "Unknown scribe" becomes given "Unknown", family "scribe". The institution guard only catches
    // names carrying an institutional word; nothing in the string distinguishes a two-token
    // descriptive attribution from a personal name, and guessing harder would misfile real people.
    // Pinned rather than papered over — if this ever matters, the fix is an authored `literal` flag
    // on the metadata entry, not a longer regex.
    expect(cslName("Unknown scribe")).toEqual({ family: "scribe", given: "Unknown" });
  });
});

describe("yearOf", () => {
  it("takes the first 4-digit year out of free text", () => {
    expect(yearOf("ca. 1404–1438")).toBe(1404);
  });

  it("is undefined rather than a guess when there is no year", () => {
    // A wrong year in a citation is worse than an absent one — no "n.d.", no fabrication.
    for (const bad of [undefined, "", "undated", "15th century"]) expect(yearOf(bad)).toBeUndefined();
  });
});

describe("cslItemFor — quire's field mapping", () => {
  it("maps Dublin Core onto author / publisher / issued", () => {
    const item = cslItemFor({ title: "f1r", containerTitle: "Voynich folios", rights: voynich });
    expect(item.author).toEqual([{ family: "Moseley", given: "Christopher" }]);
    expect(item.publisher).toBe("Beinecke Rare Book & Manuscript Library");
    expect(item.issued).toEqual({ "date-parts": [[1404]] });
    expect(item["container-title"]).toBe("Voynich folios");
  });

  it("carries the requiredStatement — a MUST-display credit must survive being pasted", () => {
    const item = cslItemFor({ title: "f1r", rights: voynich });
    expect(item.note).toBe(voynich.requiredStatement!.value);
    expect(item.rights).toBe("http://creativecommons.org/publicdomain/mark/1.0/");
  });

  it("carries the URL it is given and never invents one", () => {
    const withUrl = cslItemFor({ title: "f1r", url: "https://host/#/voynich/a/01KVPP7FN3KRAF8B45HJQKYSZG" });
    expect(withUrl.URL).toBe("https://host/#/voynich/a/01KVPP7FN3KRAF8B45HJQKYSZG");
    expect(cslItemFor({ title: "f1r" }).URL).toBeUndefined();
  });

  it("omits every field it has no source for", () => {
    // The bare case: an exhibit with no rights at all. Absent, not empty-string — an empty CSL field
    // renders as stray punctuation in every downstream formatter.
    const item = cslItemFor({ title: "Screenshots" });
    expect(item).toEqual({ id: "Screenshots", type: "graphic", title: "Screenshots" });
  });

  it("matches a verbatim entry by LABEL when it carries no property", () => {
    // Imported manifests routinely carry label-only metadata (Archie-c6bf's import mapping).
    const item = cslItemFor({ title: "x", rights: { metadata: [{ label: "Creator", value: "Ada Lovelace" }] } });
    expect(item.author).toEqual([{ family: "Lovelace", given: "Ada" }]);
  });

  it("takes a narrative section as a chapter", () => {
    expect(cslItemFor({ title: "Section 3", type: "chapter" }).type).toBe("chapter");
  });
});

describe("citationText", () => {
  it("renders the full reference in order", () => {
    const { text } = citationFor({
      title: "f1r",
      containerTitle: "Voynich folios",
      url: "https://host/#/voynich/o/ex-voynich.o1",
      rights: voynich,
    });
    expect(text).toBe(
      "Christopher Moseley. “f1r.” Voynich folios. Beinecke Rare Book & Manuscript Library, 1404. " +
        "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain). " +
        "http://creativecommons.org/publicdomain/mark/1.0/. " +
        "https://host/#/voynich/o/ex-voynich.o1",
    );
  });

  it("degrades to just the title when nothing else is known", () => {
    // No empty brackets, no "n.d.", nothing for the reader to delete.
    expect(citationText(cslItemFor({ title: "Screenshots" }))).toBe("“Screenshots.”");
  });

  it("does not double a full stop the credit already ends with", () => {
    const text = citationText(cslItemFor({ title: "x", rights: { requiredStatement: { label: "S", value: "© OSM contributors, ODbL." } } }));
    expect(text).toContain("© OSM contributors, ODbL.");
    expect(text).not.toContain("ODbL..");
  });

  it("is built FROM the CSL item, so the two cannot disagree", () => {
    const { csl, text } = citationFor({ title: "f1r", rights: voynich });
    expect(text).toBe(citationText(csl));
  });
});
