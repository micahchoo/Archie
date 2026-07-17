import { describe, it, expect, vi, afterEach } from "vitest";
import { hasWall, filterExhibits, filterImages, wallHref, mergeImageIndex } from "./gallery-view.js";
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
