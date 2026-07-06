// Phase 3.2 — Library-Gallery data shaping (flatten / cover / filter). matchesTitle itself is render-core's
// (already tested); here we pin the shaping + that filtering routes through it (case/diacritic-insensitive).
import { describe, it, expect } from "vitest";
import { flattenLibraryImages, coverOf, filterExhibits, filterImages, commitMintedThumb } from "./gallery-data.js";
import type { ExhibitMeta } from "./store.js";

const lib = (): ExhibitMeta[] => [
  { id: "e1", slug: "coast", title: "Coastal Survey", objects: [
    { id: "o1", source: "/assets/o1-cliff.png", label: "Cliff", width: 4000, height: 3000 },
    { id: "o2", source: "https://iiif/dune", label: "Düne", mediaType: "image" },
  ] },
  { id: "e2", slug: "sound", title: "Field Recordings", objects: [
    { id: "o1", source: "/assets/o1-wave.mp3", label: "Wave", mediaType: "sound" },
  ] },
  { id: "e3", slug: "empty", title: "Empty", objects: [] },
];

describe("flattenLibraryImages", () => {
  it("lists every object across exhibits in library → reading order, carrying dims/mediaType", () => {
    const imgs = flattenLibraryImages(lib());
    expect(imgs.map((i) => `${i.exhibitSlug}/${i.objectId}`)).toEqual(["coast/o1", "coast/o2", "sound/o1"]);
    expect(imgs[0]).toMatchObject({ objectId: "o1", exhibitSlug: "coast", exhibitTitle: "Coastal Survey", title: "Cliff", source: "/assets/o1-cliff.png", width: 4000, height: 3000 });
    expect(imgs[2]).toMatchObject({ title: "Wave", mediaType: "sound" });
    expect("width" in imgs[1]!).toBe(false); // o2 had no dims → omitted (mirrors images.json's optional dims)
  });
  it("skips empty exhibits (no phantom tiles)", () => {
    expect(flattenLibraryImages(lib()).some((i) => i.exhibitSlug === "empty")).toBe(false);
  });
});

describe("coverOf", () => {
  it("picks the first object", () => {
    expect(coverOf(lib()[0]!)).toEqual({ slug: "coast", objectId: "o1", source: "/assets/o1-cliff.png" });
    expect(coverOf(lib()[1]!)).toEqual({ slug: "sound", objectId: "o1", source: "/assets/o1-wave.mp3", mediaType: "sound" });
  });
  it("returns null for an empty exhibit", () => {
    expect(coverOf(lib()[2]!)).toBeNull();
  });
});

describe("filterExhibits / filterImages — via matchesTitle (case + diacritic folded, substring)", () => {
  it("empty query returns the input identity (no needless re-render)", () => {
    const ex = lib();
    expect(filterExhibits(ex, "")).toBe(ex);
    expect(filterExhibits(ex, "   ")).toBe(ex);
    const imgs = flattenLibraryImages(ex);
    expect(filterImages(imgs, "")).toBe(imgs);
  });
  it("filters exhibits by title, case-insensitive substring", () => {
    expect(filterExhibits(lib(), "field").map((e) => e.slug)).toEqual(["sound"]);
    expect(filterExhibits(lib(), "SURVEY").map((e) => e.slug)).toEqual(["coast"]);
  });
  it("filters wall tiles by object title, diacritic-insensitive (Düne matches 'dune')", () => {
    const imgs = flattenLibraryImages(lib());
    expect(filterImages(imgs, "dune").map((i) => i.title)).toEqual(["Düne"]);
    expect(filterImages(imgs, "wave").map((i) => i.objectId)).toEqual(["o1"]);
  });
});

describe("commitMintedThumb — destroy-during-mint never leaks the blob", () => {
  it("a tile destroyed while its mint was in flight REVOKES the late URL and installs nothing", () => {
    const revoked: string[] = [];
    const kept = commitMintedThumb("blob:late", true, (u) => revoked.push(u));
    expect(kept).toBeNull(); // nothing to install on a dead component
    expect(revoked).toEqual(["blob:late"]); // the orphan blob was freed
  });

  it("a live tile keeps its minted URL and revokes nothing", () => {
    const revoked: string[] = [];
    const kept = commitMintedThumb("blob:x", false, (u) => revoked.push(u));
    expect(kept).toBe("blob:x");
    expect(revoked).toEqual([]);
  });

  it("a null read (no baked thumb) is a no-op either way — nothing to revoke", () => {
    const revoked: string[] = [];
    expect(commitMintedThumb(null, true, (u) => revoked.push(u))).toBeNull();
    expect(commitMintedThumb(null, false, (u) => revoked.push(u))).toBeNull();
    expect(revoked).toEqual([]);
  });
});
