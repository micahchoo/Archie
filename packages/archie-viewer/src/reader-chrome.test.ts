// Reader chrome — the note list (V70), object nav (V30) and reading legend (V56).
//
// These tests cover what a unit runtime CAN see: the pure projections, and the DOM the mount builds.
// What they deliberately do NOT claim is that any of it is REACHABLE — hit-testing, layout and the
// lazy-import boundary are all invisible to happy-dom, which is why recipes/smoke.mjs asserts every
// one of these capabilities against the built bundle in a real browser (ADR-0019's capability
// contract). See .claude/rules/osd-overlay-wrapper.md for the case that proved the difference.
import { describe, it, expect, vi } from "vitest";
import { readingMarkerStyle } from "@render/core";
import type { AObject, PortableExhibit, W3CAnnotation } from "@render/core";
import { mountReaderChrome, previewOf, positionLabel, readingColourById, BASE_MARK_COLOUR } from "./reader-chrome.js";

const note = (id: string, comment: string): W3CAnnotation =>
  ({
    id,
    target: { type: "SpecificResource", source: "c1", selector: { type: "FragmentSelector", value: "xywh=1,2,3,4" } },
    body: [{ type: "TextualBody", value: comment, purpose: "commenting" }],
  }) as unknown as W3CAnnotation;

const obj = (id: string, label: string): AObject => ({ id, label, source: "blob:x" } as AObject);

const exhibit = (over: Partial<PortableExhibit> = {}): PortableExhibit =>
  ({
    slug: "e1",
    title: "An exhibit",
    objects: [obj("o1", "Plate one"), obj("o2", "Plate two"), obj("o3", "Plate three")],
    annotationsByObject: { o1: [note("a1", "The first note"), note("a2", "The second note")] },
    readingAnnotationsByObject: { o1: { cipher: [note("r1", "A cipher reading")] } },
    readings: [{ id: "cipher", name: "Cipher reading", colour: "#3a6b4c", description: "A cipher." }],
    sections: [],
    canvasIdByObject: {},
    ...over,
  }) as unknown as PortableExhibit;

function mount(ex: PortableExhibit, annotations: W3CAnnotation[], activeReading: string | null = null) {
  const aside = document.createElement("div");
  const surface = document.createElement("div");
  document.body.append(aside, surface);
  const calls = { select: [] as string[], reading: [] as (string | null)[], step: [] as string[], overview: 0 };
  const chrome = mountReaderChrome(aside, surface, {
    exhibit: ex,
    object: ex.objects[0]!,
    annotations,
    activeReading,
    onselect: (id) => calls.select.push(id),
    onreading: (id) => calls.reading.push(id),
    onstep: (id) => calls.step.push(id),
    onoverview: () => { calls.overview += 1; },
  });
  return { aside, surface, chrome, calls };
}

describe("previewOf — a row shows the note's own words", () => {
  it("strips markdown and collapses whitespace", () => {
    expect(previewOf(note("a1", "**Bold**  and\n_italic_"))).toBe("Bold and italic");
  });

  it("caps a long body rather than letting one note own the pane", () => {
    const p = previewOf(note("a1", "x".repeat(400)));
    expect(p.length).toBe(180);
    expect(p.endsWith("…")).toBe(true);
  });

  it("an empty body still names the row — never a bare id", () => {
    // The failure this guards is the audit's own wording: a list that reads `annotation <rawULID>` is
    // not an index, it is a list of opaque handles.
    expect(previewOf(note("a1", "   "))).toBe("Untitled note");
  });
});

describe("positionLabel — the shell's exact stepper string", () => {
  it("is 1-based and names the unit", () => {
    expect(positionLabel(0, 12, "Object")).toBe("Object 1 of 12");
    expect(positionLabel(5, 6, "Section")).toBe("Section 6 of 6");
  });
});

describe("readingColourById — membership, not inheritance", () => {
  it("maps only the notes that belong to a reading; base notes are absent", () => {
    const m = readingColourById(exhibit(), "o1");
    expect(m).toEqual({ r1: "#3a6b4c" });
    expect(m["a1"]).toBeUndefined();
  });

  it("a reading with no colour contributes nothing (the legend falls back, the map does not lie)", () => {
    const ex = exhibit({ readings: [{ id: "cipher", name: "Cipher reading" }] });
    expect(readingColourById(ex, "o1")).toEqual({});
  });
});

