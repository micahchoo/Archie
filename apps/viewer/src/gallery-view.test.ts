import { describe, it, expect, vi, afterEach } from "vitest";
import { hasWall, filterExhibits, filterImages, wallHref, mergeImageIndex, listedExhibits, unlistedSlugSet, searchActive, coverFallbacks } from "./gallery-view.js";
import { loadImageIndex } from "./published.js";
import type { ImageIndex } from "@render/core";

const idx: ImageIndex = {
  images: [
    { objectId: "o1", exhibitSlug: "a", title: "Coastal One" },
    { objectId: "o2", exhibitSlug: "b", title: "Archive Café" },
  ],
} as ImageIndex;

describe("gallery-view — hasWall (ADR-0023 degradation)", () => {
  it("offers the wall only for a non-empty index", () => {
    expect(hasWall(null)).toBe(false);
    expect(hasWall(undefined)).toBe(false);
    expect(hasWall({ images: [] } as ImageIndex)).toBe(false);
    expect(hasWall(idx)).toBe(true);
  });
});

describe("gallery-view — title filtering (shared matchesTitle)", () => {
  const cards = [{ title: "Coastal Survey", slug: "a" }, { title: "Archive Scans", slug: "b" }];
  it("filters exhibit cards by title, case-insensitively; empty query keeps all", () => {
    expect(filterExhibits(cards, "coastal").map((c) => c.slug)).toEqual(["a"]);
    expect(filterExhibits(cards, "SCAN").map((c) => c.slug)).toEqual(["b"]);
    expect(filterExhibits(cards, "")).toHaveLength(2);
  });
  it("filters image entries by title, ignoring diacritics; empty query keeps all", () => {
    expect(filterImages(idx.images, "cafe").map((e) => e.objectId)).toEqual(["o2"]); // "cafe" ~ "Café"
    expect(filterImages(idx.images, "coastal").map((e) => e.objectId)).toEqual(["o1"]);
    expect(filterImages(idx.images, "  ")).toHaveLength(2);
    expect(filterImages(idx.images, "zzz")).toHaveLength(0);
  });
  it("wallHref points at the object in its exhibit (existing route grammar)", () => {
    expect(wallHref(idx.images[0]!)).toBe("#/a/o/o1");
  });
});

describe("gallery-view — the UNLISTED lever (Archie-77b2): default LISTED, hall drops unlisted", () => {
  const cards = [
    { slug: "a", title: "Shown A" },
    { slug: "b", title: "Hidden B", unlisted: true },
    { slug: "c", title: "Shown C", unlisted: false },
  ];
  it("listedExhibits keeps cards without the flag; a card without `unlisted` is listed", () => {
    expect(listedExhibits(cards).map((c) => c.slug)).toEqual(["a", "c"]);
    const noFlag: { slug: string; title: string }[] = [{ slug: "x", title: "X" }];
    expect(listedExhibits(noFlag).map((c) => c.slug)).toEqual(["x"]); // default LISTED
  });
  it("unlistedSlugSet collects exactly the hidden slugs (for dropping wall tiles too)", () => {
    const hidden = unlistedSlugSet(cards);
    expect(hidden.has("b")).toBe(true);
    expect(hidden.has("a")).toBe(false);
    expect(hidden.size).toBe(1);
  });
});

describe("loadImageIndex — one fetch, degrade to null on any failure", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fakeRes = (over: Partial<Response> & { json?: () => Promise<unknown> }) =>
    ({ ok: true, status: 200, json: async () => idx, ...over }) as unknown as Response;

  it("returns the parsed index on a 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRes({})));
    expect(await loadImageIndex()).toEqual(idx);
  });
  it("returns null on a 404 SILENTLY — the expected ADR degradation must not error-log", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRes({ ok: false, status: 404 })));
    expect(await loadImageIndex()).toBeNull();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
  it("returns null on a 200 with an unparsable body (corrupt deploy)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRes({ json: async () => { throw new SyntaxError("Unexpected token <"); } })));
    expect(await loadImageIndex()).toBeNull();
  });
  it("returns null when fetch itself rejects (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await loadImageIndex()).toBeNull();
  });
});

