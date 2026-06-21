import { describe, it, expect } from "vitest";
import { ARCHIE_LOGICAL_ID, type W3CAnnotation } from "@render/core";
import { buildSearchIndex } from "./search-index.js";

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
