import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryFilesystem } from "@render/core";
import { treeAssetBlobUrl } from "./published.js";

// Archie-f34b — a LIVE (OPFS-fronted) exhibit rendered no thumbnails.
//
// The mechanism, measured rather than assumed (the ticket's own hypothesis was wrong, and so was
// mine): `initLiveSource` runs the real `publishLibrary` into an in-memory tree, so the bytes ARE
// there and the covers are TREE-RELATIVE — `{slug}/assets-thumb/{name}`, not `/assets/{name}` and not
// an absolute URL at WORKING_IRI_BASE. The gallery then ran them through `publishedAssetUrl`, which
// resolves a relative ref against the PUBLISHED root, so the browser fetched a path that exists only
// for exhibits that were actually published. `publishedAssetUrl`'s doc asserted the opposite —
// "a live/OPFS-fronted exhibit already hands us a usable URL" — which is the false premise that let
// this sit.
//
// What this file covers: the RULE. What it does NOT cover: the end-to-end live path, which is reached
// through `navigator.storage.getDirectory()` and has no test harness in this suite at all. That
// absence is why the bug shipped; it is stated here rather than papered over.

describe("treeAssetBlobUrl — resolving a live tree's asset refs (Archie-f34b)", () => {
  let created: string[];
  beforeEach(() => {
    created = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (b: Blob) => { const u = `blob:live/${created.length}#${b.size}`; created.push(u); return u; },
      revokeObjectURL: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const treeWith = async (path: string, bytes: number[]): Promise<MemoryFilesystem> => {
    const fs = new MemoryFilesystem();
    const parts = path.split("/");
    let dir = await fs.root();
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
    const w = await (await dir.getFile(parts[parts.length - 1]!, { create: true })).writable();
    await w.write(new Uint8Array(bytes).buffer as ArrayBuffer);
    await w.close();
    return fs;
  };

  it("mints a blob URL for a TREE-RELATIVE ref — the shape a live cover actually has", async () => {
    const fs = await treeWith("mine/assets-thumb/photo.jpg", [1, 2, 3]);
    const url = await treeAssetBlobUrl(fs, "mine/assets-thumb/photo.jpg", new Map());
    expect(url).toMatch(/^blob:/);
    expect(created).toHaveLength(1);
    expect(url).toContain("#3"); // the real bytes, not an empty Blob
  });

  it("passes an ABSOLUTE ref through untouched — a remote IIIF cover needs no help", async () => {
    const fs = await treeWith("mine/assets-thumb/photo.jpg", [1]);
    const cache = new Map<string, string>();
    for (const ref of ["https://iiif.example/x/full/400,/0/default.jpg", "//cdn/x.jpg", "/published/x.jpg", "data:image/png;base64,AA", "blob:already"]) {
      expect(await treeAssetBlobUrl(fs, ref, cache)).toBe(ref);
    }
    expect(created).toHaveLength(0); // and nothing was minted for any of them
  });

  it("returns undefined when the bytes are NOT in the tree, so the caller's fallback fires", async () => {
    // The gallery's broken-cover path falls back to the exhibit title. Handing it a blob URL over an
    // empty Blob would render a broken image instead — worse than no cover.
    const fs = await treeWith("mine/assets-thumb/photo.jpg", [1]);
    expect(await treeAssetBlobUrl(fs, "mine/assets-thumb/absent.jpg", new Map())).toBeUndefined();
    expect(await treeAssetBlobUrl(fs, "nosuchexhibit/assets-thumb/x.jpg", new Map())).toBeUndefined();
  });

  it("mints ONCE per ref — a wall re-render must not leak a URL per paint", async () => {
    const fs = await treeWith("mine/assets-thumb/photo.jpg", [1, 2]);
    const cache = new Map<string, string>();
    const a = await treeAssetBlobUrl(fs, "mine/assets-thumb/photo.jpg", cache);
    const b = await treeAssetBlobUrl(fs, "mine/assets-thumb/photo.jpg", cache);
    expect(a).toBe(b);
    expect(created).toHaveLength(1);
  });

  it("no tree → the ref is returned as-is, never a dangling blob", async () => {
    expect(await treeAssetBlobUrl(null, "mine/assets-thumb/photo.jpg", new Map())).toBe("mine/assets-thumb/photo.jpg");
    expect(await treeAssetBlobUrl(null, undefined, new Map())).toBeUndefined();
  });
});
