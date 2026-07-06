import { describe, it, expect } from "vitest";
import { publishLibrary } from "../publish/site.js";
import { collectFiles } from "../publish/ghpages.js";
import { buildImageIndex } from "./image-index.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// Library-level image index (ADR-0023 / spike-0004): images.json is a flat projection of every Object,
// built by reading the PUBLISHED manifests after the write loop — correct on full AND incremental publishes.

const BASE = "https://u/lib/";
const noLog = (): AnnotationLog => [];
// a: two imported-asset objects with baked thumbnails + dims. b: one remote-image object (derived thumb).
const a1 = { id: asObjectId("a1"), source: "/assets/p1.jpg", label: "Alpha One", width: 4000, height: 3000, thumbnail: "/assets-thumb/p1.jpg" };
const a2 = { id: asObjectId("a2"), source: "/assets/p2.jpg", label: "Alpha Two", width: 1000, height: 1000, thumbnail: "/assets-thumb/p2.jpg" };
// A IIIF-SERVICE source — toCanvas derives its thumbnail via the Image API (a plain external raster
// would get NO thumbnail: the grid derives that at runtime, so it's correctly omitted from the index).
const b1 = { id: asObjectId("b1"), source: "https://iiif.example/img/info.json", label: "Beta One", width: 800, height: 600 };
const exA = { id: asExhibitId("exA"), slug: "a", title: "A", objects: [a1, a2] };
const exB = { id: asExhibitId("exB"), slug: "b", title: "B", objects: [b1] };
const lib: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exA, exB] };
const opts = () => ({ baseUrl: BASE, getAsset: async () => new Uint8Array([1, 2, 3]).buffer, getThumbnail: async () => new Uint8Array([9]).buffer });
const readIndex = async (fs: MemoryFilesystem) => JSON.parse(((await collectFiles(await fs.root()))["images.json"] as { text: string }).text);

describe("buildImageIndex — library-level image index (ADR-0023, spike-0004)", () => {
  it("flattens in library order then per-exhibit reading order, with title / thumbnail / dims", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, noLog, opts());
    const idx = await buildImageIndex(fs, lib);
    expect(idx.images.map((e) => `${e.exhibitSlug}/${e.objectId}`)).toEqual(["a/a1", "a/a2", "b/b1"]);
    expect(idx.images[0]).toEqual({ objectId: "a1", exhibitSlug: "a", title: "Alpha One", thumbnail: `${BASE}a/assets-thumb/p1.jpg`, width: 4000, height: 3000 });
    // IIIF-service object gets a DERIVED thumbnail (Image API 3.0 sized JPEG), read straight off the canvas.
    expect(idx.images.find((e) => e.objectId === "b1")!.thumbnail).toBe("https://iiif.example/img/full/240,/0/default.jpg");
  });

  it("publishLibrary emits images.json at root, stamp()-versioned, equal to buildImageIndex", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, noLog, opts());
    const emitted = await readIndex(fs);
    expect(emitted.schemaVersion).toBe(1);
    expect(emitted.images).toEqual((await buildImageIndex(fs, lib)).images);
  });

  it("thumbnail refs for baked assets resolve to a real file in the published tree", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, noLog, opts());
    const tree = await collectFiles(await fs.root());
    const idx = await buildImageIndex(fs, lib);
    const a1e = idx.images.find((e) => e.objectId === "a1")!;
    expect(tree[a1e.thumbnail!.replace(BASE, "")]).toBeDefined(); // "a/assets-thumb/p1.jpg" exists on disk
  });

  it("SURVIVES a byte-pass-skipped incremental publish — the skipped exhibit's entries keep their refs", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, noLog, opts()); // full baseline
    // Incremental: scope to exhibit a, NO reassets → b is skipped entirely; a's byte passes are skipped
    // (recover-from-manifest). images.json is still rebuilt from every manifest.
    await publishLibrary(fs, lib, noLog, { ...opts(), incremental: { exhibits: new Set(["a"]), reassets: new Set() } });
    const idx = await readIndex(fs);
    expect(idx.images.map((e: { objectId: string }) => e.objectId)).toEqual(["a1", "a2", "b1"]);
    // b1 (never re-touched) keeps its EXACT derived thumbnail; a1 (recovered, no byte pass) keeps its BAKED ref.
    expect(idx.images.find((e: { objectId: string }) => e.objectId === "b1").thumbnail).toBe("https://iiif.example/img/full/240,/0/default.jpg");
    expect(idx.images.find((e: { objectId: string }) => e.objectId === "a1").thumbnail).toBe(`${BASE}a/assets-thumb/p1.jpg`);
  });

  it("empty Library → a valid empty index", async () => {
    const fs = new MemoryFilesystem();
    const empty: Library = { id: asLibraryId("lib"), exhibits: [] };
    await publishLibrary(fs, empty, noLog, { baseUrl: BASE });
    expect((await buildImageIndex(fs, empty)).images).toEqual([]);
    expect(await readIndex(fs)).toEqual({ images: [], schemaVersion: 1 });
  });

  it("omits the thumbnail field for a thumbnail-less object (AV with no baked derivative)", async () => {
    const fs = new MemoryFilesystem();
    const av = { id: asObjectId("s1"), source: "https://media.example/track.mp3", label: "A Recording", mediaType: "sound" as const };
    const avLib: Library = { id: asLibraryId("lib"), exhibits: [{ id: asExhibitId("s"), slug: "s", title: "S", objects: [av] }] };
    await publishLibrary(fs, avLib, noLog, { baseUrl: BASE });
    const idx = await buildImageIndex(fs, avLib);
    expect(idx.images).toEqual([{ objectId: "s1", exhibitSlug: "s", title: "A Recording" }]); // no thumbnail/width/height
  });
});
