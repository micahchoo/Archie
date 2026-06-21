import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { collectFiles } from "./ghpages.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { DziTileSource } from "../iiif/resolve.js";

const base = "https://x.io/lib/";
const lib: Library = {
  id: asLibraryId("lib"),
  exhibits: [{
    id: asExhibitId("c"), slug: "c", title: "C",
    objects: [{ id: asObjectId("o1"), source: "/assets/pic.jpg", label: "Big", width: 8000, height: 6000 }],
  }],
};

const descriptor: DziTileSource = {
  kind: "dzi", width: 8000, height: 6000, tileSize: 254, overlap: 1, format: "image/jpeg", filesPath: "pic.jpg_files",
};
const fakeTiles = () => new Map<string, Blob>([
  ["0/0_0.jpg", new Blob([new Uint8Array([1])], { type: "image/jpeg" })],
  ["13/0_0.jpg", new Blob([new Uint8Array([2])], { type: "image/jpeg" })],
  ["13/1_0.jpg", new Blob([new Uint8Array([3])], { type: "image/jpeg" })],
]);

describe("publishLibrary DZI tiling (tileObject)", () => {
  it("writes the pyramid under {slug}/{name}_files and stamps tileSource on the published object", async () => {
    const fs = new MemoryFilesystem();
    let called: [string, string] | null = null;
    await publishLibrary(fs, lib, () => [], {
      baseUrl: base,
      getAsset: async () => new Uint8Array([9, 9, 9]).buffer,
      tileObject: async (slug, name) => { called = [slug, name]; return { descriptor, tiles: fakeTiles() }; },
    });
    const files = await collectFiles(await fs.root());
    const paths = Object.keys(files);
    expect(called).toEqual(["c", "pic.jpg"]);
    // tiles written at {slug}/{name}_files/{level}/{col}_{row}.{ext}, nested level dirs created
    expect(paths).toContain("c/pic.jpg_files/0/0_0.jpg");
    expect(paths).toContain("c/pic.jpg_files/13/0_0.jpg");
    expect(paths).toContain("c/pic.jpg_files/13/1_0.jpg");
    // the published manifest carries the tileSource pointing at the published pyramid base
    const manifest = files["c/manifest.json"] as { text: string };
    expect(manifest.text).toContain(`${base}c/pic.jpg_files`);
  });

  it("no tileObject → byte-compatible single-image publish (no _files tree)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, () => [], { baseUrl: base, getAsset: async () => new Uint8Array([9]).buffer });
    const paths = Object.keys(await collectFiles(await fs.root()));
    expect(paths.some((p) => p.includes("_files"))).toBe(false);
    expect(paths).toContain("c/assets/pic.jpg");
  });

  it("tileObject returning null leaves the object untiled", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lib, () => [], {
      baseUrl: base, getAsset: async () => new Uint8Array([9]).buffer, tileObject: async () => null,
    });
    const paths = Object.keys(await collectFiles(await fs.root()));
    expect(paths.some((p) => p.includes("_files"))).toBe(false);
  });

  const remoteObj = (extra: Record<string, unknown> = {}) => ({
    id: asObjectId("o9"), source: "https://iiif.example/img/info.json", label: "Remote", width: 8000, height: 6000, ...extra,
  });
  const remoteLib = (extra?: Record<string, unknown>): Library => ({
    id: asLibraryId("lib"),
    exhibits: [{ id: asExhibitId("r"), slug: "r", title: "R", objects: [remoteObj(extra)] }],
  });

  it("bakes a REMOTE IIIF object ONLY when opted in (bakeTiles) → persists {objId}_files + stamps tileSource", async () => {
    const fs = new MemoryFilesystem();
    let calledId: string | null = null;
    await publishLibrary(fs, remoteLib({ bakeTiles: true }), () => [], {
      baseUrl: base,
      tileRemote: async (_slug, obj) => { calledId = obj.id; return { descriptor, tiles: fakeTiles() }; },
    });
    const files = await collectFiles(await fs.root());
    const paths = Object.keys(files);
    expect(calledId).toBe("o9");
    expect(paths).toContain("r/o9_files/0/0_0.jpg");
    expect(paths).toContain("r/o9_files/13/1_0.jpg");
    expect((files["r/manifest.json"] as { text: string }).text).toContain(`${base}r/o9_files`);
  });

  it("does NOT bake a remote object without bakeTiles (opt-in OFF by default)", async () => {
    const fs = new MemoryFilesystem();
    let called = false;
    await publishLibrary(fs, remoteLib(), () => [], { // no bakeTiles
      baseUrl: base,
      tileRemote: async () => { called = true; return { descriptor, tiles: fakeTiles() }; },
    });
    expect(called).toBe(false);
    expect(Object.keys(await collectFiles(await fs.root())).some((p) => p.includes("_files"))).toBe(false);
  });

  it("does NOT re-tile a just-published local /assets/ object as if remote (the /assets/ guard)", async () => {
    const fs = new MemoryFilesystem();
    let remoteCalled = false;
    // lib's object is /assets/pic.jpg → the asset pass rewrites it to {base}c/assets/pic.jpg (an https url);
    // tileRemote must NOT fire on that rewritten source.
    await publishLibrary(fs, lib, () => [], {
      baseUrl: base,
      getAsset: async () => new Uint8Array([9]).buffer,
      tileRemote: async () => { remoteCalled = true; return { descriptor, tiles: fakeTiles() }; },
    });
    expect(remoteCalled).toBe(false);
  });
});
