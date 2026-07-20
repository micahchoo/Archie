// replaceProjectFrom × imported media bytes (the Studio half of the 2026-07-19 round-trip fix):
// opening a published zip/folder must CARRY the source tree's per-exhibit byte dirs (assets/,
// assets-thumb/, assets-original/) into the working store — loadLibrary now recovers `/assets/{name}`
// sources (render-core site.ts), and without the bytes those sources render broken AND the next
// publish exports an assetless zip that still references its images. Store primitives are mocked
// onto capture arrays (same harness idiom as replace-structure.test.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryFilesystem, asExhibitId, asLibraryId, asObjectId } from "@render/core";
import { createIngestFlows, type IngestContext } from "./ingest-flows.js";
import { asClientId } from "@render/core";

const h = vi.hoisted(() => ({
  saved: [] as { kind: "asset" | "thumb" | "original"; slug: string; name: string; text: string }[],
  /** Set to a name to make that asset's save throw (per-item tolerance probe). */
  failAssetName: null as string | null,
}));
vi.mock("./store.js", async (importOriginal) => {
  const record = (kind: "asset" | "thumb" | "original") => async (slug: string, name: string, file: Blob) => {
    if (kind === "asset" && name === h.failAssetName) throw new Error("simulated OPFS write failure");
    h.saved.push({ kind, slug, name, text: await file.text() });
  };
  return {
    ...(await importOriginal<typeof import("./store.js")>()),
    openExhibitAnnotationsDir: async () => null, // annotation persistence is not under test (no OPFS)
    clearExhibitAnnotations: async () => {},
    saveAssetFile: record("asset"),
    saveThumbFile: record("thumb"),
    saveOriginalFile: record("original"),
  };
});

const EX = "shots";

function loadedLib() {
  return {
    library: {
      id: asLibraryId("demo"),
      exhibits: [{ id: asExhibitId(EX), slug: EX, title: "Shots", objects: [{ id: asObjectId("o1"), source: "/assets/photo.png", label: "P", width: 4, height: 4 }] }],
    },
    logs: {},
  };
}

function makeCtx(): IngestContext {
  return {
    baseUrl: "/",
    lib: { meta: { exhibits: [] }, setMeta: () => {}, persist: async () => {} },
    author: () => asClientId("alice"),
    cancelPendingSave: () => {},
    finishReplace: () => {},
  } as unknown as IngestContext;
}

/** A published-tree-shaped source fs: per-exhibit byte dirs under the exhibit slug. */
async function makeSrcFs(files: Record<string, string>): Promise<MemoryFilesystem> {
  const fs = new MemoryFilesystem();
  for (const [path, text] of Object.entries(files)) {
    const segs = path.split("/");
    let dir = await fs.root();
    for (const seg of segs.slice(0, -1)) dir = await dir.getDirectory(seg, { create: true });
    const f = await dir.getFile(segs[segs.length - 1]!, { create: true });
    const w = await f.writable();
    await w.write(text);
    await w.close();
  }
  return fs;
}

beforeEach(() => {
  h.saved = [];
  h.failAssetName = null;
});

describe("replaceProjectFrom — carries incoming media bytes into the working store", () => {
  it("copies assets/, assets-thumb/, and assets-original/ per exhibit", async () => {
    const flows = createIngestFlows(makeCtx());
    const src = await makeSrcFs({
      [`${EX}/assets/photo.png`]: "master-bytes",
      [`${EX}/assets-thumb/photo.png`]: "thumb-bytes",
      [`${EX}/assets-original/IMG_1.heic`]: "original-bytes",
      [`${EX}/manifest.json`]: "{}", // non-byte-dir content must not be touched
    });
    await flows.replaceProjectFrom(loadedLib(), src);
    expect(h.saved).toContainEqual({ kind: "asset", slug: EX, name: "photo.png", text: "master-bytes" });
    expect(h.saved).toContainEqual({ kind: "thumb", slug: EX, name: "photo.png", text: "thumb-bytes" });
    expect(h.saved).toContainEqual({ kind: "original", slug: EX, name: "IMG_1.heic", text: "original-bytes" });
    expect(h.saved).toHaveLength(3);
  });

  it("a source without byte dirs copies nothing and the replace still completes", async () => {
    const flows = createIngestFlows(makeCtx());
    await flows.replaceProjectFrom(loadedLib(), await makeSrcFs({ [`${EX}/manifest.json`]: "{}" }));
    expect(h.saved).toHaveLength(0);
  });

  it("no source fs (legacy caller) copies nothing", async () => {
    const flows = createIngestFlows(makeCtx());
    await flows.replaceProjectFrom(loadedLib());
    expect(h.saved).toHaveLength(0);
  });

  it("one failed write skips-and-continues — it never aborts the rest of the carry", async () => {
    h.failAssetName = "a.png";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const flows = createIngestFlows(makeCtx());
      const src = await makeSrcFs({
        [`${EX}/assets/a.png`]: "will-fail",
        [`${EX}/assets/b.png`]: "survives",
      });
      await flows.replaceProjectFrom(loadedLib(), src);
      expect(h.saved).toContainEqual({ kind: "asset", slug: EX, name: "b.png", text: "survives" });
      expect(h.saved.find((s) => s.name === "a.png")).toBeUndefined();
      expect(warn).toHaveBeenCalled(); // the skip is reported, not silent
    } finally {
      warn.mockRestore();
    }
  });
});
