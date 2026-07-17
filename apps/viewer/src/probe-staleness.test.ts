// PROBE (Issues 23/24) — characterizes the hosted viewer's read/staleness behavior via a mocked fetch.
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadImageIndex, loadPublishedExhibit, loadGallery } from "./published.js";
import { BASE as CANONICAL_BASE } from "./published-base.js";

afterEach(() => vi.unstubAllGlobals());

type Handler = (url: string) => { status: number; body?: unknown; text?: string };
function stub(handler: Handler): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    urls.push(u);
    const r = handler(u);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => { if (r.body === undefined) throw new SyntaxError("bad json"); return r.body; },
      text: async () => r.text ?? "",
    } as unknown as Response;
  }));
  return urls;
}

describe("hosted schema gate — loadGallery reads archie.json (READPOLICY rp2)", () => {
  const emptyExhibits = { library: { id: "L", title: "L" }, exhibits: [], presentation: {} };
  it("PRESENT wrong-version marker → rejects cleanly (no garbage render) [rp2]", async () => {
    stub((u) => {
      if (u.includes("archie.json")) return { status: 200, body: { format: "archie-library", version: 999 } };
      if (u.includes("exhibits.json")) return { status: 200, body: emptyExhibits };
      return { status: 404 };
    });
    await expect(loadGallery()).rejects.toThrow(/different version/i);
  });
  it("ABSENT marker (404) → lenient-accept when exhibits.json parses [rp2]", async () => {
    stub((u) => {
      if (u.includes("archie.json")) return { status: 404 };
      if (u.includes("exhibits.json")) return { status: 200, body: emptyExhibits };
      return { status: 404 };
    });
    expect((await loadGallery()).exhibits).toEqual([]);
  });
  it("PRESENT foreign marker → rejected [rp2]", async () => {
    stub((u) => (u.includes("archie.json") ? { status: 200, body: { format: "not-archie" } } : { status: 200, body: emptyExhibits }));
    await expect(loadGallery()).rejects.toThrow(/isn't an archie library/i);
  });
});

describe("PROBE loadImageIndex — images.json 5xx vs 404 (published.ts:290 fetchJsonOptional)", () => {
  it("images.json 500 → wall degrades silently (indistinguishable from a legit 404-absent index?)", async () => {
    stub(() => ({ status: 500 }));
    const idx = await loadImageIndex();
    console.log("[PROBE] loadImageIndex 500:", JSON.stringify(idx));
    expect(idx).toBeNull(); // ACTUAL: a transient 5xx degrades to "no wall" exactly like a legit absent index
  });
});

describe("generation keying + hostedCache invalidation (STALENESS st2)", () => {
  const manifest = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: "m", type: "Manifest", label: { none: ["One"] },
    items: [{ id: "https://u/rd/canvas/o1", type: "Canvas", label: { none: ["o1"] }, height: 1, width: 1,
      items: [], annotations: [{ id: "https://u/rd/canvas/o1/annotations.json", type: "AnnotationPage", items: [] }] }],
  };
  const emptyExhibits = { library: { id: "L", title: "L" }, exhibits: [], presentation: {} };
  const serve = (gen: string): Handler => (u) => {
    if (u.includes("archie.json")) return { status: 200, body: { format: "archie-library", version: 1, generation: gen } };
    if (u.includes("exhibits.json")) return { status: 200, body: emptyExhibits };
    if (u.includes("manifest.json")) return { status: 200, body: manifest };
    return { status: 404 };
  };

  // Distinct generation per test: module state (hostedGeneration/hostedCache) persists across tests, so a
  // unique gen makes each first loadGallery a genuine change → a clean cache-clear (no cross-test bleed).
  it("after loadGallery, every hosted CONTENT fetch is keyed ?g=<generation>; archie.json is NOT [st2]", async () => {
    const urls = stub(serve("gk1"));
    await loadGallery();
    await loadPublishedExhibit("rd");
    const content = urls.filter((u) => /manifest\.json|exhibits\.json/.test(u));
    expect(content.length).toBeGreaterThan(0);
    expect(content.every((u) => u.includes("?g=gk1"))).toBe(true); // content pinned to the generation
    expect(urls.filter((u) => u.includes("archie.json")).every((u) => !u.includes("?g="))).toBe(true); // marker fresh
  });

  it("hostedCache serves within a generation, but a generation CHANGE invalidates it (no gen A after B) [st2]", async () => {
    const urls = stub(serve("gk2"));
    await loadGallery();
    await loadPublishedExhibit("rd");
    const a1 = urls.filter((u) => u.includes("rd/manifest.json")).length;
    await loadPublishedExhibit("rd"); // same generation → served from cache
    const a2 = urls.filter((u) => u.includes("rd/manifest.json")).length;
    expect(a2).toBe(a1); // cached within gk2 (no extra fetch)

    vi.unstubAllGlobals();
    const urls2 = stub(serve("gk3")); // republish: archie.json now reports a new generation
    await loadGallery(); // refreshLive path — detects the mismatch, clears the cache
    await loadPublishedExhibit("rd");
    expect(urls2.filter((u) => u.includes("rd/manifest.json")).length).toBe(1); // re-fetched under gk3 (cache busted)
    expect(urls2.some((u) => u.includes("rd/manifest.json?g=gk3"))).toBe(true);
  });
});

describe("hostedRebase note-body ${BASE} cite → serving origin (STALENESS st4)", () => {
  it("rewrites a ${BASE} image URL embedded in a note body; leaves remote URLs alone", async () => {
    const note = {
      id: "https://u/st4/canvas/o1/a1", type: "Annotation",
      target: "https://u/st4/canvas/o1",
      body: { type: "TextualBody", value: `see ![](${CANONICAL_BASE}screenshots/x.png) and https://remote/y.png` },
    };
    const manifest = {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: "m", type: "Manifest", label: { none: ["St4"] },
      items: [{ id: "https://u/st4/canvas/o1", type: "Canvas", label: { none: ["o1"] }, height: 1, width: 1,
        items: [], annotations: [{ id: "https://u/st4/canvas/o1/annotations.json", type: "AnnotationPage", items: [note] }] }],
    };
    stub((u) => (u.includes("st4/manifest.json") ? { status: 200, body: manifest } : { status: 404 }));
    const ex = await loadPublishedExhibit("st4");
    const value = (ex.annotationsByObject.o1![0]!.body as { value: string }).value;
    expect(value).toContain("/published/screenshots/x.png"); // ${BASE} cite rebased to the serving origin
    expect(value).not.toContain(CANONICAL_BASE); // no canonical BASE left behind
    expect(value).toContain("https://remote/y.png"); // remote URL untouched
  });
});
