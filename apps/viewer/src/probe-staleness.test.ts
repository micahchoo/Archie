// PROBE (Issues 23/24) — characterizes the hosted viewer's read/staleness behavior via a mocked fetch.
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadImageIndex, loadPublishedExhibit } from "./published.js";

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

describe("PROBE loadImageIndex — images.json 5xx vs 404 (published.ts:290 fetchJsonOptional)", () => {
  it("images.json 500 → wall degrades silently (indistinguishable from a legit 404-absent index?)", async () => {
    stub(() => ({ status: 500 }));
    const idx = await loadImageIndex();
    console.log("[PROBE] loadImageIndex 500:", JSON.stringify(idx));
    expect(idx).toBeNull(); // ACTUAL: a transient 5xx degrades to "no wall" exactly like a legit absent index
  });
});

describe("PROBE loadPublishedExhibit — generation keying + hostedCache (published.ts:271/334)", () => {
  const manifest = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: "m", type: "Manifest", label: { none: ["One"] },
    items: [{ id: "https://u/rd/canvas/o1", type: "Canvas", label: { none: ["o1"] }, height: 1, width: 1,
      items: [], annotations: [{ id: "https://u/rd/canvas/o1/annotations.json", type: "AnnotationPage", items: [] }] }],
  };
  it("do hosted fetch URLs carry ?g=<generation>? is archie.json read first?", async () => {
    const urls = stub((u) => {
      if (u.includes("manifest.json")) return { status: 200, body: manifest };
      if (u.includes("archie.json")) return { status: 200, body: { format: "archie-library", version: 1 } };
      return { status: 404 };
    });
    await loadPublishedExhibit("rd").catch((e) => console.log("[PROBE] load err:", String(e)));
    console.log("[PROBE] hosted fetch URLs:", JSON.stringify(urls));
    const anyGen = urls.some((u) => u.includes("?g=") || u.includes("&g="));
    const readsMarker = urls.some((u) => u.includes("archie.json"));
    console.log("[PROBE] carries ?g= :", anyGen, "| reads archie.json:", readsMarker);
    expect(urls.length).toBeGreaterThan(0);
  });

  it("hostedCache: a second load re-fetches or serves the cached (stale-able) exhibit?", async () => {
    const urls = stub((u) => (u.includes("manifest.json") ? { status: 200, body: manifest } : { status: 404 }));
    await loadPublishedExhibit("rd2").catch(() => {});
    const after1 = urls.filter((u) => u.includes("rd2/manifest.json")).length;
    await loadPublishedExhibit("rd2").catch(() => {});
    const after2 = urls.filter((u) => u.includes("rd2/manifest.json")).length;
    console.log("[PROBE] manifest fetches after 1st load / 2nd load:", after1, "/", after2);
    // ACTUAL: after2 === after1 (served from hostedCache — no generation check, can serve gen A after B).
    expect(after2).toBe(after1);
  });
});
