import { describe, it, expect } from "vitest";
import { annotationsIn, canvasObjectId, planWadmImport, sanitizeSelector } from "./wadm-import.js";

const CTX = { objectIds: new Set(["o1", "o2"]) };
const anno = (source: string, over: Record<string, unknown> = {}) => ({
  id: "https://elsewhere.org/anno/1",
  type: "Annotation",
  target: { type: "SpecificResource", source, selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1,2,3,4" } },
  body: [{ type: "TextualBody", value: "a note", purpose: "commenting" }],
  ...over,
});

describe("annotationsIn — tolerant of the shapes in the wild", () => {
  it("reads an AnnotationPage, a bare array, and a single Annotation", () => {
    expect(annotationsIn({ type: "AnnotationPage", items: [anno("x")] })).toHaveLength(1);
    expect(annotationsIn([anno("x"), anno("y")])).toHaveLength(2);
    expect(annotationsIn(anno("x"))).toHaveLength(1);
  });
  it("legacy sc:AnnotationList is REFUSED honestly, not half-parsed (on/resource grammar)", () => {
    const plan = planWadmImport({ "@type": "sc:AnnotationList", resources: [anno("x")] }, CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/older annotation format/);
  });
});

describe("canvasObjectId — re-anchoring by the /canvas/<id> tail", () => {
  it("extracts the object id from any publisher's canvas IRI", () => {
    expect(canvasObjectId("https://archie.demo/voynich/canvas/o1")).toBe("o1");
    expect(canvasObjectId("https://other.org/x/canvas/o2/")).toBe("o2");
    expect(canvasObjectId("https://other.org/no-canvas-here")).toBeNull();
  });
});

describe("planWadmImport", () => {
  it("re-anchors matching annotations, carrying selector and bodies verbatim", () => {
    const plan = planWadmImport({ type: "AnnotationPage", items: [anno("https://pub.org/lib/canvas/o1")] }, CTX);
    expect(plan.skipped).toEqual([]);
    expect(plan.notes).toEqual([{
      objectId: "o1",
      selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1,2,3,4" },
      body: [{ type: "TextualBody", value: "a note", purpose: "commenting" }],
    }]);
  });
  it("skips annotations whose canvas doesn't match an object here — never misplace scholarship", () => {
    const plan = planWadmImport([anno("https://pub.org/lib/canvas/o9")], CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/isn't in this exhibit/);
  });
  it("a string target with a fragment becomes a FragmentSelector; string bodies become TextualBody", () => {
    const plan = planWadmImport([{ type: "Annotation", target: "https://pub.org/lib/canvas/o2#xywh=5,6,7,8", body: "plain comment" }], CTX);
    expect(plan.notes).toEqual([{
      objectId: "o2",
      selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=5,6,7,8" },
      body: [{ type: "TextualBody", value: "plain comment", purpose: "commenting" }],
    }]);
  });
  it("skips selector-less and body-less annotations with reasons", () => {
    const noSel = { type: "Annotation", target: { source: "https://p.org/canvas/o1" }, body: "b" };
    const noBody = { ...anno("https://p.org/canvas/o1"), body: [] };
    const plan = planWadmImport([noSel, noBody], CTX);
    expect(plan.notes).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/region is missing or unreadable/),
      expect.stringMatching(/no usable note text/),
    ]);
  });
  it("non-annotation JSON fails up front with guidance", () => {
    expect(planWadmImport({ hello: 1 }, CTX).skipped[0]!.reason).toMatch(/No notes found/);
  });
  it("REBUILDS selectors and bodies — foreign fields and unsafe SVG never cross into the session", () => {
    expect(sanitizeSelector({ type: "SvgSelector", value: '<svg onload="alert(1)"><polygon points="0,0 1,1"/></svg>' })).toEqual({ err: "unsupported or unsafe region shape" });
    expect(sanitizeSelector({ type: "SvgSelector", value: "<svg><script>x</script></svg>" })).toEqual({ err: "unsupported or unsafe region shape" });
    expect(sanitizeSelector({ type: "FragmentSelector", value: "xywh=pixel:1,2,3,4", evil: "x" }))
      .toEqual({ ok: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=pixel:1,2,3,4" } });
    expect(sanitizeSelector({ type: "FragmentSelector", value: "xpointer(//div)" })).toEqual({ err: "unsupported region shape" });
    const plan = planWadmImport([anno("https://p.org/canvas/o1", { body: [{ type: "TextualBody", value: "keep", purpose: "commenting", format: "text/html", id: "x" }] })], CTX);
    expect(plan.notes[0]!.body).toEqual([{ type: "TextualBody", value: "keep", purpose: "commenting" }]);
  });
  it("unwraps a Choice selector to its first item; temporal t= fragments pass (AV)", () => {
    expect(sanitizeSelector({ type: "Choice", items: [{ type: "FragmentSelector", value: "t=12.5,20" }] }))
      .toEqual({ ok: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "t=12.5,20" } });
  });
});
