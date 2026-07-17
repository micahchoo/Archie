// PROBE (Issues 23/24/25) — characterizes CURRENT behavior of the read-policy + staleness seams so the
// ledger "actual" columns are evidence-backed, not asserted from a code read. These tests document the
// bug; they are updated to the FIXED expectation as each row lands (retest column).
import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { fsJsonSource, readExhibitTree, type JsonSource } from "./read.js";
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
  it("CORRUPT (torn) file → does it distinguish from absent?", async () => {
    const fs = new MemoryFilesystem();
    await writeRaw(fs, "torn.json", "{not valid json");
    const result = await fsJsonSource(fs).getOptional("torn.json").then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    console.log("[PROBE] fsJsonSource.getOptional torn:", result.ok ? `returned ${JSON.stringify(result.v)}` : `threw ${String(result.e)}`);
    expect(result).toBeDefined();
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
  it("a TORN manifest.json — buildImageIndex behavior", async () => {
    const fs = new MemoryFilesystem();
    const lib = libWith(["a", "b"]);
    await publishLibrary(fs, lib, () => [], { baseUrl: base });
    await writeRaw(fs, "b/manifest.json", "{ torn");
    const r = await buildImageIndex(fs, lib).then(
      (idx) => ({ ok: true as const, slugs: idx.images.map((e) => e.exhibitSlug) }),
      (e) => ({ ok: false as const, e: String(e) }),
    );
    console.log("[PROBE] buildImageIndex torn manifest:", JSON.stringify(r));
    expect(r).toBeDefined();
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

  it("base-annotations sidecar 404 (bare-ref manifest) — does the whole exhibit die? (read.ts:82 src.get)", async () => {
    const inner = fsJsonSource(await publishedFs());
    const manifest = await inner.get<{ items: { annotations?: { id: string; items?: unknown }[] }[] }>("rd/manifest.json");
    for (const c of manifest.items) for (const ap of c.annotations ?? []) if (/\/annotations\.json$/.test(ap.id)) delete ap.items; // strip inline base → force sidecar fetch
    const src: JsonSource = {
      get: async <T>(p: string): Promise<T> => {
        if (p.endsWith("manifest.json")) return manifest as T;
        if (/\/annotations\.json$/.test(p)) throw new Error("HTTP 500 / 404 on base sidecar");
        return inner.get<T>(p);
      },
      getOptional: inner.getOptional,
    };
    const r = await readExhibitTree(src, "rd").then((ex) => ({ ok: true as const, n: ex.annotationsByObject.o1?.length }), (e) => ({ ok: false as const, e: String(e) }));
    console.log("[PROBE] readExhibitTree base-sidecar-fail:", JSON.stringify(r));
    expect(r).toBeDefined();
  });

  it("readings.json failure indistinguishable from absent → readings:[] with NO partial signal (read.ts:64)", async () => {
    const inner = fsJsonSource(await publishedFs());
    // current HTTP getOptional swallows a 5xx to null — model that: readings.json → null (as if failed).
    const src: JsonSource = {
      get: inner.get,
      getOptional: async <T>(p: string): Promise<T | null> => (/readings\.json$/.test(p) ? null : inner.getOptional<T>(p)),
    };
    const ex = await readExhibitTree(src, "rd");
    console.log("[PROBE] readExhibitTree readings-failed:", JSON.stringify({ readings: ex.readings.length, incomplete: (ex as { incomplete?: unknown }).incomplete }));
    expect(ex.readings.length).toBe(0); // failed read silently rendered as "no readings"
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
