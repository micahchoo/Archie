import { describe, it, expect } from "vitest";
import { singleExhibitLibrary, type Library } from "./model.js";
import { asExhibitId, asLibraryId } from "../wadm/brand.js";

// "single-exhibit export = a Library with N=1" (CONTEXT §"Local view loop") — not a new artifact.

const lib: Library = {
  id: asLibraryId("L"),
  title: "My Library",
  summary: "things",
  exhibits: [
    { id: asExhibitId("e1"), slug: "a", title: "A", objects: [] },
    { id: asExhibitId("e2"), slug: "b", title: "B", objects: [] },
  ],
};

describe("singleExhibitLibrary", () => {
  it("keeps only the named exhibit", () => {
    expect(singleExhibitLibrary(lib, "b").exhibits.map((e) => e.slug)).toEqual(["b"]);
  });

  it("drops the library title/summary so the Gallery collapses straight to the exhibit", () => {
    const one = singleExhibitLibrary(lib, "a");
    expect(one.title).toBeUndefined();
    expect(one.summary).toBeUndefined();
  });

  it("unknown slug → empty library (nothing to publish)", () => {
    expect(singleExhibitLibrary(lib, "nope").exhibits).toEqual([]);
  });
});
