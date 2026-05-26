import { describe, it, expect } from "vitest";
import { collectFiles, buildGitTree } from "./ghpages.js";
import { publishLibrary } from "./site.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// GH-Pages publish adapter core (CONTEXT: zip-primitive + per-host adapters; the GH adapter uses
// the GitHub git-trees API — "replace this tree"). The file-tree builder is pure + testable; the
// actual createBlob/tree/commit/ref fetch sequence is the thin browser/network layer.

const alice = asClientId("alice");
const base = "https://u.gh.io/lib/";
const canvas = `${base}a/canvas/o1`;
const library: Library = { id: "lib", title: "Lib", exhibits: [{ id: "a", slug: "a", title: "A", objects: [{ id: "o1", source: "https://img/a.jpg", label: "A", width: 10, height: 10 }] }] };
const logA = appendNew([], { target: { type: "SpecificResource", source: canvas, selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,3,3" } }, body: { type: "TextualBody", value: "n" }, lastEditor: alice, modifiedAt: "t", now: 1 }).log;

describe("collectFiles — flatten the published tree from the seam", () => {
  it("walks the directory recursively into a path -> FileContent map (JSON pages are text)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, () => logA, { baseUrl: base });
    const files = await collectFiles(await fs.root());
    expect(Object.keys(files)).toContain("collection.json");
    expect(Object.keys(files)).toContain("exhibits.json");
    expect(Object.keys(files)).toContain("a/manifest.json");
    expect(Object.keys(files).some((p) => p.startsWith("a/canvas/o1/annotations"))).toBe(true);
    expect(Object.keys(files).some((p) => p.startsWith("a/annotations/history/"))).toBe(true);
    const coll = files["collection.json"]!;
    expect("text" in coll && JSON.parse(coll.text).type).toBe("Collection");
  });

  it("encodes image assets as base64 (binary), JSON as text", async () => {
    const fs = new MemoryFilesystem();
    const lib: Library = { id: "lib", exhibits: [{ id: "c", slug: "c", title: "C", objects: [{ id: "o1", source: "/assets/pic.png", label: "Imported", width: 4, height: 4 }] }] };
    const bytes = new Uint8Array([0, 1, 254, 255]).buffer; // non-UTF8 bytes
    await publishLibrary(fs, lib, () => [], { baseUrl: base, getAsset: async () => bytes });
    const files = await collectFiles(await fs.root());
    const asset = files["c/assets/pic.png"]!;
    expect("base64" in asset).toBe(true);
    if ("base64" in asset) expect(asset.base64).toBe(Buffer.from([0, 1, 254, 255]).toString("base64"));
    expect("text" in files["c/manifest.json"]!).toBe(true);
  });
});

describe("buildGitTree — GitHub git-trees payload (replace-this-tree)", () => {
  it("maps text → inline content + binary → base64 blob entries, sorted by path", async () => {
    const fs = new MemoryFilesystem();
    const lib: Library = { id: "lib", exhibits: [{ id: "c", slug: "c", title: "C", objects: [{ id: "o1", source: "/assets/pic.png", label: "Imported", width: 4, height: 4 }] }] };
    await publishLibrary(fs, lib, () => [], { baseUrl: base, getAsset: async () => new Uint8Array([1, 2, 3]).buffer });
    const tree = buildGitTree(await collectFiles(await fs.root()));
    expect(tree.length).toBeGreaterThanOrEqual(4);
    for (const e of tree) {
      expect(e.mode).toBe("100644");
      expect(e.type).toBe("blob");
      expect("content" in e || "base64" in e).toBe(true);
    }
    const assetEntry = tree.find((e) => e.path === "c/assets/pic.png")!;
    expect("base64" in assetEntry).toBe(true);
    const paths = tree.map((e) => e.path);
    expect([...paths].sort()).toEqual(paths); // sorted
  });
});
