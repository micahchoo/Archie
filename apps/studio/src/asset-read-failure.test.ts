// The absent-vs-failed distinction at the OPFS asset-read seam (thumbnail audit, bug 5): readAssetFile
// returns null ONLY for genuinely-absent (NotFoundError — how getFileHandle/getDirectoryHandle report a
// missing entry), and throws AssetReadFailedError for everything else (quota, permission, corruption).
// Policy split proven here: the publish reader (readThumbBytes) PROPAGATES the failure so a publish
// can't silently ship without its thumbnails; the display reader (readThumbUrl) degrades to null with a
// console trace (a grid plate is not worth crashing a render wave). Corrupt≠empty rule:
// .claude/rules/render-core-data-integrity.md §2. Fake-OPFS style follows structure-lifecycle's
// handle-tree stub, extended with file handles (node has no real OPFS).
import { describe, it, expect, vi, afterEach } from "vitest";
import { readThumbBytes, readThumbUrl, AssetReadFailedError } from "./store.js";

type FileBehavior = { bytes?: string; failWith?: DOMException };
type DirNode = { dirs: Map<string, DirNode>; files: Map<string, FileBehavior> };

function handleFor(node: DirNode): unknown {
  return {
    getDirectoryHandle: async (name: string, opts?: { create?: boolean }) => {
      let child = node.dirs.get(name);
      if (!child) {
        if (!opts?.create) throw new DOMException(`missing dir ${name}`, "NotFoundError");
        child = { dirs: new Map(), files: new Map() };
        node.dirs.set(name, child);
      }
      return handleFor(child);
    },
    getFileHandle: async (name: string) => {
      const f = node.files.get(name);
      if (!f) throw new DOMException(`missing file ${name}`, "NotFoundError");
      if (f.failWith) throw f.failWith;
      return { getFile: async () => new File([f.bytes ?? ""], name) };
    },
  };
}

/** Seed archie-demo-project/exhibits/{slug}/assets-thumb with the given file behaviors. */
function fakeOpfs(slug: string, files: Record<string, FileBehavior>): void {
  const thumb: DirNode = { dirs: new Map(), files: new Map(Object.entries(files)) };
  const wrap = (name: string, child: DirNode): DirNode => ({ dirs: new Map([[name, child]]), files: new Map() });
  const root = wrap("archie-demo-project", wrap("exhibits", wrap(slug, wrap("assets-thumb", thumb))));
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => handleFor(root) } });
}

afterEach(() => vi.unstubAllGlobals());

describe("readAssetFile absent-vs-failed (via readThumbBytes / readThumbUrl)", () => {
  it("absent file → null (NotFoundError is 'not stored', for both policies)", async () => {
    fakeOpfs("ex", {});
    await expect(readThumbBytes("ex", "a.jpg")).resolves.toBeNull();
    await expect(readThumbUrl("ex", "a.jpg")).resolves.toBeNull();
  });

  it("absent dir chain (exhibit never stored) → null, not a failure", async () => {
    fakeOpfs("other-exhibit", {});
    await expect(readThumbBytes("ex", "a.jpg")).resolves.toBeNull();
  });

  it("OPFS unsupported (no storage API) → null", async () => {
    vi.stubGlobal("navigator", {});
    await expect(readThumbBytes("ex", "a.jpg")).resolves.toBeNull();
  });

  it("stored file reads back through both readers", async () => {
    fakeOpfs("ex", { "a.jpg": { bytes: "jpegbytes" } });
    const blob = await readThumbBytes("ex", "a.jpg");
    expect(await blob!.text()).toBe("jpegbytes");
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake") }); // node env has no createObjectURL
    await expect(readThumbUrl("ex", "a.jpg")).resolves.toBe("blob:fake");
  });

  it("real failure → the PUBLISH reader rejects with AssetReadFailedError (never 'absent')", async () => {
    fakeOpfs("ex", { "a.jpg": { failWith: new DOMException("quota", "QuotaExceededError") } });
    await expect(readThumbBytes("ex", "a.jpg")).rejects.toBeInstanceOf(AssetReadFailedError);
    await expect(readThumbBytes("ex", "a.jpg")).rejects.toThrow(/assets-thumb\/a\.jpg/);
  });

  it("real failure → the DISPLAY reader degrades to null but leaves a console trace", async () => {
    fakeOpfs("ex", { "a.jpg": { failWith: new DOMException("denied", "NotAllowedError") } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(readThumbUrl("ex", "a.jpg")).resolves.toBeNull();
    expect(err).toHaveBeenCalledOnce();
    expect(err.mock.calls[0]![0]).toBeInstanceOf(AssetReadFailedError);
    err.mockRestore();
  });
});
