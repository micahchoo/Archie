import { describe, it, expect } from "vitest";
import { publishLibrary, libraryToZip, loadLibrary } from "./site.js";
import { collectFiles } from "./ghpages.js";
import { objectsFromManifest } from "../iiif/manifest.js";
import type { DziTileSource } from "../iiif/resolve.js";
import { ZipFilesystem } from "../fs/zip.js";
import { MemoryFilesystem } from "../fs/memory.js";
import type { Filesystem, FsDirectory, FsFile, FsWritable } from "../fs/seam.js";
import { readAnnotations } from "../spine/persist.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import { encodeLinkRef } from "../link/link.js";
import type { AObject, Library } from "../model/model.js";
import type { AnnotationLog } from "../wadm/types.js";

// Publish primitive (CONTEXT: zip-primitive + per-host adapters). Assemble the whole published
// site DATA tree (collection / exhibits.json / per-exhibit manifest + annotations) and export a
// zip. The GH-Pages Contents-API adapter is a thin browser/network layer over this.

const alice = asClientId("alice");
const exA = { id: asExhibitId("exA"), slug: "a", title: "Exhibit A", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }] };
const exB = { id: asExhibitId("exB"), slug: "b", title: "Exhibit B", objects: [] };
const library: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exA, exB] };

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
    const exC = { id: asExhibitId("exC"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/", getAsset: async () => bytes });
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
    const exC = { id: asExhibitId("exC"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    const blob = new Blob([new Uint8Array([9, 8, 7, 6])]);
    await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/", getAsset: async () => blob });
    const cDir = await (await fs.root()).getDirectory("c");
    const assetFile = await (await cDir.getDirectory("assets")).getFile("photo.jpg");
    expect(new Uint8Array(await assetFile.readable())).toEqual(new Uint8Array([9, 8, 7, 6]));
  });

  it("reports an /assets/ object whose bytes getAsset can't produce (missingAssets — no silent dangling source)", async () => {
    // The 2026-07-19 assetless-export shape: getAsset IS wired but the store has no bytes for the
    // name (an imported library whose assets never landed). The manifest keeps the raw source
    // (nothing better to write), but the publisher must HEAR about it instead of shipping a zip
    // that silently references images it doesn't contain.
    const fs = new MemoryFilesystem();
    const exC = { id: asExhibitId("exC"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    const { missingAssets } = await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/", getAsset: async () => null });
    expect(missingAssets).toEqual([{ exhibitSlug: "c", objectId: "o1", name: "photo.jpg" }]);
  });

  it("leaves /assets/ sources untouched when no getAsset is supplied (backward compatible)", async () => {
    const fs = new MemoryFilesystem();
    const exC = { id: asExhibitId("exC"), slug: "c", title: "C", objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "Imported", width: 4, height: 4 }] };
    await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exC] }, () => [], { baseUrl: "https://u.gh.io/lib/" });
    const cDir = await (await fs.root()).getDirectory("c");
    const manifest = JSON.parse(new TextDecoder().decode(await (await cDir.getFile("manifest.json")).readable()));
    expect(JSON.stringify(manifest)).toContain("/assets/photo.jpg");
  });

  it("publishes a preserved ORIGINAL for citation when getOriginal is supplied (CONTEXT §89.1 opt-in)", async () => {
    const exP = { id: asExhibitId("exP"), slug: "p", title: "P", objects: [{ id: asObjectId("o1"), source: "/assets/master.png", label: "Phone photo", width: 4, height: 4, originalName: "IMG_0042.heic" }] };
    const orig = new Uint8Array([9, 8, 7]).buffer;
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exP] }, () => [], { baseUrl: "https://u.gh.io/lib/", getOriginal: async () => orig });
    const origFile = await (await (await fs.root()).getDirectory("p")).getDirectory("assets-original").then((d) => d.getFile("IMG_0042.heic"));
    expect(new Uint8Array(await origFile.readable())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("does NOT write originals when getOriginal is absent (opt-in — originals stay in the working store)", async () => {
    const exP = { id: asExhibitId("exP"), slug: "p", title: "P", objects: [{ id: asObjectId("o1"), source: "/assets/master.png", label: "Phone photo", width: 4, height: 4, originalName: "IMG_0042.heic" }] };
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, { id: asLibraryId("lib"), exhibits: [exP] }, () => [], { baseUrl: "https://u.gh.io/lib/" });
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
    id: asLibraryId("L"),
    title: "L Title",
    summary: "L summary",
    exhibits: [{ id: asExhibitId("a"), slug: "a", title: "Exhibit A", summary: "about a", objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "O1", width: 10, height: 8 }] }],
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

  // Archie-bdc0: the UNLISTED lever must survive publish→loadLibrary. publishLibrary emits it onto the
  // exhibits.json card (toExhibitsJson), and loadLibrary reads it back onto the recovered `Exhibit` — so a
  // dropped-zip regen (or a Studio import) keeps a hidden exhibit hidden. Default (absent) recovers LISTED.
  it("round-trips the UNLISTED lever onto the recovered Exhibit (absent = listed)", async () => {
    const libU: Library = {
      id: asLibraryId("U"),
      exhibits: [
        { id: asExhibitId("shown"), slug: "shown", title: "Shown", objects: [] },
        { id: asExhibitId("hidden"), slug: "hidden", title: "Hidden", unlisted: true, objects: [] },
      ],
    };
    const { zip } = await libraryToZip(libU, () => [], { baseUrl: base });
    const { library } = await loadLibrary(ZipFilesystem.fromZip(zip));
    const byslug = Object.fromEntries(library.exhibits.map((e) => [e.slug, e]));
    expect("unlisted" in byslug["shown"]!).toBe(false); // listed exhibit recovers no flag
    expect(byslug["hidden"]!.unlisted).toBe(true); // hidden exhibit stays hidden across the round trip
  });

  // tend ISSUES.md Issue 9 (showroom assembly): loadLibrary silently dropped BOTH sections and
  // readings on every round trip — a narrative exhibit's Ranges vanished, and every reading-scoped
  // note's per-reading annotation page went with it (toCanvas gates that split on the reading-id
  // list, which came from the now-missing `exhibit.readings`). Exposed by gen-published.mts
  // regenerating a dropped zip: a real narrative exhibit's spine disappeared on every dev-server run.
  it("recovers sections and readings, not just objects", async () => {
    const libN: Library = {
      id: asLibraryId("N"),
      exhibits: [{
        id: asExhibitId("n"), slug: "n", title: "Narrative Exhibit",
        objects: [
          { id: asObjectId("o1"), source: "https://img/1.jpg", label: "O1", width: 10, height: 10 },
          { id: asObjectId("o2"), source: "https://img/2.jpg", label: "O2", width: 10, height: 10 },
        ],
        sections: [{ id: "sec-1", title: "First", objectId: "o1", prose: "About o1." }],
        readings: [{ id: "r1", name: "Reading One", colour: "#123456" }],
      }],
    };
    const canvas1 = `${base}n/canvas/o1`;
    const logN: AnnotationLog = appendNew([], {
      target: { type: "SpecificResource", source: canvas1, selector: { type: "FragmentSelector", value: "xywh=pixel:0,0,3,3" } },
      body: { type: "TextualBody", value: "n1" }, reading: "r1", lastEditor: asClientId("alice"), modifiedAt: "t", now: 1,
    }).log;
    const { zip } = await libraryToZip(libN, (id) => (id === "n" ? logN : []), { baseUrl: base });
    const { library } = await loadLibrary(ZipFilesystem.fromZip(zip));
    expect(library.exhibits[0]!.sections).toEqual(libN.exhibits[0]!.sections);
    expect(library.exhibits[0]!.readings).toEqual(libN.exhibits[0]!.readings);
  });

  // The publish→import→re-publish asset round trip (2026-07-19): publish bakes `/assets/{name}`
  // sources to `{base}{slug}/assets/{name}`, but loadLibrary handed that ABSOLUTE URL back, so a
  // re-publish saw no ASSET_PREFIX match, copied no bytes, and silently emitted an assetless zip
  // whose manifests still referenced the images. loadLibrary must invert the publish-time asset
  // rewrite — recover `/assets/{name}` (and drop the publish-derived tileSource/thumbnail
  // projections, which the next publish re-derives) — whenever the bytes are actually in the tree.
  it("recovers /assets/ sources (and strips publish projections) so a re-publish keeps the bytes", async () => {
    const assetBytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const dzi: DziTileSource = { kind: "dzi", width: 8, height: 8, tileSize: 254, overlap: 1, format: "image/jpeg", filesPath: "photo.jpg_files" };
    const libA: Library = {
      id: asLibraryId("R"),
      exhibits: [{ id: asExhibitId("r"), slug: "r", title: "R", objects: [{ id: asObjectId("o1"), source: "/assets/photo.jpg", label: "P", width: 8, height: 8, thumbnail: "/assets-thumb/photo.jpg" }] }],
    };
    const { zip } = await libraryToZip(libA, () => [], {
      baseUrl: base,
      getAsset: async () => assetBytes,
      getThumbnail: async () => new Uint8Array([5, 6]).buffer,
      tileObject: async () => ({ descriptor: dzi, tiles: new Map([["0/0_0.jpg", new Blob([new Uint8Array([9])])]]) }),
    });
    const { library } = await loadLibrary(ZipFilesystem.fromZip(zip));
    const o = library.exhibits[0]!.objects[0]!;
    expect(o.source).toBe("/assets/photo.jpg"); // recovered working form, not the baked absolute URL
    expect(o.tileSource).toBeUndefined(); // publish projection — re-derived by the next publish's tileObject
    expect(o.thumbnail).toBeUndefined(); // idem via getThumbnail
    // The full round trip: re-publish the LOADED library, feeding bytes from the loaded tree (the
    // gen-published / Studio-import wiring) — the second tree must carry the asset bytes again.
    const srcRoot = await ZipFilesystem.fromZip(zip).root();
    const { zip: zip2 } = await libraryToZip(library, () => [], {
      baseUrl: base,
      getAsset: async (slug, name) => {
        try { return await (await (await (await srcRoot.getDirectory(slug)).getDirectory("assets")).getFile(name)).readable(); } catch { return null; }
      },
    });
    const root2 = await ZipFilesystem.fromZip(zip2).root();
    const copied = await (await (await (await root2.getDirectory("r")).getDirectory("assets")).getFile("photo.jpg")).readable();
    expect(new Uint8Array(copied)).toEqual(new Uint8Array(assetBytes));
  });

  it("leaves an absolute self-asset source untouched when the tree lacks the bytes (defective export)", async () => {
    // Today's failure shape: a zip whose manifest references {base}{slug}/assets/… with NO assets
    // dir (an assetless export). Rewriting to /assets/ would turn a working remote URL into a dead
    // relative pointer — the source must stay absolute.
    const src = `${base}d/assets/photo.jpg`;
    const libD: Library = {
      id: asLibraryId("D"),
      exhibits: [{ id: asExhibitId("d"), slug: "d", title: "D", objects: [{ id: asObjectId("o1"), source: src, label: "P", width: 8, height: 8 }] }],
    };
    const { zip } = await libraryToZip(libD, () => [], { baseUrl: base }); // no getAsset — external-source path, no bytes written
    const { library } = await loadLibrary(ZipFilesystem.fromZip(zip));
    expect(library.exhibits[0]!.objects[0]!.source).toBe(src);
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
  const lkLib: Library = { id: asLibraryId("lib"), exhibits: [{ id: asExhibitId("lk"), slug: "lk", title: "Linked", objects: [{ id: asObjectId("o1"), source: "https://img/x.jpg", label: "O1", width: 9, height: 9 }] }] };

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
      id: asLibraryId("lib"),
      exhibits: [{
        id: asExhibitId("lk"), slug: "lk", title: "Linked",
        objects: [{ id: asObjectId("o1"), source: "https://img/x.jpg", label: "O1", width: 9, height: 9 }],
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
    id: asExhibitId("exV"),
    slug: "v",
    title: "Voynich",
    objects: [{ id: asObjectId("o1"), source: "https://img/v.jpg", label: "f1", width: 10, height: 10 }],
    readings: [
      { id: "cipher", name: "Cipher", description: "an enciphered natural language" },
      { id: "hoax", name: "Hoax" },
    ],
  };
  const libV: Library = { id: asLibraryId("lib"), exhibits: [exV] };
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

describe("publishLibrary — incompleteCanvases (IIIF Pres 3 §5.3 dimensions advisory)", () => {
  it("reports an Image object published with no width/height, alongside a normal exhibit that reports none", async () => {
    const gapLib: Library = {
      id: asLibraryId("lib"),
      exhibits: [
        { id: asExhibitId("gap"), slug: "gap", title: "Gap", objects: [{ id: asObjectId("no-dims"), source: "https://img/broken.jpg", label: "Undimensioned" }] },
        exA, // has width/height — contributes no rows
      ],
    };
    const fs = new MemoryFilesystem();
    const { incompleteCanvases } = await publishLibrary(fs, gapLib, getLog, { baseUrl: "https://u.gh.io/lib/" });
    expect(incompleteCanvases).toEqual([{ exhibitSlug: "gap", canvasId: "https://u.gh.io/lib/gap/canvas/no-dims", label: "Undimensioned" }]);
  });
});

// Incremental folder-autosave scope (spike-0002 / SCALE-GALLERY Phase 1.1). A note edit must rewrite ONLY
// the touched exhibit's JSON and MUST NOT re-copy assets or re-slice DZI tiles; removals must prune orphans.
describe("publishLibrary — incremental scope (spike-0002)", () => {
  const INC_BASE = "https://u/lib/";
  const descriptor: DziTileSource = { kind: "dzi", width: 8000, height: 6000, tileSize: 254, overlap: 1, format: "image/jpeg", filesPath: "photo.jpg_files" };
  const assetBytes = new Uint8Array([1, 2, 3, 4]).buffer;
  const thumbBytes = new Uint8Array([5, 6, 7]).buffer;
  // An imported-asset object that tiles + carries a baked thumbnail — the full path exercises every byte pass.
  const objP = { id: asObjectId("p1"), source: "/assets/photo.jpg", label: "Photo", width: 8000, height: 6000, thumbnail: "/assets-thumb/photo.jpg" };
  const exP = { id: asExhibitId("exP"), slug: "p", title: "P", objects: [objP] };
  const exQ = { id: asExhibitId("exQ"), slug: "q", title: "Q", objects: [{ id: asObjectId("q1"), source: "https://img/q.jpg", label: "Q1", width: 10, height: 10 }] };
  const libPQ: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exP, exQ] };
  const canvasP1 = `${INC_BASE}p/canvas/p1`;

  const tiles = () => new Map<string, Blob>([["0/0_0.jpg", new Blob([new Uint8Array([9, 9])])]]);
  const fullOpts = () => ({
    baseUrl: INC_BASE,
    getAsset: async () => assetBytes,
    getThumbnail: async () => thumbBytes,
    tileObject: async () => ({ descriptor, tiles: tiles() }),
  });

  // A REMOTE object baked to a local pyramid at publish (tileRemote keys its dir by objId, not asset name).
  const objR = { id: asObjectId("r1"), source: "https://iiif.example/img/info.json", label: "Remote", width: 8000, height: 6000, bakeTiles: true };
  const exR = { id: asExhibitId("exR"), slug: "r", title: "R", objects: [objR] };
  const libR: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exR] };
  const remoteOpts = () => ({ baseUrl: INC_BASE, tileRemote: async () => ({ descriptor: { ...descriptor, filesPath: "r1_files" }, tiles: tiles() }) });

  const log0: AnnotationLog = appendNew([], { target: canvasP1, body: { type: "TextualBody", value: "first" }, lastEditor: alice, modifiedAt: "t0", now: 1 }).log;
  const logsFor = (log: AnnotationLog): ((id: string) => AnnotationLog) => (id) => (id === "exP" ? log : []);

  it("a note edit re-runs NO byte passes AND yields a tree IDENTICAL to a full republish (equivalence oracle)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts()); // full baseline
    const before = await collectFiles(await fs.root());

    const log1 = appendNew(log0, { target: canvasP1, body: { type: "TextualBody", value: "second" }, lastEditor: alice, modifiedAt: "t1", now: 2 }).log;
    let tileCalls = 0;
    await publishLibrary(fs, libPQ, logsFor(log1), {
      ...fullOpts(),
      tileObject: async () => { tileCalls++; return { descriptor, tiles: tiles() }; }, // spy; must NOT fire
      incremental: { exhibits: new Set(["p"]), reassets: new Set() },
    });
    const after = await collectFiles(await fs.root());

    expect(tileCalls).toBe(0); // the whole point: no re-slicing on a note edit
    expect(after["p/assets/photo.jpg"]).toEqual(before["p/assets/photo.jpg"]); // bytes never rewritten
    expect(after["p/photo.jpg_files/0/0_0.jpg"]).toEqual(before["p/photo.jpg_files/0/0_0.jpg"]);
    // The real oracle: the incremental result must equal a FULL republish of the same mutated library.
    const fullFs = new MemoryFilesystem();
    await publishLibrary(fullFs, libPQ, logsFor(log1), fullOpts());
    expect(after).toEqual(await collectFiles(await fullFs.root()));
    // (and the recovered projection carried source/tileSource/thumbnail through — implied by the oracle,
    // asserted directly so a regression names the culprit)
    const recovered = objectsFromManifest(JSON.parse((after["p/manifest.json"] as { text: string }).text))[0]!;
    expect(recovered.source).toBe(`${INC_BASE}p/assets/photo.jpg`);
    expect(recovered.tileSource).toEqual({ ...descriptor, filesPath: `${INC_BASE}p/photo.jpg_files` });
    expect(recovered.thumbnail).toBe(`${INC_BASE}p/assets-thumb/photo.jpg`);
  });

  it("skips an exhibit not in the scope entirely (its files are untouched even if the model changed)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts());
    const before = await collectFiles(await fs.root());
    const libPQ2: Library = { ...libPQ, exhibits: [exP, { ...exQ, title: "Q RENAMED" }] };
    await publishLibrary(fs, libPQ2, logsFor(log0), { ...fullOpts(), incremental: { exhibits: new Set(["p"]), reassets: new Set() } });
    const after = await collectFiles(await fs.root());
    expect(after["q/manifest.json"]).toEqual(before["q/manifest.json"]); // untouched — still titled "Q"
  });

  it("recovery MIRRORS the published projection's absences — a stripped thumbnail stays stripped (defect 4)", async () => {
    const fs = new MemoryFilesystem();
    const objAt = async (): Promise<{ obj: AObject; text: string }> => {
      const text = ((await collectFiles(await fs.root()))["p/manifest.json"] as { text: string }).text;
      return { obj: objectsFromManifest(JSON.parse(text))[0]!, text };
    };
    // Full baseline with NO thumbnail bytes: the full pass strips the working /assets-thumb/ ref.
    await publishLibrary(fs, libPQ, logsFor(log0), { ...fullOpts(), getThumbnail: async () => null });
    expect((await objAt()).obj.thumbnail).toBeUndefined();
    // A note-edit recover must NOT resurrect objP's raw model thumbnail ref.
    const log1 = appendNew(log0, { target: canvasP1, body: { type: "TextualBody", value: "second" }, lastEditor: alice, modifiedAt: "t1", now: 2 }).log;
    await publishLibrary(fs, libPQ, logsFor(log1), { ...fullOpts(), getThumbnail: async () => null, incremental: { exhibits: new Set(["p"]), reassets: new Set() } });
    const recovered = await objAt();
    expect(recovered.obj.thumbnail).toBeUndefined();
    expect(recovered.text).not.toContain("assets-thumb");
  });

  it("self-heals a scoped exhibit whose manifest is missing — forces the byte passes (defect 5)", async () => {
    const fs = new MemoryFilesystem(); // FRESH tree: no prior p/manifest.json to recover from
    let tileCalls = 0;
    await publishLibrary(fs, libPQ, logsFor(log0), {
      ...fullOpts(),
      tileObject: async () => { tileCalls++; return { descriptor, tiles: tiles() }; },
      incremental: { exhibits: new Set(["p"]), reassets: new Set() }, // note: p NOT in reassets
    });
    const tree = await collectFiles(await fs.root());
    expect(tileCalls).toBe(1); // forced byte passes rather than publishing a raw /assets/ source
    expect(tree["p/assets/photo.jpg"]).toBeDefined();
    expect(objectsFromManifest(JSON.parse((tree["p/manifest.json"] as { text: string }).text))[0]!.source).toBe(`${INC_BASE}p/assets/photo.jpg`);
  });

  it("prunes an orphaned imported-asset object's tree files (canvas + asset + thumb + tiles)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts());
    const libNoP1: Library = { ...libPQ, exhibits: [{ ...exP, objects: [] }, exQ] };
    await publishLibrary(fs, libNoP1, logsFor(log0), {
      ...fullOpts(),
      incremental: { exhibits: new Set(["p"]), reassets: new Set() },
      removedObjects: [{ slug: "p", objId: "p1", assetName: "photo.jpg" }],
    });
    const tree = await collectFiles(await fs.root());
    expect(Object.keys(tree).some((k) => k.startsWith("p/canvas/p1/"))).toBe(false);
    expect(Object.keys(tree).some((k) => k.startsWith("p/photo.jpg_files/"))).toBe(false);
    expect(tree["p/assets/photo.jpg"]).toBeUndefined();
    expect(tree["p/assets-thumb/photo.jpg"]).toBeUndefined();
  });

  it("prunes a removed REMOTE-baked object's {objId}_files pyramid (defect 3)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libR, () => [], remoteOpts());
    expect(Object.keys(await collectFiles(await fs.root())).some((k) => k.startsWith("r/r1_files/"))).toBe(true);
    const libNoR1: Library = { ...libR, exhibits: [{ ...exR, objects: [] }] };
    await publishLibrary(fs, libNoR1, () => [], {
      ...remoteOpts(),
      incremental: { exhibits: new Set(["r"]), reassets: new Set() },
      removedObjects: [{ slug: "r", objId: "r1" }], // remote → no assetName; keyed by objId
    });
    expect(Object.keys(await collectFiles(await fs.root())).some((k) => k.startsWith("r/r1_files/"))).toBe(false);
  });

  it("a JSON-only pass over a JUST-ADDED asset object emits NO ref to a file it never wrote (Archie-19d7)", async () => {
    // The live defect: a repeating 404 on `{slug}/assets-thumb/{name}`. Its shape is why the two
    // neighbouring tests above could not see it — one covers "full pass, no bytes → stripped", the other
    // "incremental → preserved", and this is "PRESERVED AND THE BYTES ARE ABSENT", which is a third thing.
    //
    // Mechanism: an object added since the last publish has no entry in the published manifest, so the
    // recovery map cannot supply its asset triple. Without the self-heal it fell through to the MODEL,
    // whose refs (`/assets/{name}`, `/assets-thumb/{name}`) are working-store paths — and a pass with
    // `reassets` empty writes neither file.
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts()); // baseline: p1 published, bytes on disk

    // p2 is added to the SAME exhibit and carries a working thumbnail ref, exactly like a fresh import.
    const objP2 = { id: asObjectId("p2"), source: "/assets/second.jpg", label: "Second", width: 20, height: 15, thumbnail: "/assets-thumb/second.jpg" };
    const libAdded: Library = { ...libPQ, exhibits: [{ ...exP, objects: [objP, objP2] }, exQ] };
    await publishLibrary(fs, libAdded, logsFor(log0), {
      ...fullOpts(),
      getAsset: async (_slug, name) => (name === "second.jpg" ? new Uint8Array([7, 7, 7]).buffer : assetBytes),
      incremental: { exhibits: new Set(["p"]), reassets: new Set() }, // p NOT in reassets — the JSON-only pass
    });

    const tree = await collectFiles(await fs.root());
    const text = (tree["p/manifest.json"] as { text: string }).text;

    // The INVARIANT, not the symptom: every published ref under this exhibit resolves to a real file.
    // Stated over the manifest's own text so it holds for a source, a thumbnail, or any future third ref —
    // the specific one that 404'd is not privileged.
    const refs = [...text.matchAll(new RegExp(`${INC_BASE}(p/(?:assets|assets-thumb)/[^"\\\\]+)`, "g"))].map((m) => m[1]!);
    const dangling = [...new Set(refs)].filter((r) => tree[r] === undefined);
    // Print the SUBJECT: a run that matched no refs at all would pass this vacuously.
    expect(refs.length, `no asset refs found in the manifest at all — the regex or the fixture is wrong: ${text.slice(0, 400)}`).toBeGreaterThan(0);
    expect(dangling, `manifest references files absent from the published tree (tree has: ${Object.keys(tree).filter((k) => k.startsWith("p/assets")).join(", ")})`).toEqual([]);

    // And the added object is genuinely there, so "no dangling refs" can't be satisfied by dropping it.
    const ids = objectsFromManifest(JSON.parse(text)).map((o) => o.id);
    expect(ids).toEqual(["p1", "p2"]);
  });

  it("prunes a removed exhibit's whole directory — on a FULL write too (removals decoupled from scope, defect 1)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts());
    const libNoQ: Library = { ...libPQ, exhibits: [exP] };
    // No `incremental` → a FULL publish, which never overwrites q away; the removal must still prune it.
    await publishLibrary(fs, libNoQ, logsFor(log0), { ...fullOpts(), removedExhibits: ["q"] });
    const tree = await collectFiles(await fs.root());
    expect(Object.keys(tree).some((k) => k.startsWith("q/"))).toBe(false);
    expect(tree["p/manifest.json"]).toBeDefined(); // the rest of the full write still happened
  });

  it("remove-then-recreate in ONE publish rewrites the fresh exhibit (prune runs BEFORE the loop, defect 2)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libPQ, logsFor(log0), fullOpts());
    // Same slug q both removed AND rewritten (new title) in one scope — the fresh write must survive.
    const libQ2: Library = { ...libPQ, exhibits: [exP, { ...exQ, title: "Q REBORN" }] };
    await publishLibrary(fs, libQ2, logsFor(log0), {
      ...fullOpts(),
      incremental: { exhibits: new Set(["q"]), reassets: new Set(["q"]) },
      removedExhibits: ["q"],
    });
    const manifest = (await collectFiles(await fs.root()))["q/manifest.json"] as { text: string } | undefined;
    expect(manifest).toBeDefined(); // NOT deleted by a post-loop prune
    expect(manifest!.text).toContain("Q REBORN"); // and it's the fresh write
  });
});