describe("V70 — the note list is the index", () => {
  it("renders one row per note on the canvas, with its words", () => {
    const ex = exhibit();
    const { aside } = mount(ex, ex.annotationsByObject["o1"]!);
    const rows = [...aside.querySelectorAll<HTMLButtonElement>(".rc-notes button")];
    expect(rows.map((r) => r.textContent)).toEqual(["The first note", "The second note"]);
  });

  it("a row click reports the note id — the door the marker used to be the only one of", () => {
    const ex = exhibit();
    const { aside, calls } = mount(ex, ex.annotationsByObject["o1"]!);
    aside.querySelector<HTMLButtonElement>('.rc-notes button[data-note="a2"]')!.click();
    expect(calls.select).toEqual(["a2"]);
  });

  it("setSelected marks the row current, and moves the mark when selection moves", () => {
    const ex = exhibit();
    const { aside, chrome } = mount(ex, ex.annotationsByObject["o1"]!);
    chrome.setSelected("a1");
    expect(aside.querySelector('[data-note="a1"]')!.getAttribute("aria-current")).toBe("true");
    chrome.setSelected("a2");
    expect(aside.querySelector('[data-note="a1"]')!.hasAttribute("aria-current")).toBe(false);
    expect(aside.querySelector('[data-note="a2"]')!.getAttribute("aria-current")).toBe("true");
  });

  it("an object with no notes says so instead of rendering an empty list", () => {
    const { aside } = mount(exhibit(), []);
    expect(aside.querySelector(".rc-notes")).toBeNull();
    expect(aside.querySelector(".rc-empty")!.textContent).toMatch(/No notes/);
  });
});

describe("V30 — object navigation", () => {
  it("a multi-object exhibit gets Back to Exhibit AND a working stepper", () => {
    const ex = exhibit();
    const { aside, calls } = mount(ex, []);
    expect(aside.querySelector(".rc-pos")!.textContent).toBe("Object 1 of 3");
    aside.querySelector<HTMLButtonElement>('[data-act="next"]')!.click();
    expect(calls.step).toEqual(["o2"]);
    aside.querySelector<HTMLButtonElement>('[data-act="overview"]')!.click();
    expect(calls.overview).toBe(1);
  });

  it("the first object's Prev is disabled, not missing — the position stays legible", () => {
    const { aside } = mount(exhibit(), []);
    expect(aside.querySelector<HTMLButtonElement>('[data-act="prev"]')!.disabled).toBe(true);
    expect(aside.querySelector<HTMLButtonElement>('[data-act="next"]')!.disabled).toBe(false);
  });

  it("a single-object exhibit keeps the way UP even with no siblings to step", () => {
    const ex = exhibit({ objects: [obj("o1", "Only plate")] });
    const { aside } = mount(ex, []);
    expect(aside.querySelector('[data-act="overview"]')).not.toBeNull();
    expect(aside.querySelector(".rc-stepper")).toBeNull();
  });
});

