// PV-2a — the hosted/portable data seam (ADR-0008 / ADR-0010). Verifies that opening a `.archie.zip`
// switches the Viewer's read path to the in-memory Filesystem (core's loadPortableExhibit) with media
// resolved to blob URLs, and that the open/close/isPortable state machine behaves. The HOSTED branch
// (HTTP fetch) is unchanged + exercised by the deployed app; not re-tested here (no server in-test).
import { describe, it, expect, afterEach, vi } from "vitest";
import { ZipFilesystem, publishLibrary, appendNew, asClientId, asExhibitId, asLibraryId, asObjectId, type Library, type AnnotationLog, type ExhibitsJson } from "@render/core";
import {
  openPortableLibrary, closePortableLibrary, isPortable, loadGallery, loadPublishedExhibit,
  modeFromProbe, probeViewerMode, bootErrorMessage, openLibraryFromFile, openLibraryFromSrc, mergeGalleries, toServingOrigin,
} from "./published.js";
import { BASE as CANONICAL_BASE } from "./published-base.js";

// Hosted rebase (ADR-0010 portable read seam, tend Issue 16): the published manifest bakes asset URLs
// against the canonical origin (ADR-0013); a fork / localhost / any re-host serves the same tree from a
// DIFFERENT origin and must rebase those URLs onto its own, or every local image 404s.
describe("toServingOrigin — canonical asset URLs → serving origin", () => {
  it("rebases a canonical-BASE asset URL off the canonical origin (fork/localhost can then serve it)", () => {
    const out = toServingOrigin(`${CANONICAL_BASE}screenshots/assets/o1-e1-embed.png`);
    expect(out.startsWith(CANONICAL_BASE)).toBe(false); // canonical origin stripped
    expect(out.endsWith("screenshots/assets/o1-e1-embed.png")).toBe(true); // asset path preserved
  });
  it("passes remote IIIF / data / blob URLs through untouched (only canonical BASE URLs rebase)", () => {
    for (const url of ["https://collections.library.yale.edu/iiif/2/1006076", "data:image/png;base64,AAAA", "blob:http://x/y"]) {
      expect(toServingOrigin(url)).toBe(url);
    }
  });
});

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
  // Archie-a2b9: the old single "error" mode collapsed offline and corrupt-deploy, so the shell blamed
  // the reader's connection for a broken deployment. The split is now the contract.
  it("ok → hosted; absent(404) → portable (the ONLY portable signal — never silently portable on failure)", () => {
    expect(modeFromProbe({ kind: "ok" })).toBe("hosted");
    expect(modeFromProbe({ kind: "absent" })).toBe("portable");
  });
  it("offline-vs-deploy split: network throw → offline; 5xx / corrupt body → broken", () => {
    expect(modeFromProbe({ kind: "network" })).toBe("offline");
    expect(modeFromProbe({ kind: "http", status: 500 })).toBe("broken");
    expect(modeFromProbe({ kind: "malformed" })).toBe("broken");
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
  it("500 → broken (deploy problem, not the reader's connection)", async () => { stubFetch({ status: 500 }); expect(await probeViewerMode()).toBe("broken"); });
  it("network throw → offline", async () => { stubFetch({ throws: true }); expect(await probeViewerMode()).toBe("offline"); });
  it("200 + malformed body → broken (corrupt deployment)", async () => { stubFetch({ status: 200 }); expect(await probeViewerMode()).toBe("broken"); });
});

// Archie-a2b9 done-when: an offline boot and a corrupt-JSON boot show DIFFERENT, accurate messages.
// The copy lives in published.ts (bootErrorMessage) — beside the classifier, not in ViewerShell — so
// this suite can pin it without a DOM.
describe("bootErrorMessage — offline vs deploy-problem copy (Archie-a2b9)", () => {
  it("offline and corrupt-JSON boots read differently, and each is accurate", () => {
    const offline = bootErrorMessage("offline"); //       boot path: fetch threw → probe "network"
    const corrupt = bootErrorMessage("broken"); //        boot path: 200 + unparsable JSON → "malformed"
    expect(offline).not.toBe(corrupt);
    expect(offline).toMatch(/connection/i); //            accurate: the reader's side — check the wifi
    expect(corrupt).not.toMatch(/check your connection/i); // must NOT blame the reader's connection
    expect(corrupt).toMatch(/publish/i); //               accurate: the deploy's side — republish to fix
  });
  it("a probe-ok-but-load-failed boot (e.g. wrong-version marker) reads as a deploy problem, not offline", () => {
    // boot() reaches bootErrorMessage with "hosted" when exhibits.json probes fine yet loadGallery threw
    // (NotAnArchieLibraryError from a wrong-version archie.json marker) — same republish-to-fix copy.
    expect(bootErrorMessage("hosted")).toBe(bootErrorMessage("broken"));
  });
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

  it("ADR-0020: rejects a JUNK zip (no collection.json/exhibits.json) with a friendly Error, never entering portable mode", async () => {
    // A genuinely non-Archie zip: neither marker NOR a structural index file. Lenient-on-absent
    // accepts an UNMARKED real export (collection.json/exhibits.json present); only a zip with
    // neither is rejected.
    const fs = new ZipFilesystem();
    const f = await (await fs.root()).getFile("hello.txt", { create: true });
    const w = await f.writable();
    await w.write("not archie");
    await w.close();
    const bytes = fs.toZip();
    await expect(openLibraryFromFile(new Blob([new Uint8Array(bytes)]))).rejects.toThrow(/isn't an archie library/i);
    expect(isPortable()).toBe(false); // rejected by the marker gate before openPortableLibrary
  });

  it("ADR-0020 lenient-on-absent: ACCEPTS an UNMARKED real export (exhibits.json, no archie.json)", async () => {
    // The regression: a pre-marker real export has exhibits.json but no archie.json — it must still open.
    const fs = new ZipFilesystem();
    const f = await (await fs.root()).getFile("exhibits.json", { create: true });
    const w = await f.writable();
    await w.write(JSON.stringify({ library: { id: "x", title: "Recovered" }, exhibits: [] }));
    await w.close();
    const bytes = fs.toZip();
    await openLibraryFromFile(new Blob([new Uint8Array(bytes)]));
    expect(isPortable()).toBe(true); // accepted — structurally a valid Archie library
    closePortableLibrary();
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
