import { describe, it, expect } from "vitest";
import { MemoryFilesystem } from "../fs/memory.js";
import { publishLibrary } from "./site.js";
import { readExhibitTree, fsJsonSource, httpJsonSource, FailedReadError, assertArchieTreeMarker, type NoteTransform, type JsonSource } from "./read.js";
import { ARCHIE_LIBRARY_MARKER } from "./marker.js";
import { SCHEMA_VERSION } from "../migrate/migrate.js";
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

// The TREE half of the open seam (Phase 1 Wave 2): `httpJsonSource` is the ONE composition of
// fsJsonSource over the read-only HttpFilesystem — every consumer that reads a published tree over
// HTTP adapts over it. These pin the classification it inherits from the backend, so the seam's
// contract is tested where it is defined.
describe("httpJsonSource (HTTP JsonSource — the tree half of the open seam)", () => {
  const BASE = "https://host/published";

  function stub(routes: Record<string, () => Response>): { src: JsonSource; requested: string[] } {
    const requested: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const make = routes[url];
      return make ? make() : new Response("not found", { status: 404 });
    }) as typeof fetch;
    return { src: httpJsonSource(BASE, { fetch: fetchImpl }), requested };
  }

  it("404 → getOptional null (absent); get throws the seam's canonical no-such-file error", async () => {
    const { src, requested } = stub({});
    expect(await src.getOptional("gone/readings.json")).toBeNull();
    // The canonical absent phrasing is `no such file: <name>` — the FILE NAME, not the full path
    // (HttpFilesystem's HttpFile builds it from this.name; isNotFound matches /no such (file|directory)/i).
    await expect(src.get("gone/readings.json")).rejects.toThrow(/no such file: readings\.json/);
    expect(requested).toEqual([`${BASE}/gone/readings.json`, `${BASE}/gone/readings.json`]); // one GET per read
  });

  it("5xx → FailedReadError carrying the status — FAILED, never silently absent", async () => {
    const { src } = stub({ [`${BASE}/broken.json`]: () => new Response("oops", { status: 500 }) });
    await expect(src.getOptional("broken.json")).rejects.toBeInstanceOf(FailedReadError);
    const err = await src.get("broken.json").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(FailedReadError);
    expect((err as FailedReadError).status).toBe(500);
  });

  it("a network fault → FailedReadError without a status — FAILED, never absent", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const src = httpJsonSource(BASE, { fetch: fetchImpl });
    await expect(src.getOptional("x.json")).rejects.toBeInstanceOf(FailedReadError);
    await expect(src.get("x.json")).rejects.toBeInstanceOf(FailedReadError);
  });

  it("serves real JSON documents (the composition is the read path, not a stub)", async () => {
    const { src } = stub({ [`${BASE}/exhibits.json`]: () => new Response('{"library":{"title":"T"}}') });
    expect(await src.get<{ library: { title: string } }>("exhibits.json")).toEqual({ library: { title: "T" } });
  });
});

// Phase 2 STRICT option: `assertArchieTreeMarker(src, { requirePresent: true })` is the verify-publish
// path — a tree this repo's own publishLibrary just wrote must ALWAYS carry a READABLE archie.json
// (written LAST, the commit point; render-core-data-integrity rule 1), so absence and read faults are
// refusals, not tolerances. The lenient default — the OPEN path — stays byte-identical.
describe("assertArchieTreeMarker (requirePresent strict option)", () => {
  const BASE = "https://host/published";

  function stub(routes: Record<string, () => Response>): JsonSource {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      const make = routes[url];
      return make ? make() : new Response("not found", { status: 404 });
    }) as typeof fetch;
    return httpJsonSource(BASE, { fetch: fetchImpl });
  }

  it("absent marker under strict → throws NotAnArchieLibraryError naming the commit-point rule", async () => {
    const src = stub({});
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).rejects.toThrow(/no archie\.json marker/i);
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).rejects.toThrow(/commit point/i);
  });

  it("failed marker read (5xx) under strict → throws (fail loud, not lenient-skip)", async () => {
    const src = stub({ [`${BASE}/archie.json`]: () => new Response("oops", { status: 500 }) });
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).rejects.toThrow(/could not be read/i);
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).rejects.toThrow(/commit point/i);
  });

  it("invalid marker under strict → the same refusal as the lenient gate (strictness is about absence, not the branch chain)", async () => {
    const src = stub({
      [`${BASE}/archie.json`]: () => new Response(JSON.stringify({ format: "something-else", version: SCHEMA_VERSION })),
    });
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).rejects.toThrow(/isn't an Archie library/i);
    await expect(assertArchieTreeMarker(src)).rejects.toThrow(/isn't an Archie library/i);
  });

  it("valid marker under strict → resolves to the marker (caller reuses generation without a second fetch)", async () => {
    const src = stub({
      [`${BASE}/archie.json`]: () => new Response(JSON.stringify({ ...ARCHIE_LIBRARY_MARKER, generation: "g-1" })),
    });
    await expect(assertArchieTreeMarker(src, { requirePresent: true })).resolves.toMatchObject({
      format: "archie-library",
      version: SCHEMA_VERSION,
      generation: "g-1",
    });
  });

  it("lenient default unchanged: absent → null; failed read → null (logged, never thrown)", async () => {
    const absent = stub({});
    await expect(assertArchieTreeMarker(absent)).resolves.toBeNull();
    const failed = stub({ [`${BASE}/archie.json`]: () => new Response("oops", { status: 500 }) });
    await expect(assertArchieTreeMarker(failed)).resolves.toBeNull();
  });
});
