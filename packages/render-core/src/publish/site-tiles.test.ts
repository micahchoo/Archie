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
});
