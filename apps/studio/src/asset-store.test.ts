// Direct coverage for asset-store.ts (Archie-cf93 extraction from store.ts). Deliberately does NOT
// duplicate asset-read-failure.test.ts, which already owns the absent-vs-failed / AssetReadFailedError
// branches for readThumbBytes/readThumbUrl. This file covers what that one doesn't: the write+read
// round trips (peaks, master, original) and the two pure helpers (assetSize, isAsset/ASSET_PREFIX).
//
// Fake-OPFS style follows asset-read-failure.test.ts's handle-tree stub, extended to support WRITES
// (getFileHandle create:true + createWritable/write/close) since these tests round-trip through the
// real save* functions rather than pre-seeding files.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  ASSET_PREFIX, isAsset,
  saveAssetFile, saveOriginalFile,
  readAssetBlob, readOriginalBytes,
  readPeaks, savePeaks, type PeakCache,
  assetSize,
} from "./asset-store.js";

type FileEntry = { blob: Blob };
type DirNode = { dirs: Map<string, DirNode>; files: Map<string, FileEntry> };

function newDir(): DirNode {
  return { dirs: new Map(), files: new Map() };
}

function handleFor(node: DirNode): unknown {
  return {
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      let child = node.dirs.get(name);
      if (!child) {
        if (!opts?.create) throw new DOMException(`missing dir ${name}`, "NotFoundError");
        child = newDir();
        node.dirs.set(name, child);
      }
      return handleFor(child);
    },
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      let entry = node.files.get(name);
      if (!entry) {
        if (!opts?.create) throw new DOMException(`missing file ${name}`, "NotFoundError");
        entry = { blob: new Blob([]) };
        node.files.set(name, entry);
      }
      return {
        getFile: async () => new File([entry!.blob], name), // OPFS drops MIME type — no `type` passed
        createWritable: async () => {
          let pending: Blob | null = null;
          return {
            write: async (data: Blob) => { pending = data; },
            close: async () => { if (pending) entry!.blob = pending; },
          };
        },
      };
    },
  };
}

/** A fresh in-memory OPFS root, stubbed onto `navigator.storage.getDirectory`. Persists across calls
 *  within one test (unlike asset-read-failure.test.ts's fixed-snapshot fakeOpfs) so save-then-read
 *  round trips see their own writes. */
let root: DirNode;
beforeEach(() => {
  root = newDir();
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => handleFor(root) } });
});
afterEach(() => vi.unstubAllGlobals());

async function blobText(b: Blob): Promise<string> {
  return new TextDecoder().decode(await b.arrayBuffer());
}

/** Directly seed a file into the fake tree at {PROJECT}/exhibits/{slug}/{sub}/{name}, bypassing the
 *  handle layer — for planting corrupt/malformed content that no real save* function would write. */
function seedFile(slug: string, sub: string, name: string, content: string): void {
  const project = root.dirs.get("archie-demo-project") ?? (root.dirs.set("archie-demo-project", newDir()), root.dirs.get("archie-demo-project")!);
  const exhibits = project.dirs.get("exhibits") ?? (project.dirs.set("exhibits", newDir()), project.dirs.get("exhibits")!);
  const ex = exhibits.dirs.get(slug) ?? (exhibits.dirs.set(slug, newDir()), exhibits.dirs.get(slug)!);
  const dir = ex.dirs.get(sub) ?? (ex.dirs.set(sub, newDir()), ex.dirs.get(sub)!);
  dir.files.set(name, { blob: new Blob([content]) });
}

describe("isAsset / ASSET_PREFIX", () => {
  it("ASSET_PREFIX is the literal object-source prefix", () => {
    expect(ASSET_PREFIX).toBe("/assets/");
  });

  it("undefined source is not an asset", () => {
    expect(isAsset(undefined)).toBe(false);
  });

  it("empty string is not an asset", () => {
    expect(isAsset("")).toBe(false);
  });

  it("a prefixed source is an asset", () => {
    expect(isAsset("/assets/folio-1.jpg")).toBe(true);
  });

  it("the bare prefix (no filename) still counts — startsWith, not a stricter shape check", () => {
    expect(isAsset(ASSET_PREFIX)).toBe(true);
  });

  it("a remote URL is not an asset", () => {
    expect(isAsset("https://example.com/folio-1.jpg")).toBe(false);
  });

  it("a near-miss prefix (missing trailing slash) is not an asset", () => {
    expect(isAsset("/assets")).toBe(false);
  });
});

