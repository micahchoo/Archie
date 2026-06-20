import { describe, it, expect } from "vitest";
import { toCollection } from "./collection.js";
import { toExhibitsJson, toReadingCollection, shouldRenderGallery, shouldRenderGalleryFromJson } from "./exhibits.js";
import type { Library } from "../model/model.js";
import { asExhibitId, asLibraryId } from "../wadm/brand.js";

const base = "https://u.gh.io/lib/";
const lib: Library = {
  id: asLibraryId("lib1"),
  title: "My Library",
  summary: "Things.",
  exhibits: [
    { id: asExhibitId("e1"), slug: "a", title: "Exhibit A", cover: "https://img/a-cover.jpg", summary: "first", objects: [] },
    { id: asExhibitId("e2"), slug: "b", title: "Exhibit B", objects: [] },
  ],
};

describe("toCollection (Library -> IIIF Collection)", () => {
  it("builds a Collection referencing each Exhibit's manifest, in order", () => {
    const c = toCollection(lib, { baseUrl: base });
    expect(c.type).toBe("Collection");
    expect(c["@context"]).toBe("https://iiif.io/api/presentation/3/context.json");
    expect(c.label).toEqual({ none: ["My Library"] });
    expect(c.items.map((i) => i.id)).toEqual([`${base}a/manifest.json`, `${base}b/manifest.json`]);
    expect(c.items[0]!.thumbnail?.[0]?.id).toBe("https://img/a-cover.jpg");
  });
  it("falls back to a default label when the Library has no title", () => {
    const c = toCollection({ id: asLibraryId("x"), exhibits: [] }, {});
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
    expect(shouldRenderGallery({ id: asLibraryId("x"), exhibits: [lib.exhibits[0]!] })).toBe(false);
  });
  it("renders a single-exhibit library if it has a title (something to frame)", () => {
    expect(shouldRenderGallery({ id: asLibraryId("x"), title: "Framed", exhibits: [lib.exhibits[0]!] })).toBe(true);
  });
  it("renders an empty library (nothing to collapse to)", () => {
    expect(shouldRenderGallery({ id: asLibraryId("x"), exhibits: [] })).toBe(true);
  });
});

describe("toReadingCollection (ADR-0007 per-Reading AnnotationCollection header)", () => {
  it("emits a header-only WADM collection with the caller-supplied id + `en` name/description", () => {
    const id = `${base}voynich/annotations/readings/cipher.json`;
    const coll = toReadingCollection({ id: "cipher", name: "Cipher", description: "The decipherment." }, id);
    expect(coll).toEqual({
      "@context": "https://www.w3.org/ns/anno.jsonld",
      id,
      type: "AnnotationCollection",
      label: { en: ["Cipher"] },
      summary: { en: ["The decipherment."] },
    });
  });
  it("omits `summary` when the Reading has no description (byte-stable absence)", () => {
    const coll = toReadingCollection({ id: "r1", name: "Plain" }, "x");
    expect(coll).toEqual({
      "@context": "https://www.w3.org/ns/anno.jsonld",
      id: "x",
      type: "AnnotationCollection",
      label: { en: ["Plain"] },
    });
    expect("summary" in coll).toBe(false);
  });
});

describe("shouldRenderGalleryFromJson (consumer side — same rule on the published ExhibitsJson)", () => {
  it("agrees with shouldRenderGallery for every framing case", () => {
    expect(shouldRenderGalleryFromJson(toExhibitsJson(lib))).toBe(true); // N>1
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), exhibits: [lib.exhibits[0]!] }))).toBe(false); // N=1, no framing
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), title: "Framed", exhibits: [lib.exhibits[0]!] }))).toBe(true); // N=1, framed
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), exhibits: [] }))).toBe(true); // empty
  });
});
