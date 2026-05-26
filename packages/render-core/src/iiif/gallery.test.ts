import { describe, it, expect } from "vitest";
import { toCollection } from "./collection.js";
import { toExhibitsJson, shouldRenderGallery } from "./exhibits.js";
import type { Library } from "../model/model.js";

const base = "https://u.gh.io/lib/";
const lib: Library = {
  id: "lib1",
  title: "My Library",
  summary: "Things.",
  exhibits: [
    { id: "e1", slug: "a", title: "Exhibit A", cover: "https://img/a-cover.jpg", summary: "first", objects: [] },
    { id: "e2", slug: "b", title: "Exhibit B", objects: [] },
  ],
};

describe("toCollection (Library -> IIIF Collection)", () => {
  it("builds a Collection referencing each Exhibit's manifest, in order", () => {
    const c = toCollection(lib, { baseUrl: base });
    expect(c.type).toBe("Collection");
    expect(c["@context"]).toBe("http://iiif.io/api/presentation/3/context.json");
    expect(c.label).toEqual({ none: ["My Library"] });
    expect(c.items.map((i) => i.id)).toEqual([`${base}a/manifest.json`, `${base}b/manifest.json`]);
    expect(c.items[0]!.thumbnail?.[0]?.id).toBe("https://img/a-cover.jpg");
  });
  it("falls back to a default label when the Library has no title", () => {
    const c = toCollection({ id: "x", exhibits: [] }, {});
    expect(c.label.none?.[0]).toBeTruthy();
  });
});

describe("toExhibitsJson (the Gallery source — UX-Q7 schema-forward)", () => {
  it("emits a top-level library object + ordered exhibit cards + reserved presentation ns", () => {
    const j = toExhibitsJson(lib);
    expect(j.library).toEqual({ id: "lib1", title: "My Library", summary: "Things." });
    expect(j.exhibits).toEqual([
      { slug: "a", title: "Exhibit A", cover: "https://img/a-cover.jpg", description: "first", order: 0 },
      { slug: "b", title: "Exhibit B", order: 1 },
    ]);
    expect(j.presentation).toEqual({}); // reserved for v1.1 curation (additive, not a migration)
  });
});

describe("shouldRenderGallery (UX-Q7 single-exhibit collapse THRESHOLD)", () => {
  it("renders the gallery when there are multiple exhibits", () => {
    expect(shouldRenderGallery(lib)).toBe(true);
  });
  it("collapses (skips) only when exactly one exhibit AND no library title/summary", () => {
    expect(shouldRenderGallery({ id: "x", exhibits: [lib.exhibits[0]!] })).toBe(false);
  });
  it("renders a single-exhibit library if it has a title (something to frame)", () => {
    expect(shouldRenderGallery({ id: "x", title: "Framed", exhibits: [lib.exhibits[0]!] })).toBe(true);
  });
  it("renders an empty library (nothing to collapse to)", () => {
    expect(shouldRenderGallery({ id: "x", exhibits: [] })).toBe(true);
  });
});
