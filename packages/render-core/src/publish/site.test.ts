import { describe, it, expect } from "vitest";
import { publishLibrary, libraryToZip, loadLibrary } from "./site.js";
import { ZipFilesystem } from "../fs/zip.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { readAnnotations } from "../spine/persist.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import { encodeLinkRef } from "../link/link.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// Publish primitive (CONTEXT: zip-primitive + per-host adapters). Assemble the whole published
// site DATA tree (collection / exhibits.json / per-exhibit manifest + annotations) and export a
// zip. The GH-Pages Contents-API adapter is a thin browser/network layer over this.

const alice = asClientId("alice");
const exA = { id: "exA", slug: "a", title: "Exhibit A", objects: [{ id: "o1", source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }] };
const exB = { id: "exB", slug: "b", title: "Exhibit B", objects: [] };
const library: Library = { id: "lib", title: "Lib", exhibits: [exA, exB] };

const logA: AnnotationLog = appendNew([], { target: "https://img/a.jpg", body: { type: "TextualBody", value: "note" }, lastEditor: alice, modifiedAt: "t", now: 1 }).log;
const logs: Record<string, AnnotationLog> = { exA: logA, exB: [] };
const getLog = (id: string): AnnotationLog => logs[id] ?? [];

describe("publishLibrary — write the full site data tree via the seam", () => {
  it("writes collection.json, exhibits.json, and per-exhibit manifest.json", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, getLog, { baseUrl: "https://u.gh.io/lib/" });
    const root = await fs.root();
    const names: string[] = [];
    for await (const e of root.entries()) names.push(`${e.kind}:${e.name}`);
    expect(names).toContain("file:collection.json");
    expect(names).toContain("file:exhibits.json");
    expect(names).toContain("directory:a");
    expect(names).toContain("directory:b");
    const aDir = await root.getDirectory("a");
    const aNames: string[] = [];
    for await (const e of aDir.entries()) aNames.push(`${e.kind}:${e.name}`);
    expect(aNames).toContain("file:manifest.json");
    expect(aNames).toContain("directory:annotations");
  });

  it("a published exhibit's annotations round-trip back to its log", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, getLog, { baseUrl: "https://u.gh.io/lib/" });
    const annDir = await (await (await fs.root()).getDirectory("a")).getDirectory("annotations");
    const reloaded = await readAnnotations(annDir);
    expect(reloaded.map((r) => r.rev)).toEqual(logA.map((r) => r.rev));
  });

  it("writes imported-asset bytes + rewrites the canvas image URL (P2-X getAsset)", async () => {
    const fs = new MemoryFilesystem();
    const exC = { id: "exC", slug: "c", title: "C", objects: [{ id: "o1", source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await publishLibrary(fs, { id: "lib", exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/", getAsset: async () => bytes });
    const cDir = await (await fs.root()).getDirectory("c");
    // bytes written under the exhibit's assets dir
    const assetFile = await (await cDir.getDirectory("assets")).getFile("photo.jpg");
    expect(new Uint8Array(await assetFile.readable())).toEqual(new Uint8Array([1, 2, 3, 4]));
    // manifest canvas image URL rewritten to the published path (not the bare /assets/ source)
    const manifest = JSON.parse(new TextDecoder().decode(await (await cDir.getFile("manifest.json")).readable()));
    expect(JSON.stringify(manifest)).toContain("https://u.gh.io/lib/c/assets/photo.jpg");
    expect(JSON.stringify(manifest)).not.toContain('"/assets/photo.jpg"');
  });

  it("leaves /assets/ sources untouched when no getAsset is supplied (backward compatible)", async () => {
    const fs = new MemoryFilesystem();
    const exC = { id: "exC", slug: "c", title: "C", objects: [{ id: "o1", source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    await publishLibrary(fs, { id: "lib", exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const cDir = await (await fs.root()).getDirectory("c");
    const manifest = JSON.parse(new TextDecoder().decode(await (await cDir.getFile("manifest.json")).readable()));
    expect(JSON.stringify(manifest)).toContain("/assets/photo.jpg");
  });

  it("publishes a preserved ORIGINAL for citation when getOriginal is supplied (CONTEXT §89.1 opt-in)", async () => {
    const exP = { id: "exP", slug: "p", title: "P", objects: [{ id: "o1", source: "/assets/master.png", label: "Phone photo", width: 4, height: 4, originalName: "IMG_0042.heic" }] };
    const orig = new Uint8Array([9, 8, 7]).buffer;
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, { id: "lib", exhibits: [exP] }, () => [], { baseUrl: "https://u.gh.io/lib/", getOriginal: async () => orig });
    const origFile = await (await (await fs.root()).getDirectory("p")).getDirectory("assets-original").then((d) => d.getFile("IMG_0042.heic"));
    expect(new Uint8Array(await origFile.readable())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("does NOT write originals when getOriginal is absent (opt-in — originals stay in the working store)", async () => {
    const exP = { id: "exP", slug: "p", title: "P", objects: [{ id: "o1", source: "/assets/master.png", label: "Phone photo", width: 4, height: 4, originalName: "IMG_0042.heic" }] };
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, { id: "lib", exhibits: [exP] }, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const pDir = await (await fs.root()).getDirectory("p");
    const names: string[] = [];
    for await (const e of pDir.entries()) names.push(e.name);
    expect(names).not.toContain("assets-original");
  });
});

describe("libraryToZip — the architectural zip primitive", () => {
  it("assembles the whole site into a zip that reopens with the same data", async () => {
    const { zip: bytes } = await libraryToZip(library, getLog, { baseUrl: "https://u.gh.io/lib/" });
    expect(bytes.byteLength).toBeGreaterThan(0);
    const reopened = ZipFilesystem.fromZip(bytes);
    const root = await reopened.root();
    const collection = JSON.parse(new TextDecoder().decode(await (await root.getFile("collection.json")).readable()));
    expect(collection.type).toBe("Collection");
    const exhibits = JSON.parse(new TextDecoder().decode(await (await root.getFile("exhibits.json")).readable()));
    expect(exhibits.exhibits).toHaveLength(2);
    expect(exhibits.schemaVersion).toBeGreaterThanOrEqual(1); // stamped for migratability (§39)
    const manifest = JSON.parse(new TextDecoder().decode(await (await (await root.getDirectory("a")).getFile("manifest.json")).readable()));
    expect(manifest.type).toBe("Manifest");
    expect(manifest.items).toHaveLength(1);
  });
});

describe("loadLibrary — inverse of publishLibrary (publish↔load symmetry)", () => {
  const base = "https://u.gh.io/lib/";
  const lib2: Library = {
    id: "L",
    title: "L Title",
    summary: "L summary",
    exhibits: [{ id: "a", slug: "a", title: "Exhibit A", summary: "about a", objects: [{ id: "o1", source: "https://img/a.jpg", label: "O1", width: 10, height: 8 }] }],
  };
  const canvasA = `${base}a/canvas/o1`;
  const log2: AnnotationLog = appendNew([], { target: { type: "SpecificResource", source: canvasA, selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,3,3" } }, body: { type: "TextualBody", value: "n" }, lastEditor: asClientId("alice"), modifiedAt: "t", now: 1 }).log;

  it("reconstructs the Library structure + reloads each exhibit's log", async () => {
    const { zip } = await libraryToZip(lib2, (id) => (id === "a" ? log2 : []), { baseUrl: base });
    const { library, logs } = await loadLibrary(ZipFilesystem.fromZip(zip));
    expect(library.id).toBe("L");
    expect(library.title).toBe("L Title");
    expect(library.summary).toBe("L summary");
    expect(library.exhibits).toHaveLength(1);
    expect(library.exhibits[0]!.slug).toBe("a");
    expect(library.exhibits[0]!.title).toBe("Exhibit A");
    expect(library.exhibits[0]!.summary).toBe("about a");
    expect(library.exhibits[0]!.objects).toEqual(lib2.exhibits[0]!.objects); // objects recovered from the manifest
    expect(logs["a"]!.map((r) => r.rev)).toEqual(log2.map((r) => r.rev)); // log round-trips
  });
});

describe("intra-Library links — resolved on the heads projection, raw in the canonical history", () => {
  const base = "https://u.gh.io/lib/";
  const canvas = `${base}lk/canvas/o1`;
  const tgt = () => ({ type: "SpecificResource" as const, source: canvas, selector: { type: "FragmentSelector" as const, value: "xywh=pixel:0,0,3,3" } });
  // N2 = the target note; N1 links to it (valid); N3 links to a ghost id (broken).
  const a2 = appendNew([], { target: tgt(), body: { type: "TextualBody", value: "the target" }, lastEditor: alice, modifiedAt: "t", now: 1 });
  const n2id = a2.record.logicalId;
  const a1 = appendNew(a2.log, { target: tgt(), body: { type: "TextualBody", value: `See [the target](${encodeLinkRef({ exhibitSlug: "lk", noteLogicalId: n2id })}).` }, lastEditor: alice, modifiedAt: "t", now: 2 });
  const a3 = appendNew(a1.log, { target: tgt(), body: { type: "TextualBody", value: `A [dead one](${encodeLinkRef({ exhibitSlug: "lk", noteLogicalId: "ghost-id-xyz" as never })}).` }, lastEditor: alice, modifiedAt: "t", now: 3 });
  const lkLog = a3.log;
  const n1id = a1.record.logicalId;
  const n3id = a3.record.logicalId;
  const lkLib: Library = { id: "lib", exhibits: [{ id: "lk", slug: "lk", title: "Linked", objects: [{ id: "o1", source: "https://img/x.jpg", label: "O1", width: 9, height: 9 }] }] };

  const readJson = async (fs: MemoryFilesystem, ...path: string[]) => {
    let dir = await fs.root();
    for (const seg of path.slice(0, -1)) dir = await dir.getDirectory(seg);
    return JSON.parse(new TextDecoder().decode(await (await dir.getFile(path[path.length - 1]!)).readable()));
  };

  it("rewrites a valid ref to its display URL on the heads page, keeps it raw in history, reports the broken one", async () => {
    const fs = new MemoryFilesystem();
    const { brokenLinks } = await publishLibrary(fs, lkLib, (id) => (id === "lk" ? lkLog : []), { baseUrl: base });

    // Heads page (consumer projection): valid ref → resolved URL, no `archie:`; broken → plain text.
    const heads = JSON.stringify(await readJson(fs, "lk", "canvas", "o1", "annotations.json"));
    expect(heads).toContain(`${base}lk/#/a/${n2id}`);
    expect(heads).not.toContain("archie:lk/"); // no raw in-body ref survives (≠ the archie:hasHistory PROV prop)
    expect(heads).toContain("A dead one."); // degraded, no dangling href

    // History sidecar (canonical source for reload): the raw `archie:` ref is PRESERVED.
    const hist = JSON.stringify(await readJson(fs, "lk", "annotations", "history", `${n1id}.json`));
    expect(hist).toContain(`archie:lk/#/a/${n2id}`);

    // Broken link surfaced for a publish-time warning.
    expect(brokenLinks).toEqual([{ exhibitSlug: "lk", logicalId: n3id, target: { exhibitSlug: "lk", noteLogicalId: "ghost-id-xyz" } }]);
  });

  it("loadLibrary round-trips the RAW `archie:` ref (history is the source — guards against a future rewrite-history regression)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, lkLib, (id) => (id === "lk" ? lkLog : []), { baseUrl: base });
    const { logs } = await loadLibrary(fs);
    const hasRawRef = (logs["lk"] ?? []).some((r) => {
      const arr = Array.isArray(r.body) ? r.body : r.body ? [r.body] : [];
      return arr.some((b) => { const v = (b as { value?: unknown }).value; return typeof v === "string" && v.includes("archie:lk/"); });
    });
    expect(hasRawRef).toBe(true); // Open-zip → edit → republish keeps the structured ref auto-updating
  });
});
