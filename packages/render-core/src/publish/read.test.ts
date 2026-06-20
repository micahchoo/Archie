import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { publishLibrary } from "./site.js";
import { readExhibitTree, fsJsonSource, type NoteTransform, type JsonSource } from "./read.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";

// The domino's unit: one source-parameterized traversal behind a JsonSource seam. The three readers
// (site/portable/viewer) are thin adapters over this — characterized by their own suites; this pins
// the shared traversal + the fs-coupled transform hook directly.
const author = asClientId("curator");
const base = "https://u.gh.io/lib/";
const canvas = `${base}rd/canvas/o1`;
const lib: Library = {
  id: asLibraryId("L"),
  title: "Lib",
  exhibits: [{
    id: asExhibitId("e1"),
    slug: "rd",
    title: "Readings",
    objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
    readings: [{ id: "cipher", name: "Cipher" }],
  }],
};
let log = appendNew([], { target: canvas, body: { type: "TextualBody", value: "ciph" }, lastEditor: author, modifiedAt: "t", now: 1, reading: "cipher" }).log;
log = appendNew(log, { target: canvas, body: { type: "TextualBody", value: "base" }, lastEditor: author, modifiedAt: "t", now: 2 }).log;
const published = async () => {
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, lib, (id) => (id === "e1" ? log : []), { baseUrl: base });
  return fs;
};

describe("readExhibitTree (source-parameterized published-tree reader)", () => {
  it("reads manifest/objects/sections/canvas IRIs + readings + per-reading pages over a JsonSource", async () => {
    const ex = await readExhibitTree(fsJsonSource(await published()), "rd");
    expect(ex.title).toBe("Readings");
    expect(ex.objects.map((o) => o.id)).toEqual(["o1"]);
    expect(ex.canvasIdByObject.o1).toBe(canvas); // IRI from the manifest
    expect(ex.annotationsByObject.o1?.length).toBe(1); // the base (reading-less) note
    expect(ex.readings.map((r) => r.id)).toEqual(["cipher"]);
    expect(ex.readingAnnotationsByObject.o1?.cipher?.length).toBe(1); // per-reading page
  });

  it("applies the NoteTransform hook to objects and notes (base + per-reading)", async () => {
    const t: NoteTransform = {
      object: async (o) => ({ ...o, source: `X:${o.source}` }),
      note: async (n) => ({ ...n, _t: true }) as typeof n,
    };
    const ex = await readExhibitTree(fsJsonSource(await published()), "rd", t);
    expect(ex.objects[0]!.source.startsWith("X:")).toBe(true); // object hook ran
    expect((ex.annotationsByObject.o1![0] as { _t?: boolean })._t).toBe(true); // note hook ran on base
    expect((ex.readingAnnotationsByObject.o1!.cipher![0] as { _t?: boolean })._t).toBe(true); // and per-reading
  });

  it("serves notes from the manifest's INLINE pages — the standalone sidecars are not re-fetched", async () => {
    const inner = fsJsonSource(await published());
    const fetched: string[] = [];
    const counting: JsonSource = {
      get: (p) => { fetched.push(p); return inner.get(p); },
      getOptional: (p) => { fetched.push(p); return inner.getOptional(p); },
    };
    const ex = await readExhibitTree(counting, "rd");
    // Identical data to the standalone-file read (same fixture, same assertions as above).
    expect(ex.annotationsByObject.o1?.length).toBe(1);
    expect(ex.readingAnnotationsByObject.o1?.cipher?.length).toBe(1);
    // The redundancy is gone: the per-canvas annotation sidecars were never fetched — the manifest's
    // inline items served them — while the manifest itself (and readings registry) still are.
    expect(fetched.some((p) => p.includes("/canvas/o1/annotations"))).toBe(false);
    expect(fetched).toContain("rd/manifest.json");
  });
});

// ADR-0017: a Section also ships as a WADM annotation in {slug}/annotations/narrative.json (the all-round
// view for pure annotation tools), while the IIIF Range in structures[] stays canonical. This pins the
// SAFETY invariant: the WADM view must NOT leak back into the Note read-path (no double-count).
describe("Section WADM-annotation export (ADR-0017) leaves the read round-trip intact", () => {
  const nbase = "https://u.gh.io/lib/";
  const ncanvas = `${nbase}narr/canvas/o1`;
  const nlib: Library = {
    id: asLibraryId("L2"), title: "Lib2",
    exhibits: [{
      id: asExhibitId("e2"), slug: "narr", title: "Narrative",
      objects: [{ id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" }],
      sections: [
        { id: "s1", title: "Open", objectId: "o1", start: "xywh=0,0,10,10", prose: "p" },
        { id: "s2", title: "Close", objectId: "o1" },
      ],
    }],
  };
  // exactly ONE ordinary note on the canvas — the count we assert must NOT be inflated by the 2 section-annotations.
  const nlog = appendNew([], { target: ncanvas, body: { type: "TextualBody", value: "n" }, lastEditor: author, modifiedAt: "t", now: 1 }).log;
  const npublished = async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, nlib, (id) => (id === "e2" ? nlog : []), { baseUrl: nbase });
    return fs;
  };

  it("writes the narrative AnnotationCollection sidecar (the WADM view of the Sections)", async () => {
    const coll = await fsJsonSource(await npublished()).getOptional<{ type: string; total: number }>("narr/annotations/narrative.json");
    expect(coll?.type).toBe("AnnotationCollection");
    expect(coll?.total).toBe(2);
  });

  it("recovers Sections from structures and does NOT double-count section-annotations as notes", async () => {
    const ex = await readExhibitTree(fsJsonSource(await npublished()), "narr");
    expect(ex.sections.map((s) => s.id)).toEqual(["s1", "s2"]); // spine read from the Ranges
    expect(ex.annotationsByObject.o1?.length).toBe(1); // ONLY the real note — the section-annotations did not leak in
  });
});
