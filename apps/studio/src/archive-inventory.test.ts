import { describe, it, expect, vi, beforeEach } from "vitest";
import { probeArchive, type ProbedFile } from "./archive-probe.js";

// The library → probe-input pass (Archie-c367), and the measurement that decided its shape.
//
// PROBE COST, measured 2026-07-27 on this machine over a synthetic 10,000-entry inventory, three runs
// each (the harness is `probeArchive cost` below, which asserts an order of magnitude rather than a
// wall-clock so it is not a machine-dependent gate):
//
//   10,000 sampled 6000 px images (tiles at archival, 5.96 M published files) → 23.1 / 15.1 / 13.6 ms
//   10,000 sampled 2000 px images (no tiling)                                 → 10.1 /  4.9 /  5.1 ms
//   10,000 UNsampled images                                                   →  9.2 /  8.7 /  7.4 ms
//    1,000 sampled 6000 px images                                             →  0.9 /  0.8 /  0.7 ms
//
// So `probeArchive` itself is ONE FRAME of work at the top of the range, not a freeze — it is left
// unchunked deliberately. The expensive half is the INVENTORY: one OPFS stat per stored asset. That is
// what `libraryInventory` chunks and yields between, and what the scheduling tests below pin.

const assetSize = vi.fn<(slug: string, name: string) => Promise<number>>();
vi.mock("./store.js", () => ({
  assetSize: (slug: string, name: string) => assetSize(slug, name),
  isAsset: (source: string) => source.startsWith("/assets/"),
  ASSET_PREFIX: "/assets/",
}));

const { libraryInventory, INVENTORY_CHUNK } = await import("./archive-inventory.js");
type ExhibitLike = Parameters<typeof libraryInventory>[0][number];

/** A minimal exhibit shaped like `WorkingExhibitMeta` — only the fields the inventory reads. */
function exhibit(slug: string, objects: Record<string, unknown>[]): ExhibitLike {
  return { id: `ex-${slug}`, slug, title: slug, objects } as unknown as ExhibitLike;
}
const imported = (id: string, over: Record<string, unknown> = {}) => ({
  id, source: `/assets/${id}.jpg`, label: id, format: "image/jpeg", width: 4000, height: 3000, ...over,
});

beforeEach(() => {
  assetSize.mockReset();
  assetSize.mockResolvedValue(1_000_000);
});

describe("libraryInventory", () => {
  it("carries the dimensions ingest already measured, so the probe is fully sampled", async () => {
    // This is the whole reason the publish surface's probe is better grounded than a folder pick's:
    // nothing has to be decoded, because the library already knows its own pixels.
    const files = await libraryInventory([exhibit("folios", [imported("a"), imported("b", { width: 6000, height: 8000 })])]);
    expect(files.map((f) => [f.width, f.height])).toEqual([[4000, 3000], [6000, 8000]]);

    const probe = probeArchive(files);
    expect(probe.confidence.imagesSampledFraction).toBe(1);
    expect(probe.folder.images).toBe(2);
  });

  it("stats every stored asset exactly once, by exhibit slug and stored name", async () => {
    assetSize.mockImplementation(async (_slug, name) => (name === "a.jpg" ? 7 : 11));
    const files = await libraryInventory([exhibit("folios", [imported("a")]), exhibit("maps", [imported("b")])]);
    expect(assetSize.mock.calls).toEqual([["folios", "a.jpg"], ["maps", "b.jpg"]]);
    expect(files.map((f) => f.bytes)).toEqual([7, 11]);
    expect(files.map((f) => f.relativePath)).toEqual(["folios/a.jpg", "maps/b.jpg"]);
  });

  it("never stats a remote source, and still counts it as an object", async () => {
    // A IIIF object holds no local bytes, but publish fetches and (over the threshold) tiles it — so
    // it must not read as weightless, and it must still be one object in the file counts.
    const files = await libraryInventory([
      exhibit("remote", [{ id: "r1", source: "https://example.org/iiif/1/info.json", label: "r1", width: 2000, height: 1500 }]),
    ]);
    expect(assetSize).not.toHaveBeenCalled();
    expect(files).toHaveLength(1);
    expect(files[0]!.bytes).toBeGreaterThan(0);
    expect(probeArchive(files).folder.images).toBe(1);
  });

  it("classifies audio and video by the media type when no format was recorded", async () => {
    const files = await libraryInventory([exhibit("av", [
      { id: "s1", source: "/assets/s1.wav", label: "s1", mediaType: "sound", duration: 60 },
      { id: "v1", source: "/assets/v1.mov", label: "v1", mediaType: "video", duration: 30 },
    ])]);
    const probe = probeArchive(files);
    expect(probe.folder.audio).toBe(1);
    expect(probe.folder.video).toBe(1);
    // Duration comes from the model, so the Opus estimate is grounded rather than inferred from bytes.
    expect(files.map((f) => f.durationSec)).toEqual([60, 30]);
  });

  it("yields between chunks — the scheduling claim, not just the result", async () => {
    // The point of chunking is that OTHER work gets to run. A macrotask queued before the walk starts
    // must therefore land BEFORE the walk finishes; with a single unyielded loop it could not.
    const objects = Array.from({ length: INVENTORY_CHUNK * 3 }, (_, i) => imported(`o${i}`));
    const order: string[] = [];
    assetSize.mockImplementation(async () => 1);

    const walk = libraryInventory([exhibit("big", objects)]).then(() => order.push("inventory-done"));
    setTimeout(() => order.push("other-work"), 0);
    await walk;

    expect(order).toEqual(["other-work", "inventory-done"]);
  });

  it("reports progress once per chunk, ending on total/total", async () => {
    const objects = Array.from({ length: INVENTORY_CHUNK * 2 + 5 }, (_, i) => imported(`o${i}`));
    const seen: [number, number][] = [];
    await libraryInventory([exhibit("big", objects)], (done, total) => seen.push([done, total]));
    expect(seen.at(-1)).toEqual([objects.length, objects.length]);
    // Monotone and never past the total — a progress line that goes backwards or overshoots is worse
    // than none, because the author reads it as the app being confused.
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    expect(seen.every(([d, t]) => d <= t)).toBe(true);
  });

  it("an empty library produces an empty inventory and no stats", async () => {
    expect(await libraryInventory([])).toEqual([]);
    expect(assetSize).not.toHaveBeenCalled();
  });
});

describe("probeArchive cost", () => {
  it("is one frame's work at 10,000 entries, not a freeze", () => {
    // The bound is deliberately loose (200 ms against a measured 13–23 ms) — this is a canary for an
    // accidental quadratic in the probe, not a wall-clock gate on someone else's laptop. Recording the
    // measured figures in this file's header is what makes the number meaningful; this only catches a
    // change of ORDER.
    const files: ProbedFile[] = Array.from({ length: 10_000 }, (_, i) => ({
      name: `scan-${i}.tif`, relativePath: `masters/scan-${i}.tif`, type: "image/tiff",
      bytes: 76_000_000, width: 6000, height: 8000,
    }));
    const t0 = performance.now();
    const probe = probeArchive(files, { exhibitCount: 10 });
    const elapsed = performance.now() - t0;
    expect(probe.folder.images).toBe(10_000);
    expect(elapsed).toBeLessThan(200);
  });
});
