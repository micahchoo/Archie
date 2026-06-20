// PV-2a — the hosted/portable data seam (ADR-0008 / ADR-0010). Verifies that opening a `.archie.zip`
// switches the Viewer's read path to the in-memory Filesystem (core's loadPortableExhibit) with media
// resolved to blob URLs, and that the open/close/isPortable state machine behaves. The HOSTED branch
// (HTTP fetch) is unchanged + exercised by the deployed app; not re-tested here (no server in-test).
import { describe, it, expect, afterEach, vi } from "vitest";
import { ZipFilesystem, publishLibrary, appendNew, asClientId, asExhibitId, asLibraryId, asObjectId, type Library, type AnnotationLog, type ExhibitsJson } from "@render/core";
import {
  openPortableLibrary, closePortableLibrary, isPortable, loadGallery, loadPublishedExhibit,
  modeFromProbe, probeViewerMode, openLibraryFromFile, openLibraryFromSrc, mergeGalleries,
} from "./published.js";

const BASE = "https://u.gh.io/lib/";
const SLUG = "voynich";
const ASSET_NAME = "plate.png";
const author = asClientId("curator");
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG sig — bytes survive the round-trip
const canvasId = `${BASE}${SLUG}/canvas/o1`;

const library: Library = {
  id: asLibraryId("L"), title: "Lib",
  exhibits: [{ id: asExhibitId("e1"), slug: SLUG, title: "Voynich", objects: [{ id: asObjectId("o1"), source: `/assets/${ASSET_NAME}`, label: "folio 1" }] }],
};

async function buildArchiveBytes(): Promise<Uint8Array> {
  const fs = new ZipFilesystem();
  let log: AnnotationLog = [];
  ({ log } = appendNew(log, { target: canvasId, body: { type: "TextualBody", value: "a head note" }, lastEditor: author, modifiedAt: "t", now: 1 }));
  const logs: Record<string, AnnotationLog> = { e1: log };
  await publishLibrary(fs, library, (id) => logs[id] ?? [], {
    baseUrl: BASE,
    getAsset: async (slug, name) => (slug === SLUG && name === ASSET_NAME ? PNG_BYTES.slice().buffer : null),
  });
  return fs.toZip();
}
const openZip = async () => openPortableLibrary(ZipFilesystem.fromZip(await buildArchiveBytes()));

afterEach(() => { closePortableLibrary(); vi.unstubAllGlobals(); }); // reset module state + any fetch stub

describe("published.ts hosted/portable seam (PV-2a)", () => {
  it("defaults to hosted (not portable)", () => {
    expect(isPortable()).toBe(false);
  });

  it("openPortableLibrary → portable; loadGallery + loadPublishedExhibit read the zip", async () => {
    await openZip();
    expect(isPortable()).toBe(true);

    const gallery = await loadGallery();
    expect(gallery.exhibits.map((e) => e.slug)).toContain(SLUG);

    const ex = await loadPublishedExhibit(SLUG);
    expect(ex.title).toBe("Voynich");
    expect(ex.objects[0]!.source.startsWith("blob:")).toBe(true); // embedded media resolved via the core seam
    expect(Array.isArray(ex.readings)).toBe(true); // the readings field (now also read by core's readPublishedExhibit, ADR-0007)
  });

  it("a superseded concurrent load self-revokes its blobs, keeping the live exhibit's (revoke-race guard)", async () => {
    await openZip();
    const revoked: string[] = [];
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation((u) => { revoked.push(String(u)); });
    try {
      // Two loads in flight at once (rapid re-navigation). First call = older seq (superseded), second =
      // latest (survivor). The guard must free the superseded load's OWN blobs and NOT clobber the live
      // revoke handle — without it, both set the handle (last wins) and the first load's blob URLs leak.
      const [a, b] = await Promise.all([loadPublishedExhibit(SLUG), loadPublishedExhibit(SLUG)]);
      const supersededSrc = a.objects[0]!.source; // first call → older seq
      const liveSrc = b.objects[0]!.source; // second call → latest seq (the visible exhibit)
      expect(supersededSrc.startsWith("blob:")).toBe(true);
      expect(liveSrc.startsWith("blob:")).toBe(true);
      expect(supersededSrc).not.toBe(liveSrc); // each load minted its own blob set
      expect(revoked).toContain(supersededSrc); // the superseded load freed its own blobs (no leak)
      expect(revoked).not.toContain(liveSrc); // the live exhibit's blobs were NOT revoked (no early-free)
    } finally {
      spy.mockRestore();
    }
  });

  it("closePortableLibrary returns to hosted", async () => {
    await openZip();
    expect(isPortable()).toBe(true);
    closePortableLibrary();
    expect(isPortable()).toBe(false);
  });
});

