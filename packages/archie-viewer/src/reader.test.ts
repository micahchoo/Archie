// READER seam tests. A live OSD can't run under happy-dom (read-mount.test.ts idiom), so we test the
// OFFLINE GATE and source classification — the parts that decide whether `createReadOnlyMount` is even
// reached. The mount itself (OSD construction) is covered at render-mount's seam, not re-tested here:
// @render/mount is MOCKED below, which also lets us assert the OPTIONS openObject wires into the mount
// (labelFor — Archie-9413; locator — Archie-6f25) without constructing OSD.
import { describe, it, expect, vi } from "vitest";
import { createReadOnlyMount } from "@render/mount";
import { readingMarkerStyle } from "@render/core";
import { isRemoteSource, openObject, labelFromAnnotations, OfflineRemoteBlockedError } from "./reader.js";
import { BASE_MARK_COLOUR } from "./reader-chrome.js";
import type { AObject, W3CAnnotation } from "@render/core";

// The mount is faked — a live OSD can't run under happy-dom (read-mount.test.ts idiom). Phase 7:
// reader.ts no longer reaches back into the REAL @render/mount for anything (the reading-marks
// post-pass that needed overlayShapeFor is gone — the style channel lives in the mount's own
// draw), so the mock no longer has to spread the real module.
vi.mock("@render/mount", () => ({
  createReadOnlyMount: vi.fn(async () => ({
    setAnnotations: vi.fn(),
    setSelected: vi.fn(),
    fitBounds: vi.fn(),
    fitRegion: vi.fn(),
    onSelect: vi.fn(() => () => {}),
    destroy: vi.fn(),
  })),
}));

const obj = (over: Partial<AObject>): AObject =>
  ({ id: "o1", source: "blob:fake", label: "Plate", ...over } as AObject);

const noteAnn = (id: string, comment?: string): W3CAnnotation =>
  ({
    id,
    target: { type: "SpecificResource", source: "c1", selector: { type: "FragmentSelector", value: "xywh=1,2,3,4" } },
    ...(comment !== undefined ? { body: [{ type: "TextualBody", value: comment, purpose: "commenting" }] } : {}),
  }) as unknown as W3CAnnotation;

describe("isRemoteSource — embedded (blob/data) is local, everything else is remote", () => {
  it("blob: source is local", () => {
    expect(isRemoteSource(obj({ source: "blob:abc" }))).toBe(false);
  });
  it("data: source is local", () => {
    expect(isRemoteSource(obj({ source: "data:image/png;base64,AAAA" }))).toBe(false);
  });
  it("https IIIF info.json is remote", () => {
    expect(isRemoteSource(obj({ source: "https://iiif.example.org/o1/info.json" }))).toBe(true);
  });
  it("a structured tileSource pointing at https is remote", () => {
    expect(isRemoteSource(obj({ source: "blob:abc", tileSource: { url: "https://t/0/0/0.png" } as never }))).toBe(true);
  });
  it("a structured tileSource of only blob URLs is local", () => {
    expect(isRemoteSource(obj({ source: "ignored", tileSource: { url: "blob:tiles" } as never }))).toBe(false);
  });
});

describe("openObject — offline gate refuses a remote source BEFORE touching OSD", () => {
  it("offline + remote source throws OfflineRemoteBlockedError (no mount attempted)", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    await expect(
      openObject(container, { object: obj({ source: "https://iiif.example.org/o1/info.json" }), annotations: [], offline: true }),
    ).rejects.toBeInstanceOf(OfflineRemoteBlockedError);
    expect(createReadOnlyMount).not.toHaveBeenCalled();
  });
});

describe("labelFromAnnotations — human names for overlay shapes (Archie-9413)", () => {
  it("returns the note's first comment line as plain text (markdown stripped)", () => {
    const label = labelFromAnnotations([noteAnn("a1", "**Sun face** in the margin\nSecond line detail")]);
    expect(label("a1")).toBe("Sun face in the margin");
  });

  it("skips leading blank lines to reach the first real line", () => {
    const label = labelFromAnnotations([noteAnn("a1", "\n\n# Heading note\nbody")]);
    expect(label("a1")).toBe("Heading note");
  });

  it("a markdown-only FIRST line (image) is skipped — the real text below announces, not the raw id", () => {
    const label = labelFromAnnotations([noteAnn("a1", "![figure](url)\nThe sun face")]);
    expect(label("a1")).toBe("The sun face");
  });

  it("a whitespace-only comment falls back to the annotation <id> form", () => {
    const label = labelFromAnnotations([noteAnn("a1", "   \n  ")]);
    expect(label("a1")).toBe("annotation a1");
  });

  it("a markdown-only comment (nothing but an image) falls back to the annotation <id> form", () => {
    const label = labelFromAnnotations([noteAnn("a1", "![](x)")]);
    expect(label("a1")).toBe("annotation a1");
  });

  it("unknown id falls back to the annotation <id> form", () => {
    const label = labelFromAnnotations([noteAnn("a1", "hi")]);
    expect(label("missing")).toBe("annotation missing");
  });

  it("a note with no comment body announces the canonical (untitled)", () => {
    const label = labelFromAnnotations([noteAnn("a1")]);
    expect(label("a1")).toBe("(untitled)");
  });

  it("never reads selector values — label comes from the body only", () => {
    const ann = noteAnn("a1", "Safe name");
    const label = labelFromAnnotations([ann]);
    expect(label("a1")).toBe("Safe name");
    expect(label("a1")).not.toContain("xywh");
  });
});

