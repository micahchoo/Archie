// PROBE (Issue 23) — the embed tree path's getOptional swallow (load.ts:175-184) + marker gate.
import { describe, it, expect, vi } from "vitest";
import { openLibraryFromTree } from "./load.js";

type Handler = (path: string) => { status: number; body?: unknown };
// Real Response objects (not a { ok, status, json } partial): the tree path now reads through
// @render/core's HttpFilesystem, which consumes headers + arrayBuffer() rather than json().
function fetchImpl(handler: Handler): typeof fetch {
  return (async (u: string) => {
    const path = u.replace(/^.*\/tree\//, "");
    const r = handler(path);
    return new Response(r.body === undefined ? "absent" : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
}

const manifest = {
  "@context": "http://iiif.io/api/presentation/3/context.json",
  id: "m", type: "Manifest", label: { none: ["One"] },
  items: [{ id: "https://u/rd/canvas/o1", type: "Canvas", label: { none: ["o1"] }, height: 1, width: 1,
    items: [], annotations: [{ id: "https://u/rd/canvas/o1/annotations.json", type: "AnnotationPage", items: [] }] }],
};
const exhibits = { library: { id: "L", title: "L" }, exhibits: [{ slug: "rd", title: "One", order: 0 }], presentation: {} };

describe("PROBE embed openLibraryFromTree — readings.json 5xx during openExhibit (load.ts httpJsonSource.getOptional)", () => {
  it("readings.json 500 → readings:[] AND exhibit flagged incomplete (no silent complete) [rp1]", async () => {
    const f = fetchImpl((p) => {
      if (p === "archie.json") return { status: 404 };
      if (p === "exhibits.json") return { status: 200, body: exhibits };
      if (p.endsWith("manifest.json")) return { status: 200, body: manifest };
      if (p.endsWith("readings.json")) return { status: 500 }; // transient failure on an optional file
      return { status: 404 };
    });
    const lib = await openLibraryFromTree("https://h/tree/", f);
    const { exhibit } = await lib.openExhibit("rd");
    expect(exhibit.readings.length).toBe(0); // that layer degraded to empty
    expect((exhibit as { incomplete?: unknown }).incomplete).toBe(true); // but flagged partial
  });

  it("readings.json 404 → readings:[] and NOT flagged incomplete (genuine absence) [rp1]", async () => {
    const f = fetchImpl((p) => {
      if (p === "archie.json") return { status: 404 };
      if (p === "exhibits.json") return { status: 200, body: exhibits };
      if (p.endsWith("manifest.json")) return { status: 200, body: manifest };
      return { status: 404 }; // readings.json + everything optional genuinely absent
    });
    const lib = await openLibraryFromTree("https://h/tree/", f);
    const { exhibit } = await lib.openExhibit("rd");
    expect(exhibit.readings.length).toBe(0);
    expect((exhibit as { incomplete?: unknown }).incomplete).toBeUndefined();
  });

  it("foreign archie.json marker → rejected (tree gate already correct — ADR-0020)", async () => {
    const f = fetchImpl((p) => (p === "archie.json" ? { status: 200, body: { format: "not-archie" } } : { status: 404 }));
    await expect(openLibraryFromTree("https://h/tree/", f)).rejects.toThrow(/isn't an archie library/i);
  });
});
