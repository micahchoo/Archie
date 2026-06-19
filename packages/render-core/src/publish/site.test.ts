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

  it("accepts a Blob (not only ArrayBuffer) from getAsset and writes it identically (A.3 OPFS→sink stream)", async () => {
    // A.3 (#5): getAsset returns a lazy OPFS File (a Blob) instead of an eager ArrayBuffer, so the FSA
    // folder backend can stream it to disk without ever holding the full bytes in the JS heap. The seam
    // must treat a Blob return identically to an ArrayBuffer — this pins that contract headlessly. (The
    // streaming peak-reduction itself is FSA-only, browser-verified.)
    const fs = new MemoryFilesystem();
    const exC = { id: "exC", slug: "c", title: "C", objects: [{ id: "o1", source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    const blob = new Blob([new Uint8Array([9, 8, 7, 6])]);
    await publishLibrary(fs, { id: "lib", exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/", getAsset: async () => blob });
    const cDir = await (await fs.root()).getDirectory("c");
    const assetFile = await (await cDir.getDirectory("assets")).getFile("photo.jpg");
    expect(new Uint8Array(await assetFile.readable())).toEqual(new Uint8Array([9, 8, 7, 6]));
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
  const viewer = "https://u.gh.io/lib/viewer/"; // the canonical Viewer (Studio always supplies this at publish)
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
    const { brokenLinks } = await publishLibrary(fs, lkLib, (id) => (id === "lk" ? lkLog : []), { baseUrl: base, viewerBase: viewer });

    // Heads page (consumer projection): valid ref → resolved URL, no `archie:`; broken → plain text.
    const heads = JSON.stringify(await readJson(fs, "lk", "canvas", "o1", "annotations.json"));
    expect(heads).toContain(`${viewer}#/lk/a/${n2id}`); // corrected grammar: slug-qualified viewer route (was the dead {slug}/#/a/<id> the router dropped)
    expect(heads).not.toContain("archie:lk/"); // no raw in-body ref survives (≠ the archie:hasHistory PROV prop)
    expect(heads).toContain("A dead one."); // degraded, no dangling href

    // History sidecar (canonical source for reload): the raw `archie:` ref is PRESERVED.
    const hist = JSON.stringify(await readJson(fs, "lk", "annotations", "history", `${n1id}.json`));
    expect(hist).toContain(`archie:lk/#/a/${n2id}`);

    // Broken link surfaced for a publish-time warning.
    expect(brokenLinks).toEqual([{ exhibitSlug: "lk", logicalId: n3id, target: { exhibitSlug: "lk", noteLogicalId: "ghost-id-xyz" } }]);
  });

  it("rewrites `archie:` cites in SECTION prose too (manifest Range summary), degrading broken ones", async () => {
    // Regression: previously ONLY note bodies were rewritten, so a cite in Narrative section prose
    // shipped a raw `archie:` ref the Viewer rendered as dead text. Cite n1 (valid) to isolate the
    // section rewrite from the note-body cites of n2; ghost degrades to plain text + a broken report.
    const secLib: Library = {
      id: "lib",
      exhibits: [{
        id: "lk", slug: "lk", title: "Linked",
        objects: [{ id: "o1", source: "https://img/x.jpg", label: "O1", width: 9, height: 9 }],
        layout: "narrative",
        sections: [{
          id: "sec-1", title: "Intro", objectId: "o1",
          prose: `Compare [note one](${encodeLinkRef({ exhibitSlug: "lk", noteLogicalId: n1id })}) and [a ghost](${encodeLinkRef({ exhibitSlug: "lk", noteLogicalId: "ghost-id-xyz" as never })}).`,
        }],
      }],
    };
    const fs = new MemoryFilesystem();
    const { brokenLinks } = await publishLibrary(fs, secLib, (id) => (id === "lk" ? lkLog : []), { baseUrl: base, viewerBase: viewer });
    const manifest = JSON.stringify(await readJson(fs, "lk", "manifest.json"));
    expect(manifest).toContain(`${viewer}#/lk/a/${n1id}`); // section cite resolved to the live viewer route
    expect(manifest).not.toContain("archie:lk/");           // no raw ref shipped into the manifest summary
    expect(manifest).toContain("a ghost");                   // broken section cite degraded to plain text
    expect(brokenLinks).toContainEqual({ exhibitSlug: "lk", logicalId: "sec-1", target: { exhibitSlug: "lk", noteLogicalId: "ghost-id-xyz" } });
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

describe("publishLibrary — Readings emit per-reading AnnotationPages + collections (Phase 2, ADR-0007)", () => {
  const rbase = "https://u.gh.io/lib/";
  const rCanvas = `${rbase}v/canvas/o1`;
  const exV = {
    id: "exV",
    slug: "v",
    title: "Voynich",
    objects: [{ id: "o1", source: "https://img/v.jpg", label: "f1", width: 10, height: 10 }],
    readings: [
      { id: "cipher", name: "Cipher", description: "an enciphered natural language" },
      { id: "hoax", name: "Hoax" },
    ],
  };
  const libV: Library = { id: "lib", exhibits: [exV] };
  // A cipher note ON the canvas; hoax has NO note on o1 (→ an empty hoax page must still be emitted).
  const logV: AnnotationLog = appendNew([], { target: rCanvas, body: { type: "TextualBody", value: "noun-phrase" }, reading: "cipher", lastEditor: alice, modifiedAt: "t", now: 1 }).log;

  const readJson = async (fs: MemoryFilesystem, ...path: string[]) => {
    let dir = await fs.root();
    for (let i = 0; i < path.length - 1; i++) dir = await dir.getDirectory(path[i]!);
    return JSON.parse(new TextDecoder().decode(await (await dir.getFile(path[path.length - 1]!)).readable()));
  };

  it("manifest lists base + a page per reading; cipher page carries the note + partOf; hoax page empty; collection emitted", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libV, (id) => (id === "exV" ? logV : []), { baseUrl: rbase });

    const manifest = await readJson(fs, "v", "manifest.json");
    expect(manifest.items[0].annotations.map((a: { id: string }) => a.id)).toEqual([
      `${rCanvas}/annotations.json`,
      `${rCanvas}/annotations-cipher.json`,
      `${rCanvas}/annotations-hoax.json`,
    ]);
    // Pages are embedded inline (items) and named inline (label) so a pure IIIF viewer renders +
    // labels the toggles and groups by partOf id WITHOUT fetching any sidecar / AnnotationCollection.
    const refs = manifest.items[0].annotations as Array<{ label?: { none?: string[] }; items?: unknown[]; partOf?: Array<{ id: string; type: string }> }>;
    const baseRef = refs[0]!, cipherRef = refs[1]!;
    expect(baseRef.label?.none?.[0]).toBe("Base");
    expect(cipherRef.label?.none?.[0]).toBe("Cipher");
    expect(cipherRef.items).toHaveLength(1);
    expect(cipherRef.partOf).toEqual([{ id: `${rbase}v/annotations/readings/cipher.json`, type: "AnnotationCollection" }]);

    const cipher = await readJson(fs, "v", "canvas", "o1", "annotations-cipher.json");
    expect(cipher.items).toHaveLength(1);
    expect(cipher.partOf).toEqual([{ id: `${rbase}v/annotations/readings/cipher.json`, type: "AnnotationCollection" }]);

    const hoax = await readJson(fs, "v", "canvas", "o1", "annotations-hoax.json");
    expect(hoax.items).toHaveLength(0); // empty page so the manifest ref resolves
    expect(hoax.partOf).toEqual([{ id: `${rbase}v/annotations/readings/hoax.json`, type: "AnnotationCollection" }]);

    const base = await readJson(fs, "v", "canvas", "o1", "annotations.json");
    expect(base.items).toHaveLength(0); // the only note went to the cipher reading
    expect(base.partOf).toBeUndefined();

    const coll = await readJson(fs, "v", "annotations", "readings", "cipher.json");
    expect(coll.type).toBe("AnnotationCollection");
    expect(coll.label.en[0]).toBe("Cipher");
  });
});