// A Filesystem that delegates to a MemoryFilesystem but records the path of every file at the moment its
// writer COMMITS (writable().close()) — the durable-write instant. Lets a test observe actual write order
// under the concurrent publish scheduler, which collectFiles (a content snapshot) cannot.
function recordingFs(): { fs: Filesystem; order: string[] } {
  const inner = new MemoryFilesystem();
  const order: string[] = [];
  const wrapWritable = (w: FsWritable, path: string): FsWritable => ({
    write: (d) => w.write(d),
    close: async () => { await w.close(); order.push(path); },
  });
  const wrapFile = (f: FsFile, path: string): FsFile => ({
    readable: () => f.readable(),
    getFile: () => f.getFile(),
    size: () => f.size(),
    writable: async () => wrapWritable(await f.writable(), path),
  });
  const wrapDir = (d: FsDirectory, prefix: string): FsDirectory => ({
    getDirectory: async (name, opts) => wrapDir(await d.getDirectory(name, opts), `${prefix}${name}/`),
    getFile: async (name, opts) => wrapFile(await d.getFile(name, opts), `${prefix}${name}`),
    remove: (name) => d.remove(name),
    entries: () => d.entries(),
  });
  return { fs: { root: async () => wrapDir(await inner.root(), "") }, order };
}