describe("mergeImageIndex (live over hosted, drop live-fronted slugs) — STALENESS st3", () => {
  const img = (objectId: string, exhibitSlug: string) => ({ objectId, exhibitSlug, title: `${exhibitSlug}/${objectId}` });
  const live: ImageIndex = { images: [img("L1", "mine"), img("liveO", "shared")] };
  const hosted: ImageIndex = { images: [img("hostO", "shared"), img("H1", "other")] };
  const liveSlugs = new Set(["mine", "shared"]);

  it("live images front; hosted entries for a live-fronted slug are dropped (no collision dead-link)", () => {
    const merged = mergeImageIndex(live, hosted, liveSlugs)!;
    expect(merged.images.map((e) => `${e.exhibitSlug}/${e.objectId}`)).toEqual([
      "mine/L1", "shared/liveO", "other/H1", // hosted "shared/hostO" dropped (live fronts "shared")
    ]);
  });
  it("null only when NEITHER source exists", () => {
    expect(mergeImageIndex(null, null, new Set())).toBeNull();
    expect(mergeImageIndex(null, hosted, new Set())).toEqual(hosted);
    expect(mergeImageIndex(live, null, liveSlugs)).toEqual(live);
  });
});

// The read-side twin of Studio's W7 (audit V6): the lens browses, the search finds everything. The rule
// lives here so "is a search live" has ONE definition, and so the component can't drift back to a
// lens-scoped search by accident.
describe("searchActive — the lens/search mode switch (V6)", () => {
  it("is false for an empty or whitespace-only query", () => {
    expect(searchActive("")).toBe(false);
    expect(searchActive("   ")).toBe(false);
    expect(searchActive("\t\n")).toBe(false);
  });
  it("is true as soon as the reader has typed something", () => {
    expect(searchActive("a")).toBe(true);
    expect(searchActive("  folio  ")).toBe(true);
  });
});

// V7: an exhibit with no explicit cover borrowed nothing and rendered as its title on a blank wash —
// in the seeded library that was the FIRST card. Studio has always fallen back to the first object's
// thumbnail (gallery-data.ts coverOf); this is the viewer's equivalent, off the baked index.
describe("coverFallbacks — borrow the first object's thumbnail (V7)", () => {
  const withThumbs = {
    images: [
      { objectId: "o1", exhibitSlug: "a", title: "First of A", thumbnail: "a1.jpg" },
      { objectId: "o2", exhibitSlug: "a", title: "Second of A", thumbnail: "a2.jpg" },
      { objectId: "o3", exhibitSlug: "b", title: "First of B", thumbnail: "b1.jpg" },
    ],
  } as ImageIndex;

  it("takes the FIRST entry per slug — the index is in library→reading order", () => {
    const m = coverFallbacks(withThumbs);
    expect(m.get("a")).toBe("a1.jpg");
    expect(m.get("b")).toBe("b1.jpg");
  });

  it("skips entries with no thumbnail rather than caching an empty cover", () => {
    const m = coverFallbacks({
      images: [
        { objectId: "o1", exhibitSlug: "a", title: "No thumb" },
        { objectId: "o2", exhibitSlug: "a", title: "Has one", thumbnail: "a2.jpg" },
      ],
    } as ImageIndex);
    expect(m.get("a")).toBe("a2.jpg");
  });

  it("degrades to an empty map with no index — without images.json there is nothing to borrow", () => {
    expect(coverFallbacks(null).size).toBe(0);
    expect(coverFallbacks(undefined).size).toBe(0);
    expect(coverFallbacks({ images: [] } as ImageIndex).size).toBe(0);
  });
});
