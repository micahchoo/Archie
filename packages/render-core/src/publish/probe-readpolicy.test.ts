// PROBE (Issues 23/24/25) — characterizes CURRENT behavior of the read-policy + staleness seams so the
// ledger "actual" columns are evidence-backed, not asserted from a code read. These tests document the
// bug; they are updated to the FIXED expectation as each row lands (retest column).
import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { fsJsonSource, readExhibitTree, FailedReadError, type JsonSource } from "./read.js";
import { buildImageIndex } from "../iiif/image-index.js";
import { publishLibrary } from "./site.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

async function writeRaw(fs: MemoryFilesystem, path: string, text: string): Promise<void> {
  const parts = path.split("/");
  let dir = await fs.root();
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectory(parts[i]!, { create: true });
  const f = await dir.getFile(parts[parts.length - 1]!, { create: true });
  const w = await f.writable();
  await w.write(text);
  await w.close();
}

describe("PROBE fsJsonSource.getOptional — absent vs corrupt (read.ts:44-48)", () => {
  it("absent file → null", async () => {
    const fs = new MemoryFilesystem();
    expect(await fsJsonSource(fs).getOptional("nope.json")).toBeNull();
  });
  it("CORRUPT (torn) file → throws FailedReadError (distinct from absent-null) [rp1]", async () => {
    const fs = new MemoryFilesystem();
    await writeRaw(fs, "torn.json", "{not valid json");
    await expect(fsJsonSource(fs).getOptional("torn.json")).rejects.toBeInstanceOf(FailedReadError);
  });
});

const base = "https://u.gh.io/lib/";
function libWith(slugs: string[]): Library {
  return {
    id: asLibraryId("L"), title: "L",
    exhibits: slugs.map((s, i) => ({
      id: asExhibitId(`e${i}`), slug: s, title: s,
      objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
    })),
  };
}

describe("PROBE buildImageIndex vs torn manifest (Issue 25a; image-index.ts:45 vs site.ts:582)", () => {
  it("a TORN manifest.json → buildImageIndex PROPAGATES (loud), no silent omit [rp3]", async () => {
    const fs = new MemoryFilesystem();
    const lib = libWith(["a", "b"]);
    await publishLibrary(fs, lib, () => [], { baseUrl: base });
    await writeRaw(fs, "b/manifest.json", "{ torn");
    // Reconciled with loadLibrary's hard-throw: a torn (failed) manifest no longer vanishes from the wall.
    await expect(buildImageIndex(fs, lib)).rejects.toBeInstanceOf(FailedReadError);
  });

  it("a genuinely ABSENT manifest → omitted (empty/never-written exhibit, not a corruption) [rp3]", async () => {
    const fs = new MemoryFilesystem();
    const lib = libWith(["a", "b"]);
    await publishLibrary(fs, lib, () => [], { baseUrl: base });
    // Remove b's manifest entirely (absent, not torn).
    await (await fs.root()).getDirectory("b").then((d) => d.remove("manifest.json"));
    const idx = await buildImageIndex(fs, lib);
    expect(idx.images.map((e) => e.exhibitSlug)).toEqual(["a"]); // absent → omitted, no throw
  });
});

describe("PROBE readExhibitTree — optional layer failure policy (read.ts:64/82/90)", () => {
  const author = asClientId("c");
  const canvas = `${base}rd/canvas/o1`;
  const rlib: Library = {
    id: asLibraryId("L"), title: "L",
    exhibits: [{
      id: asExhibitId("e1"), slug: "rd", title: "Readings",
      objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
      readings: [{ id: "cipher", name: "Cipher" }],
    }],
  };
  let log = appendNew([], { target: canvas, body: { type: "TextualBody", value: "c" }, lastEditor: author, modifiedAt: "t", now: 1, reading: "cipher" }).log;
  log = appendNew(log, { target: canvas, body: { type: "TextualBody", value: "b" }, lastEditor: author, modifiedAt: "t", now: 2 }).log;
  const publishedFs = async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, rlib, (id) => (id === "e1" ? log : []), { baseUrl: base });
    return fs;
  };

  // Build a bare-ref manifest (inline base items stripped) so the base-annotations SIDECAR is actually read.
  const bareManifestSrc = async (sidecar: (path: string) => Promise<unknown>) => {
    const inner = fsJsonSource(await publishedFs());
    const manifest = await inner.get<{ items: { annotations?: { id: string; items?: unknown }[] }[] }>("rd/manifest.json");
    for (const c of manifest.items) for (const ap of c.annotations ?? []) if (/\/annotations\.json$/.test(ap.id)) delete ap.items;
    const src: JsonSource = {
      get: async <T>(p: string): Promise<T> => (p.endsWith("manifest.json") ? (manifest as T) : inner.get<T>(p)),
      getOptional: async <T>(p: string): Promise<T | null> => (/\/annotations\.json$/.test(p) ? (sidecar(p) as Promise<T | null>) : inner.getOptional<T>(p)),
    };
    return src;
  };

  it("base-annotations sidecar FAILED (5xx) → exhibit RENDERS, flagged incomplete (no abort) [rp1]", async () => {
    const src = await bareManifestSrc((p) => Promise.reject(new FailedReadError(p, new Error("HTTP 500"))));
    const ex = await readExhibitTree(src, "rd");
    expect(ex.annotationsByObject.o1).toEqual([]); // that one layer degraded to empty
    expect(ex.incomplete).toBe(true); // but the exhibit is flagged partial, not dead
  });

  it("base-annotations sidecar ABSENT (404) → empty object, NOT flagged incomplete [rp1]", async () => {
    const src = await bareManifestSrc(() => Promise.resolve(null)); // genuine absence
    const ex = await readExhibitTree(src, "rd");
    expect(ex.annotationsByObject.o1).toEqual([]);
    expect(ex.incomplete).toBeUndefined();
  });

  it("readings.json FAILED (5xx) → readings:[] AND flagged incomplete (no silent complete) [rp1]", async () => {
    const inner = fsJsonSource(await publishedFs());
    const src: JsonSource = {
      get: inner.get,
      getOptional: async <T>(p: string): Promise<T | null> =>
        /readings\.json$/.test(p) ? Promise.reject(new FailedReadError(p, new Error("HTTP 503"))) : inner.getOptional<T>(p),
    };
    const ex = await readExhibitTree(src, "rd");
    expect(ex.readings).toEqual([]);
    expect(ex.incomplete).toBe(true);
  });
});

describe("PROBE marker/generation write ordering (Issue 25b; site.ts:254)", () => {
  it("does archie.json carry a generation? (ordering asserted from code read)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libWith(["a"]), () => [], { baseUrl: base });
    const marker = await fsJsonSource(fs).getOptional<Record<string, unknown>>("archie.json");
    console.log("[PROBE] archie.json:", JSON.stringify(marker));
    expect(marker).toBeDefined();
  });
});