describe("publishLibrary — archie.json is the COMMIT MARKER, written LAST under the concurrent scheduler (Issue 25b)", () => {
  it("commits archie.json strictly after every exhibit's content, even with exhibits fanned out", async () => {
    // 8 exhibits > PUBLISH_CONCURRENCY so the pool actually interleaves; each has an object + a note log so
    // real content (manifest, canvas heads page, history index + page) is written per exhibit.
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const exhibits = slugs.map((s) => ({
      id: asExhibitId(`ex-${s}`), slug: s, title: s.toUpperCase(),
      objects: [{ id: asObjectId(`o-${s}`), source: `https://img/${s}.jpg`, label: s, width: 10, height: 10 }],
    }));
    const lib: Library = { id: asLibraryId("lib"), title: "Lib", exhibits };
    const byId: Record<string, AnnotationLog> = {};
    for (const e of exhibits) {
      byId[e.id] = appendNew([], { target: `https://img/${e.slug}.jpg`, body: { type: "TextualBody", value: `note-${e.slug}` }, lastEditor: alice, modifiedAt: "t", now: 1 }).log;
    }
    const getLogL = (id: string): AnnotationLog => byId[id] ?? [];

    const { fs, order } = recordingFs();
    await publishLibrary(fs, lib, getLogL, { baseUrl: "https://u.gh.io/lib/" });

    const marker = order.indexOf("archie.json");
    expect(marker).toBe(order.length - 1); // archie.json is the very last committed file, nothing after it
    // Every exhibit-subtree file (a/…, b/…, … h/…) commits BEFORE the marker — a torn publish that stops
    // partway has no current marker, so a consumer reads it as stale/refused, never as complete.
    const exhibitWrites = order.filter((p) => /^[a-h]\//.test(p));
    expect(exhibitWrites.length).toBeGreaterThan(slugs.length); // manifests + canvas pages + history pages
    for (const p of exhibitWrites) expect(order.indexOf(p)).toBeLessThan(marker);
    // The library-level projections (images.json, exhibits.json) likewise precede the marker.
    expect(order.indexOf("images.json")).toBeLessThan(marker);
    expect(order.indexOf("exhibits.json")).toBeLessThan(marker);
  });
});

// A LIBRARY THAT CHANGES ORIGIN — the class that shipped silently (2026-07-25).
//
// `publishLibrary` groups heads by EXACT canvas-IRI equality against the base it is publishing to.
// Studio authors every target against `WORKING_IRI_BASE`; a deploy publishes to a real origin; and
// `loadLibrary` → `publishLibrary` (gen-published.mts baking a dropped zip) re-publishes a tree
// whose log still carries the ORIGINAL base. Each of those is a base change, and before the rebase
// every one of them emitted zero annotations with a completely successful publish.
//
// The committed `apps/viewer/libraries/archie-library.archie.zip` is the artifact: manifest + canvas
// ids at the deploy origin, 182 history records at `https://archie.demo/`, and 0 inline annotations
// across all 21 canvases. These tests fail against the pre-rebase publisher.
describe("publishLibrary — annotations survive a change of base", () => {
  const WORKING = "https://archie.demo/";
  const DEPLOY = "https://u.gh.io/lib/";
  const exW = {
    id: asExhibitId("exW"), slug: "w", title: "W",
    objects: [{ id: asObjectId("o1"), source: "https://img/a.jpg", label: "A1", width: 10, height: 10 }],
  };
  const libW: Library = { id: asLibraryId("lib"), title: "Lib", exhibits: [exW] };
  // Authored exactly as Studio authors it: target the WORKING canvas IRI.
  const workingLog: AnnotationLog = appendNew([], {
    target: { type: "SpecificResource", source: `${WORKING}w/canvas/o1`, selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1,2,3,4" } },
    body: { type: "TextualBody", value: "authored against the working base" },
    lastEditor: alice, modifiedAt: "t", now: 1,
  }).log;

  const inlineCount = async (fs: MemoryFilesystem, slug: string): Promise<number> => {
    const manifest = JSON.parse(new TextDecoder().decode(await (await (await (await fs.root()).getDirectory(slug)).getFile("manifest.json")).readable()));
    return manifest.items.reduce((n: number, c: { annotations?: Array<{ items?: unknown[] }> }) =>
      n + (c.annotations ?? []).reduce((m, p) => m + (p.items?.length ?? 0), 0), 0);
  };

  it("publishes a working-base note onto the deploy origin's canvas", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libW, () => workingLog, { baseUrl: DEPLOY });
    expect(await inlineCount(fs, "w")).toBe(1);
    // and the emitted target is the DEPLOY canvas, not the working one — a consumer resolves it.
    const objDir = await (await (await (await fs.root()).getDirectory("w")).getDirectory("canvas")).getDirectory("o1");
    const page = JSON.parse(new TextDecoder().decode(await (await objDir.getFile("annotations.json")).readable()));
    expect(JSON.stringify(page)).toContain(`${DEPLOY}w/canvas/o1`);
    expect(JSON.stringify(page)).not.toContain(WORKING);
  });

  it("keeps the HISTORY sidecar canonical — the rebase is projection-only", async () => {
    // Same posture as rewriteHeadBodies: history is the authored record. If the rebase leaked into
    // history, a round trip would compound rewrites instead of re-deriving from canonical.
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libW, () => workingLog, { baseUrl: DEPLOY });
    const reloaded = await readAnnotations(await (await (await fs.root()).getDirectory("w")).getDirectory("annotations"));
    const t = reloaded[0]!.target;
    expect(typeof t === "string" ? t : t.source).toBe(`${WORKING}w/canvas/o1`);
  });

  it("survives load → re-publish at a DIFFERENT base (the gen-published.mts path)", async () => {
    // Publish at the working base (what Studio's zip export does), load it back, then re-publish to
    // a deploy origin — the exact sequence that fossilised `screenshots` into a note-less exhibit.
    const first = new MemoryFilesystem();
    await publishLibrary(first, libW, () => workingLog, { baseUrl: WORKING });
    const loaded = await loadLibrary(first);
    const second = new MemoryFilesystem();
    await publishLibrary(second, loaded.library, (id) => loaded.logs[id] ?? [], { baseUrl: DEPLOY });
    expect(await inlineCount(second, "w")).toBe(1);
  });

  it("does NOT claim a canvas belonging to something else", async () => {
    // The rebase must stay narrow: a note on an external IIIF canvas is not this exhibit's note.
    const foreignLog: AnnotationLog = appendNew([], {
      target: "https://collections.library.yale.edu/iiif/2/1006231/canvas/p1",
      body: { type: "TextualBody", value: "elsewhere" }, lastEditor: alice, modifiedAt: "t", now: 1,
    }).log;
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, libW, () => foreignLog, { baseUrl: DEPLOY });
    expect(await inlineCount(fs, "w")).toBe(0);
  });
});