describe("openObject — mount options wiring (Archie-9413 labelFor, Archie-6f25 locator)", () => {
  it("passes locator:true and a labelFor derived from the object's annotations", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    const surface = await openObject(container, {
      object: obj({ source: "blob:fake" }),
      annotations: [noteAnn("a1", "**Sun face** in the margin")],
    });
    expect(createReadOnlyMount).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(createReadOnlyMount).mock.calls[0]![1];
    expect(opts.locator).toBe(true);
    expect(opts.labelFor?.("a1")).toBe("Sun face in the margin");
    expect(opts.labelFor?.("nope")).toBe("annotation nope");
    // The surface got the annotations (the overlay draw path).
    expect(surface.setAnnotations).toHaveBeenCalled();
  });
});

describe("openObject — colours applied AT DRAW TIME via the mount's style channel (V56, Phase 7)", () => {
  it("derives the style resolver from the reading colours — readingMarkerStyle numbers, BASE fallback", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    const readingAnn = noteAnn("a1", "**Sun face** in the margin");
    await openObject(container, {
      object: obj({ source: "blob:fake" }),
      annotations: [readingAnn, noteAnn("a2", "base note")],
      markColourOf: (id) => (id === "a1" ? "#3a6b4c" : undefined),
    });
    const styleFor = vi.mocked(createReadOnlyMount).mock.calls[0]![1].styleFor!;
    expect(typeof styleFor).toBe("function"); // the mount styles each mark at draw time — no post-pass

    // A note ON the reading takes the reading's colour, with the ONE canonical style numbers
    // (readingMarkerStyle — the same call the legend swatches make; no second copy of 0.18/0.95/2).
    const want = readingMarkerStyle("#3a6b4c", "normal");
    expect(styleFor("a1", readingAnn)).toEqual({
      stroke: want.stroke, fill: want.fill,
      fillOpacity: String(want.fillOpacity), strokeOpacity: String(want.strokeOpacity),
      strokeWidth: String(want.strokeWidth),
    });
    // A base note (no reading colour) takes BASE_MARK_COLOUR — the chip and the mark agree.
    const base = readingMarkerStyle(BASE_MARK_COLOUR, "normal");
    const baseStyle = styleFor("a2", noteAnn("a2"));
    expect(baseStyle!.stroke).toBe(base.stroke);
    expect(baseStyle!.strokeOpacity).toBe(String(base.strokeOpacity));
  });

  it("absent markColourOf styles every mark with the BASE colour (the old post-pass default)", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    await openObject(container, { object: obj({ source: "blob:fake" }), annotations: [noteAnn("a1")] });
    const styleFor = vi.mocked(createReadOnlyMount).mock.calls[0]![1].styleFor!;
    const base = readingMarkerStyle(BASE_MARK_COLOUR, "normal");
    expect(styleFor("a1", noteAnn("a1"))!.fill).toBe(base.fill);
  });
});

describe("openObject — the surface owns its note card (Phase 7 openNote contract)", () => {
  it("openNote selects + fits + shows the body in the surface's own card; unknown id → false, no-op", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    const surface = await openObject(container, {
      object: obj({ source: "blob:fake" }),
      annotations: [noteAnn("a1", "**Sun face** in the margin")],
    });

    // The card mounted into the container (no noteCardHost given → the mount container).
    const card = container.querySelector<HTMLElement>(".archie-note-card");
    expect(card).not.toBeNull();
    expect(card!.hidden).toBe(true); // nothing open yet

    const created = await vi.mocked(createReadOnlyMount).mock.results[0]!.value;

    expect(surface.openNote("a1")).toBe(true);
    expect(created.setSelected).toHaveBeenCalledWith("a1");
    expect(created.fitBounds).toHaveBeenCalledWith("a1");
    expect(card!.hidden).toBe(false);
    expect(card!.textContent).toContain("Sun face in the margin"); // markdown stripped, sanitized

    // An unknown id opens nothing — the S1 rule's "don't style a row that didn't open" needs the truth.
    const before = created.setSelected.mock.calls.length;
    expect(surface.openNote("nope")).toBe(false);
    expect(created.setSelected.mock.calls.length).toBe(before);
  });

  it("destroy() tears the card down with the surface", async () => {
    vi.mocked(createReadOnlyMount).mockClear();
    const container = document.createElement("div");
    const surface = await openObject(container, { object: obj({ source: "blob:fake" }), annotations: [] });
    expect(container.querySelector(".archie-note-card")).not.toBeNull();
    surface.destroy();
    expect(container.querySelector(".archie-note-card")).toBeNull();
  });
});
