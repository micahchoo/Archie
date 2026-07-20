// Phase 3.2 — Library-Gallery data shaping (flatten / cover / filter). matchesTitle itself is render-core's
// (already tested); here we pin the shaping + that filtering routes through it (case/diacritic-insensitive).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flattenLibraryImages, coverOf, filterExhibits, filterImages, createSearchDebouncer, commitMintedThumb } from "./gallery-data.js";
import { matchesTitle } from "@render/core";
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

describe("coverOf (thumbnail-mitigations gap 5 — first IMAGE object, else first object)", () => {
  it("picks the first object when it is an image", () => {
    expect(coverOf(lib()[0]!)).toEqual({ slug: "coast", objectId: "o1", source: "/assets/o1-cliff.png" });
  });
  it("skips leading AV / xyz-map objects to reach the first image (the AV-first exhibit gets a picture card)", () => {
    const ex: ExhibitMeta = { id: "e4", slug: "mix", title: "Mixed", objects: [
      { id: "a", source: "/assets/a-intro.mp3", label: "Intro", mediaType: "sound" },
      { id: "m", source: "https://t/{z}/{x}/{y}.png", label: "Map", tileSource: { kind: "xyz", template: "https://t/{z}/{x}/{y}.png", maxZoom: 4 } },
      { id: "p", source: "/assets/p-photo.png", label: "Photo" },
    ] };
    expect(coverOf(ex)).toEqual({ slug: "mix", objectId: "p", source: "/assets/p-photo.png" });
  });
  it("falls back to the first object when no image exists (all-AV keeps its honest motif cover)", () => {
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

describe("filterExhibits — matches DESCRIPTION as well as title (provenance trails searchable, §8)", () => {
  // A dedicated fixture (not `lib()`) so adding descriptions can't perturb the title/flatten tests above.
  // Mirrors an imported library: each exhibit's summary carries the "From: {root} › {sub}" trail §8 stamps.
  const trailed = (): ExhibitMeta[] => [
    { id: "e1", slug: "kells", title: "Book of Kells", summary: "From: BHC Archive › Manuscripts", objects: [] },
    { id: "e2", slug: "charter", title: "Founding Charter", summary: "From: BHC Archive › Documents", objects: [] },
    { id: "e3", slug: "bare", title: "Untrailed Item", objects: [] }, // no summary field at all
  ];
  it("finds an exhibit by a term only in its description (the trail, not the title)", () => {
    expect(filterExhibits(trailed(), "Documents").map((e) => e.slug)).toEqual(["charter"]);
  });
  it("still finds an exhibit by title", () => {
    expect(filterExhibits(trailed(), "kells").map((e) => e.slug)).toEqual(["kells"]);
  });
  it("matches title OR description with the SAME fold (case/diacritic-insensitive substring)", () => {
    // "archive" appears in both trails → both trailed exhibits; case-folded from "ARCHIVE".
    expect(filterExhibits(trailed(), "ARCHIVE").map((e) => e.slug)).toEqual(["kells", "charter"]);
  });
  it("an exhibit with no description is safe (never throws; simply can't match on description)", () => {
    expect(filterExhibits(trailed(), "Untrailed").map((e) => e.slug)).toEqual(["bare"]); // title match still works
    expect(filterExhibits(trailed(), "Documents").some((e) => e.slug === "bare")).toBe(false);
  });
  it("a query matching neither title nor description excludes the exhibit", () => {
    expect(filterExhibits(trailed(), "no-such-term").map((e) => e.slug)).toEqual([]);
  });
});

describe("flattenLibraryImages — precomputed searchKey (PERF, scale/library-search)", () => {
  // Every scenario the shared matchesTitle primitive is documented to handle (match.test.ts's own table) —
  // pins that the ONE-TIME fold at flatten time never drifts from what matchesTitle itself would compute
  // per-keystroke, so precomputing it is never a silent behavior change.
  const withTitles = (titles: string[]): ExhibitMeta[] => [
    { id: "e1", slug: "s", title: "S", objects: titles.map((t, i) => ({ id: `o${i}`, source: `/x${i}`, label: t })) },
  ];

  it("carries a searchKey per image (NFKD-folded once) alongside the untouched display title", () => {
    const imgs = flattenLibraryImages(withTitles(["Müller", "café society", "naïve", "Coastal Survey"]));
    expect(imgs.map((i) => i.title)).toEqual(["Müller", "café society", "naïve", "Coastal Survey"]); // display unchanged
    expect(imgs.map((i) => i.searchKey)).toEqual(["muller", "cafe society", "naive", "coastal survey"]);
  });

  it.each([
    ["Müller", "muller"],
    ["café society", "cafe"],
    ["naïve", "naive"],
    ["Field Notes", "eld"],
    ["Field Notes", "NOTES"],
  ] as const)("filterImages(%j, %j) matches — same verdict as matchesTitle", (title, query) => {
    const [img] = flattenLibraryImages(withTitles([title]));
    expect(filterImages([img!], query)).toHaveLength(1);
    expect(matchesTitle(title, query)).toBe(true); // the precomputed path and the shared primitive agree
  });

  it.each([
    ["Field Notes", "xyz"],
    ["Coastal Survey", "archive"],
  ] as const)("filterImages(%j, %j) excludes — same verdict as matchesTitle", (title, query) => {
    const [img] = flattenLibraryImages(withTitles([title]));
    expect(filterImages([img!], query)).toHaveLength(0);
    expect(matchesTitle(title, query)).toBe(false);
  });
});

describe("createSearchDebouncer — coalesces a keystroke burst into ONE filter recompute (PERF)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("commits only the LATEST query, after delayMs of silence following a burst", () => {
    const commits: string[] = [];
    const d = createSearchDebouncer((q) => commits.push(q), 130);
    d.schedule("d");
    d.schedule("du");
    d.schedule("dun");
    d.schedule("dune");
    expect(commits).toEqual([]); // nothing committed mid-burst
    vi.advanceTimersByTime(129);
    expect(commits).toEqual([]); // still inside the window
    vi.advanceTimersByTime(1);
    expect(commits).toEqual(["dune"]); // ONE commit — the final value, not one per keystroke
  });

  it("a query that clears to empty commits IMMEDIATELY — no debounce wait to show everything again", () => {
    const commits: string[] = [];
    const d = createSearchDebouncer((q) => commits.push(q), 130);
    d.schedule("dune");
    vi.advanceTimersByTime(130);
    expect(commits).toEqual(["dune"]);
    d.schedule("");
    expect(commits).toEqual(["dune", ""]); // no setTimeout round-trip for the clear
  });

  it("a whitespace-only query also clears immediately (trimmed, not raw emptiness)", () => {
    const commits: string[] = [];
    const d = createSearchDebouncer((q) => commits.push(q), 130);
    d.schedule("   ");
    expect(commits).toEqual(["   "]);
  });

  it("cancel() drops a pending commit (component teardown mid-debounce)", () => {
    const commits: string[] = [];
    const d = createSearchDebouncer((q) => commits.push(q), 130);
    d.schedule("dune");
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(commits).toEqual([]);
  });

  it("defaults to a 130ms window when delayMs is omitted", () => {
    const commits: string[] = [];
    const d = createSearchDebouncer((q) => commits.push(q));
    d.schedule("x");
    vi.advanceTimersByTime(129);
    expect(commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(commits).toEqual(["x"]);
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
