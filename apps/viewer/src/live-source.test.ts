// live-source.test.ts — Archie-cebf: the end-to-end LIVE (OPFS) source harness.
//
// The live path (`initLiveSource`) is reached ONLY through `navigator.storage.getDirectory()` —
// the OPFS-backed Studio working store — and nothing in this suite could stand that up, which is
// exactly why Archie-f34b (a live exhibit's cover 404'd against the published root) shipped
// unnoticed. This file closes the gap: a fake OPFS root (fake-opfs.ts — FSA-handle shape over a
// MemoryFilesystem) holds a minimal Studio working-store layout, `initLiveSource` reads it through
// the REAL loadWorkingLibrary → FsaFilesystem seam, projects it with the REAL publishLibrary, and
// `loadGallery` must hand back a live card whose tree-relative cover was rewritten to a loadable
// blob URL (Archie-f34b's fix — the assertion that goes red when that rewrite is reverted).
import { describe, it, expect, afterEach, vi } from "vitest";
import { WORKING_PROJECT } from "@render/core";
import { fakeOpfsRoot } from "./fake-opfs.js";
import { initLiveSource, loadGallery } from "./published.js";

// Real-looking JPEG magic bytes — a non-zero byte length the blob-URL stub records, so the
// assertion proves the cover mints over the actual thumbnail bytes, not an empty Blob.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;

// The minimal Studio working-store layout loadWorkingLibrary consumes (apps/studio/src/store.ts
// is the writer; publish/working.ts owns the FORMAT): one exhibit, one imported asset with a
// baked thumbnail — enough for publishLibrary to derive a tree-relative cover
// (`{slug}/assets-thumb/{name}`) and copy both byte sets into the projected tree.
const WORKING_STORE = {
  [`${WORKING_PROJECT}/library.json`]: JSON.stringify({
    title: "Working copy",
    exhibits: [{
      id: "ex-live-1",
      slug: "mine",
      title: "Local exhibit",
      objects: [{
        id: "obj-1",
        source: "/assets/photo.jpg",
        label: "Photo",
        width: 2,
        height: 1,
        thumbnail: "/assets-thumb/photo.jpg",
      }],
    }],
  }),
  [`${WORKING_PROJECT}/exhibits/mine/assets/photo.jpg`]: JPEG,
  [`${WORKING_PROJECT}/exhibits/mine/assets-thumb/photo.jpg`]: JPEG,
};

describe("initLiveSource end to end over a faked OPFS (Archie-cebf)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a live exhibit joins the hall AND its cover is loadable (a blob URL over real bytes)", async () => {
    vi.stubGlobal("navigator", { storage: { getDirectory: async () => fakeOpfsRoot(WORKING_STORE) } });
    // The hosted tree is absent — a live-only author before any publish: every hosted read 404s,
    // so the live projection carries the hall alone. loadGallery's marker gate fetches
    // `${PUBLISHED}/archie.json` BEFORE the hosted try/catch, so the stub must cover it too
    // (lenient-on-absent → null marker).
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    // Node has no createObjectURL — mint deterministic pseudo-URLs carrying the byte count
    // (live-thumbnails.test.ts stubs the same way for the rule-level test of treeAssetBlobUrl).
    const created: Array<{ url: string; size: number }> = [];
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = (b: Blob) => {
        const url = `blob:live/${created.length}`;
        created.push({ url, size: b.size });
        return url;
      };
      static revokeObjectURL = () => {};
    });
    // initLiveSource catch-alls every error into console.warn + `return false` (published.ts) —
    // a wrong fixture is otherwise indistinguishable from "no OPFS on this browser". The probe
    // must succeed loudly AND quietly: true, and not a single warning fired.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await initLiveSource()).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    const gallery = await loadGallery();
    const card = gallery.exhibits.find((e) => e.slug === "mine");
    expect(card, "the live exhibit joins the hall").toBeDefined();
    expect(card!.title).toBe("Local exhibit");
    // Archie-f34b: the tree-relative ref must never reach publishedAssetUrl — it is rewritten to
    // a blob URL over the in-memory tree before the card reaches the gallery.
    expect(card!.cover, "cover rewritten onto a blob URL").toMatch(/^blob:/);
    expect(created).toEqual([{ url: expect.stringMatching(/^blob:/), size: JPEG.byteLength }]);
  });
});