describe("saveAssetFile / readAssetBlob round trip (display master)", () => {
  it("writes then reads back the same bytes", async () => {
    await saveAssetFile("ex", "folio-1.jpg", new Blob(["master-bytes"]));
    const blob = await readAssetBlob("ex", "folio-1.jpg");
    expect(blob).not.toBeNull();
    expect(await blobText(blob!)).toBe("master-bytes");
  });

  it("a second save overwrites the first (same name)", async () => {
    await saveAssetFile("ex", "folio-1.jpg", new Blob(["v1"]));
    await saveAssetFile("ex", "folio-1.jpg", new Blob(["v2-longer"]));
    const blob = await readAssetBlob("ex", "folio-1.jpg");
    expect(await blobText(blob!)).toBe("v2-longer");
  });

  it("different exhibits keep separate asset dirs", async () => {
    await saveAssetFile("ex-a", "shared-name.jpg", new Blob(["a"]));
    await saveAssetFile("ex-b", "shared-name.jpg", new Blob(["b"]));
    expect(await blobText((await readAssetBlob("ex-a", "shared-name.jpg"))!)).toBe("a");
    expect(await blobText((await readAssetBlob("ex-b", "shared-name.jpg"))!)).toBe("b");
  });
});

describe("saveOriginalFile / readOriginalBytes round trip", () => {
  it("writes then reads back the same bytes, as an ArrayBuffer", async () => {
    await saveOriginalFile("ex", "folio-1.tif", new Blob(["original-tiff-bytes"]));
    const bytes = await readOriginalBytes("ex", "folio-1.tif");
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe("original-tiff-bytes");
  });

  it("original and master are stored independently (assets-original/ vs assets/)", async () => {
    await saveAssetFile("ex", "folio-1.jpg", new Blob(["master"]));
    await saveOriginalFile("ex", "folio-1.jpg", new Blob(["original"]));
    expect(await blobText((await readAssetBlob("ex", "folio-1.jpg"))!)).toBe("master");
    expect(new TextDecoder().decode((await readOriginalBytes("ex", "folio-1.jpg"))!)).toBe("original");
  });

  it("absent original → null", async () => {
    await expect(readOriginalBytes("ex", "never-saved.tif")).resolves.toBeNull();
  });
});

describe("readPeaks / savePeaks round trip", () => {
  const cache: PeakCache = { v: 1, duration: 12.5, peaks: [[0, 0.5, 1, 0.2]] };

  it("writes then reads back an equal cache", async () => {
    await savePeaks("ex", "track.mp3", cache);
    await expect(readPeaks("ex", "track.mp3")).resolves.toEqual(cache);
  });

  it("absent cache → null (falls back to re-decode)", async () => {
    await expect(readPeaks("ex", "never-decoded.mp3")).resolves.toBeNull();
  });

  it("a corrupt sidecar (invalid JSON) → null, not a throw", async () => {
    seedFile("ex", "assets-peaks", "track.mp3.json", "not json");
    await expect(readPeaks("ex", "track.mp3")).resolves.toBeNull();
  });

  it("a wrong-shape sidecar (missing peaks array) → null", async () => {
    await savePeaks("ex", "track.mp3", { v: 1, duration: 1, peaks: [] } as PeakCache); // empty peaks fails the length>0 guard
    await expect(readPeaks("ex", "track.mp3")).resolves.toBeNull();
  });
});

describe("assetSize", () => {
  it("returns the stored asset's byte length", async () => {
    await saveAssetFile("ex", "folio-1.jpg", new Blob(["12345678"])); // 8 bytes
    await expect(assetSize("ex", "folio-1.jpg")).resolves.toBe(8);
  });

  it("absent asset → 0", async () => {
    await expect(assetSize("ex", "never-saved.jpg")).resolves.toBe(0);
  });

  it("OPFS unsupported → 0", async () => {
    vi.stubGlobal("navigator", {});
    await expect(assetSize("ex", "folio-1.jpg")).resolves.toBe(0);
  });
});