describe("V56 — the reading legend", () => {
  it("offers the base layer plus every reading that has notes on THIS object", () => {
    const ex = exhibit();
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!);
    const opts = [...surface.querySelectorAll(".rc-legend .rc-opt")];
    expect(opts.map((o) => o.querySelector(".rc-nm")!.textContent)).toEqual(["General notes", "Cipher reading"]);
    expect(opts.map((o) => o.querySelector(".rc-ct")!.textContent)).toEqual(["2", "1"]);
  });

  it("a reading with no notes on this object is not offered (immarkus: rows track active state)", () => {
    const ex = exhibit({
      readings: [
        { id: "cipher", name: "Cipher reading", colour: "#3a6b4c" },
        { id: "hoax", name: "Hoax reading", colour: "#a3553a" },
      ],
    });
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!);
    const names = [...surface.querySelectorAll(".rc-legend .rc-nm")].map((n) => n.textContent);
    expect(names).toEqual(["General notes", "Cipher reading"]);
  });

  it("the swatch IS the mark — its numbers come from readingMarkerStyle, not a local copy", () => {
    const ex = exhibit();
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!);
    const want = readingMarkerStyle("#3a6b4c", "normal");
    const rect = surface.querySelector('.rc-opt[data-reading="cipher"] .rc-sw rect')!;
    expect(rect.getAttribute("stroke")).toBe(want.stroke);
    expect(rect.getAttribute("stroke-opacity")).toBe(String(want.strokeOpacity));
    expect(rect.getAttribute("fill-opacity")).toBe(String(want.fillOpacity));
    expect(rect.getAttribute("stroke-width")).toBe(String(want.strokeWidth));
  });

  it("the base swatch uses the SAME constant the canvas paints base notes with", () => {
    const ex = exhibit();
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!);
    expect(surface.querySelector('.rc-opt[data-reading=""] .rc-sw rect')!.getAttribute("stroke"))
      .toBe(readingMarkerStyle(BASE_MARK_COLOUR, "normal").stroke);
  });

  it("the active layer is the checked radio, and its description is shown", () => {
    const ex = exhibit();
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!, "cipher");
    expect(surface.querySelector('.rc-opt[data-reading="cipher"]')!.getAttribute("aria-checked")).toBe("true");
    expect(surface.querySelector('.rc-opt[data-reading=""]')!.getAttribute("aria-checked")).toBe("false");
    expect(surface.querySelector(".rc-desc")!.textContent).toBe("A cipher.");
  });

  it("picking a layer reports it; the base layer reports null, not an empty string", () => {
    const ex = exhibit();
    const { surface, calls } = mount(ex, ex.annotationsByObject["o1"]!, "cipher");
    surface.querySelector<HTMLButtonElement>('.rc-opt[data-reading=""]')!.click();
    expect(calls.reading).toEqual([null]);
  });

  it("an exhibit with no readings renders no legend at all", () => {
    const ex = exhibit({ readings: [], readingAnnotationsByObject: {} });
    const { surface } = mount(ex, ex.annotationsByObject["o1"]!);
    expect(surface.querySelector(".rc-legend")).toBeNull();
  });
});

describe("teardown", () => {
  it("destroy removes the pane, the legend AND the stylesheet it injected", () => {
    const ex = exhibit();
    const { aside, surface, chrome } = mount(ex, ex.annotationsByObject["o1"]!);
    const root = aside.getRootNode() as Document;
    const before = root.querySelectorAll("style[data-archie-chrome]").length;
    expect(before).toBeGreaterThan(0);
    chrome.destroy();
    expect(aside.querySelector(".rc-aside")).toBeNull();
    expect(surface.querySelector(".rc-legend")).toBeNull();
    // An orphaned <style> per object open is the leak this guards (the shadow root is re-rendered
    // wholesale, but the AV/legend path mounts into a live tree).
    expect(root.querySelectorAll("style[data-archie-chrome]").length).toBe(before - 1);
  });
});

describe("the list never builds markup from note bodies", () => {
  it("a body carrying HTML lands as TEXT in the row", () => {
    const ex = exhibit();
    const { aside } = mount(ex, [note("a1", "<img src=x onerror=alert(1)>hello")]);
    const row = aside.querySelector<HTMLButtonElement>(".rc-notes button")!;
    expect(row.querySelector("img")).toBeNull();
    expect(row.textContent).toContain("hello");
  });
});

describe("scrollIntoView is optional", () => {
  it("a row without the method (older engines / happy-dom) does not throw on select", () => {
    const ex = exhibit();
    const { aside, chrome } = mount(ex, ex.annotationsByObject["o1"]!);
    const row = aside.querySelector<HTMLButtonElement>('[data-note="a1"]')!;
    // Deliberately remove it: the mount uses optional call syntax precisely because a list row is not
    // guaranteed to implement it in every runtime the embed lands in.
    (row as unknown as { scrollIntoView?: unknown }).scrollIntoView = undefined;
    expect(() => chrome.setSelected("a1")).not.toThrow();
    vi.restoreAllMocks();
  });
});
