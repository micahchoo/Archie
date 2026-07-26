// READER seam tests. A live OSD can't run under happy-dom (read-mount.test.ts idiom), so we test the
// OFFLINE GATE and source classification — the parts that decide whether `createReadOnlyMount` is even
// reached. The mount itself (OSD construction) is covered at render-mount's seam, not re-tested here:
// @render/mount is MOCKED below, which also lets us assert the OPTIONS openObject wires into the mount
// (labelFor — Archie-9413; locator — Archie-6f25) without constructing OSD.
import { describe, it, expect, vi } from "vitest";
import { createReadOnlyMount } from "@render/mount";
import { isRemoteSource, openObject, labelFromAnnotations, OfflineRemoteBlockedError } from "./reader.js";
import type { AObject, W3CAnnotation } from "@render/core";

vi.mock("@render/mount", async (importOriginal) => ({
  // Spread the REAL module first: openObject's reading-mark pass (reading-marks.ts) calls the genuine
  // `overlayShapeFor` to work out which records the overlay will draw, and a mock that omitted it would
  // make the pass throw rather than degrade. Only the mount is faked — a live OSD can't run here.
  ...(await importOriginal<typeof import("@render/mount")>()),
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
