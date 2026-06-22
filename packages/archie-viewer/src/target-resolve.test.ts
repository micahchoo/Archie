// target-resolve.ts — the PURE cite-ladder + degrade-upward resolver (ADR-0018 / ADR-0021).
// Headless-testable in full (no OSD): every rung + every degrade edge is exercised here. The element
// only WIRES the returned fragment onto the live surface (that wiring is the PARTIAL bit, not this).
import { describe, it, expect } from "vitest";
import type { PortableExhibit, ViewerRoute, W3CAnnotation } from "@render/core";
import { resolveExhibitTarget } from "./target-resolve.js";

// --- fixtures: a 2-object exhibit with a base note (region selector + a logicalId) and 2 sections ----
function note(id: string, opts: { logicalId?: string; xywh?: string } = {}): W3CAnnotation {
  const a: W3CAnnotation = {
    id,
    type: "Annotation",
    target: opts.xywh
      ? { type: "SpecificResource", source: "canvas-1", selector: { type: "FragmentSelector", value: `xywh=${opts.xywh}` } }
      : "canvas-1",
  } as unknown as W3CAnnotation;
  if (opts.logicalId) (a as unknown as Record<string, unknown>)["archie:logicalId"] = opts.logicalId;
  return a;
}

function fixture(): PortableExhibit {
  return {
    slug: "voynich",
    title: "Voynich",
    objects: [
      { id: "obj-img", source: "blob:img", label: "Folio 1" },
      { id: "obj-av", source: "blob:audio", label: "Reading", mediaType: "sound", duration: 60 },
    ],
    annotationsByObject: {
      "obj-img": [note("note-1", { logicalId: "n1", xywh: "pixel:10,20,30,40" }), note("note-2")],
      "obj-av": [],
    },
    readingAnnotationsByObject: { "obj-img": {}, "obj-av": {} },
    readings: [],
    sections: [
      { id: "sec-1", title: "Open", objectId: "obj-img", start: "xywh=pixel:5,5,50,50" },
      { id: "sec-2", title: "Listen", objectId: "obj-av", start: "t=12.5,30" },
      { id: "sec-bad", title: "Ghost", objectId: "obj-gone" }, // points at a missing object
    ],
    canvasIdByObject: { "obj-img": "canvas-1", "obj-av": "canvas-2" },
  } as unknown as PortableExhibit;
}

const route = (r: Partial<Extract<ViewerRoute, { view: "exhibit" }>>): ViewerRoute => ({ view: "exhibit", slug: "voynich", ...r });

describe("EXHIBIT rung (slug only)", () => {
  it("opens the exhibit grid", () => {
    expect(resolveExhibitTarget(fixture(), route({}))).toEqual({ kind: "exhibit" });
  });
  it("a gallery route resolves to the gallery (defensive — element handles this above)", () => {
    expect(resolveExhibitTarget(fixture(), { view: "gallery" })).toEqual({ kind: "gallery" });
  });
});

describe("OBJECT rung (/o/<id>)", () => {
  it("opens the named object with no fragment", () => {
    expect(resolveExhibitTarget(fixture(), route({ objectId: "obj-av" }))).toEqual({ kind: "object", objectId: "obj-av" });
  });
  it("an unknown object degrades upward to the exhibit", () => {
    expect(resolveExhibitTarget(fixture(), route({ objectId: "nope" }))).toEqual({ kind: "exhibit", degraded: "object-not-found" });
  });
});

describe("NOTE rung (/a/<id> [+ xywh / t])", () => {
  it("resolves a note to its owning object (by raw id) and carries the raw select id", () => {
    const r = resolveExhibitTarget(fixture(), route({ noteId: "note-2" }));
    expect(r).toEqual({ kind: "object", objectId: "obj-img", selectId: "note-2" });
  });
  it("resolves a note by its archie:logicalId, but selects by the RAW annotation id", () => {
    const r = resolveExhibitTarget(fixture(), route({ noteId: "n1" }));
    expect(r.kind).toBe("object");
    expect(r.objectId).toBe("obj-img");
    expect(r.selectId).toBe("note-1"); // route id was the logical "n1"; overlay keys by raw a.id
  });
  it("frames the note's OWN region selector when the route carries no explicit xywh", () => {
    const r = resolveExhibitTarget(fixture(), route({ noteId: "note-1" }));
    expect(r).toEqual({ kind: "object", objectId: "obj-img", selectId: "note-1", fragment: { kind: "xywh", value: "pixel:10,20,30,40" } });
  });
  it("an explicit ?xywh on the route WINS over the note's own selector", () => {
    const r = resolveExhibitTarget(fixture(), route({ noteId: "note-1", xywh: "pixel:1,1,2,2" }));
    expect(r.fragment).toEqual({ kind: "xywh", value: "pixel:1,1,2,2" });
  });
  it("an explicit ?t on the route resolves a temporal fragment (seek-not-play is the surface's job)", () => {
    const r = resolveExhibitTarget(fixture(), route({ noteId: "note-2", t: "5,10" }));
    expect(r.fragment).toEqual({ kind: "t", value: "5,10" });
  });
  it("an unknown note id degrades upward to the exhibit (tombstoned cite, ADR-0003)", () => {
    expect(resolveExhibitTarget(fixture(), route({ noteId: "ghost" }))).toEqual({ kind: "exhibit", degraded: "note-not-found" });
  });
});

describe("SECTION rung (/s/<id>)", () => {
  it("opens the section's object framed at its xywh start", () => {
    const r = resolveExhibitTarget(fixture(), route({ sectionId: "sec-1" }));
    expect(r).toEqual({ kind: "object", objectId: "obj-img", fragment: { kind: "xywh", value: "pixel:5,5,50,50" } });
  });
  it("opens an AV section's object with a temporal (t) start", () => {
    const r = resolveExhibitTarget(fixture(), route({ sectionId: "sec-2" }));
    expect(r).toEqual({ kind: "object", objectId: "obj-av", fragment: { kind: "t", value: "12.5,30" } });
  });
  it("an unknown section id degrades upward to the exhibit", () => {
    expect(resolveExhibitTarget(fixture(), route({ sectionId: "nope" }))).toEqual({ kind: "exhibit", degraded: "section-not-found" });
  });
  it("a section pointing at a missing object degrades upward to the exhibit", () => {
    expect(resolveExhibitTarget(fixture(), route({ sectionId: "sec-bad" }))).toEqual({ kind: "exhibit", degraded: "section-not-found" });
  });
});
