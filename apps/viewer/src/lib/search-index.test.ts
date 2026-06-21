import { describe, it, expect } from "vitest";
import { ARCHIE_LOGICAL_ID, type W3CAnnotation } from "@render/core";
import { buildSearchIndex, filterResults, flattenExhibitNotes } from "./search-index.js";

/** Minimal published-shape annotation: a commenting body + optional tag bodies + a logical id. */
function note(id: string, comment: string, tags: string[] = []): W3CAnnotation {
  const a: W3CAnnotation = {
    id,
    type: "Annotation",
    target: "canvas#xywh=0,0,10,10",
    body: [
      { type: "TextualBody", value: comment, purpose: "commenting" },
      ...tags.map((t) => ({ type: "TextualBody", value: t, purpose: "tagging" })),
    ],
  } as W3CAnnotation;
  (a as unknown as Record<string, unknown>)[ARCHIE_LOGICAL_ID] = `${id}-logical`;
  return a;
}

describe("buildSearchIndex", () => {
  const annotations = [
    note("n1", "the hidden door"),
    note("n2", "an unrelated note", ["cipher"]),
    note("n3", "## Heading [link](http://example.com/path)"),
  ];
  const index = buildSearchIndex(annotations);

  it("finds a note by its body prose", () => {
    const hits = index.search("door").map((r) => r.id);
    expect(hits).toContain("n1");
  });

  it("finds a note by its tag", () => {
    const hits = index.search("cipher").map((r) => r.id);
    expect(hits).toContain("n2");
  });

  it("indexes stripped markdown prose, not the markup", () => {
    expect(index.search("Heading").map((r) => r.id)).toContain("n3");
    expect(index.search("link").map((r) => r.id)).toContain("n3");
  });

  it("does NOT index the stripped-out URL", () => {
    expect(index.search("http").map((r) => r.id)).not.toContain("n3");
    expect(index.search("example").map((r) => r.id)).not.toContain("n3");
  });

  it("stores logicalId on results", () => {
    const hit = index.search("door").find((r) => r.id === "n1");
    expect(hit?.logicalId).toBe("n1-logical");
  });
});

describe("flattenExhibitNotes", () => {
  it("pulls base + every reading page into one array, de-duped by id", () => {
    const base = note("b1", "base note");
    const onlyInReading = note("r1", "reading-only note", ["margin"]);
    const sharedOverlay = note("b1", "base note (reading overlay copy)");
    const flat = flattenExhibitNotes({
      annotationsByObject: { objA: [base] },
      readingAnnotationsByObject: { objA: { readingX: [sharedOverlay, onlyInReading] } },
    });
    const ids = flat.map((a) => a.id);
    // a note living ONLY in a non-active reading is present in the flat index (Q-4 scope = all readings)
    expect(ids).toContain("r1");
    expect(ids).toContain("b1");
    // de-duped: b1 appears in base AND as a reading overlay, but only once (base wins)
    expect(ids.filter((id) => id === "b1")).toHaveLength(1);
  });
});

describe("filterResults", () => {
  // Two objects' worth of notes, including one that would live only in a non-active reading.
  const flat = flattenExhibitNotes({
    annotationsByObject: {
      objA: [
        note("n1", "the cipher manuscript", ["cipher", "script"]),
        note("n2", "a botanical drawing", ["botany"]),
      ],
    },
    readingAnnotationsByObject: {
      objA: { skeptic: [note("n3", "a forgery argument about the cipher", ["forgery"])] },
    },
  });
  const index = buildSearchIndex(flat);

  it("no query + no tags returns the whole index", () => {
    expect(filterResults(index, "", []).map((d) => d.id).sort()).toEqual(["n1", "n2", "n3"]);
  });

  it("tags OR each other (two tags → union)", () => {
    const ids = filterResults(index, "", ["botany", "forgery"]).map((d) => d.id).sort();
    expect(ids).toEqual(["n2", "n3"]); // union of the two single-tag sets, not their (empty) intersection
  });

  it("a text query ANDs the tag union (narrows it)", () => {
    // tag union {cipher, forgery} = {n1, n3}; query "forgery" narrows it to just n3
    const ids = filterResults(index, "forgery", ["cipher", "forgery"]).map((d) => d.id);
    expect(ids).toEqual(["n3"]);
  });

  it("a query alone (no tags) searches the whole union", () => {
    expect(filterResults(index, "cipher", []).map((d) => d.id).sort()).toEqual(["n1", "n3"]);
  });

  it("a note in a non-active reading is still findable through the flat index", () => {
    // n3 only ever lives under the 'skeptic' reading — yet the flat index surfaces it by query.
    expect(filterResults(index, "forgery", []).map((d) => d.id)).toContain("n3");
  });
});