describe("mode-detect classifier (ADR-0008) — modeFromProbe", () => {
  it("ok → hosted; absent(404) → portable; transient/corrupt → error (never silently portable)", () => {
    expect(modeFromProbe({ kind: "ok" })).toBe("hosted");
    expect(modeFromProbe({ kind: "absent" })).toBe("portable");
    expect(modeFromProbe({ kind: "http", status: 500 })).toBe("error");
    expect(modeFromProbe({ kind: "network" })).toBe("error");
    expect(modeFromProbe({ kind: "malformed" })).toBe("error");
  });
});

describe("probeViewerMode (fetch + classify the four+ outcomes)", () => {
  const stubFetch = (r: { status?: number; json?: unknown; throws?: boolean }) =>
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (r.throws) throw new Error("network down");
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => { if (r.json === undefined) throw new SyntaxError("bad json"); return r.json; },
      } as unknown as Response;
    }));

  it("short-circuits to portable when a zip is already open (no fetch needed)", async () => {
    openPortableLibrary(ZipFilesystem.fromZip(await buildArchiveBytes()));
    stubFetch({ status: 200, json: { library: {}, exhibits: [] } });
    expect(await probeViewerMode()).toBe("portable");
  });

  it("200 + valid JSON → hosted", async () => { stubFetch({ status: 200, json: { library: {}, exhibits: [] } }); expect(await probeViewerMode()).toBe("hosted"); });
  it("404 → portable (no baked tree)", async () => { stubFetch({ status: 404 }); expect(await probeViewerMode()).toBe("portable"); });
  it("500 → error", async () => { stubFetch({ status: 500 }); expect(await probeViewerMode()).toBe("error"); });
  it("network throw → error", async () => { stubFetch({ throws: true }); expect(await probeViewerMode()).toBe("error"); });
  it("200 + malformed body → error", async () => { stubFetch({ status: 200 }); expect(await probeViewerMode()).toBe("error"); });
});

describe("entry vectors (file + ?src=)", () => {
  it("openLibraryFromFile opens a .archie.zip blob into portable mode", async () => {
    await openLibraryFromFile(new Blob([new Uint8Array(await buildArchiveBytes())]));
    expect(isPortable()).toBe(true);
    expect((await loadGallery()).exhibits.map((e) => e.slug)).toContain(SLUG);
  });

  it("openLibraryFromSrc fetches + opens; rejects an over-cap library without opening", async () => {
    const bytes = await buildArchiveBytes();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => String(bytes.byteLength) }, arrayBuffer: async () => bytes.slice().buffer,
    } as unknown as Response)));
    await openLibraryFromSrc("https://h/x.archie.zip");
    expect(isPortable()).toBe(true);

    closePortableLibrary();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => "999" }, arrayBuffer: async () => bytes.slice().buffer,
    } as unknown as Response)));
    await expect(openLibraryFromSrc("https://h/x.archie.zip", 10)).rejects.toThrow(/too large/);
    expect(isPortable()).toBe(false); // rejected before opening
  });

  it("openLibraryFromSrc throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)));
    await expect(openLibraryFromSrc("https://h/x.archie.zip")).rejects.toThrow(/couldn't open the library/i);
  });
});

// Live source (Q-3): the hall-merge invariants. The OPFS probe itself is browser-only
// (BROWSER-VERIFY-OWED); the merge is the pure half.
describe("mergeGalleries (live over hosted)", () => {
  const card = (slug: string, order: number) => ({ slug, title: slug, order });
  const live: ExhibitsJson = { library: { id: "demo", title: "My Library" }, exhibits: [card("mine", 0), card(SLUG, 1)], presentation: {} };
  const hosted: ExhibitsJson = { library: { id: "L", title: "Samples" }, exhibits: [card(SLUG, 0), card("other", 1)], presentation: {} };

  it("live alone carries the hall when no baked tree exists", () => {
    expect(mergeGalleries(live, null)).toBe(live);
  });

  it("live wins a slug collision; hosted-only exhibits remain; the live library identity fronts", () => {
    const merged = mergeGalleries(live, hosted);
    expect(merged.library.title).toBe("My Library");
    expect(merged.exhibits.map((e) => e.slug)).toEqual(["mine", SLUG, "other"]);
    // The colliding slug is the LIVE entry (the author's working copy fronts its published snapshot).
    expect(merged.exhibits.filter((e) => e.slug === SLUG)).toHaveLength(1);
    expect(merged.exhibits.find((e) => e.slug === SLUG)!.order).toBe(1);
  });
});
