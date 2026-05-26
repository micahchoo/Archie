import { describe, it, expect } from "vitest";
import { toManifest, sectionsFromManifest } from "./manifest.js";
import type { Exhibit } from "../model/model.js";

// toManifest: Exhibit -> IIIF Presentation 3 Manifest with painting canvases (ADR-0001 / Q-1).

const base = "https://u.gh.io/lib/";

const imgExhibit: Exhibit = {
  id: "e1",
  slug: "renaissance",
  title: "Renaissance Portraits",
  summary: "A small show.",
  objects: [
    { id: "obj-a", source: "https://img/a.jpg", label: "Portrait A", width: 4000, height: 3000, format: "image/jpeg" },
    { id: "obj-b", source: "https://img/b.jpg", label: "Portrait B", width: 2000, height: 2500 },
  ],
};

describe("toManifest (IIIF P3)", () => {
  it("builds a Manifest with the P3 context, slug-based id, and language-mapped label", () => {
    const m = toManifest(imgExhibit, { baseUrl: base });
    expect(m["@context"]).toBe("http://iiif.io/api/presentation/3/context.json");
    expect(m.id).toBe(`${base}renaissance/manifest.json`);
    expect(m.type).toBe("Manifest");
    expect(m.label).toEqual({ none: ["Renaissance Portraits"] });
    expect(m.summary).toEqual({ none: ["A small show."] });
  });

  it("projects each Object to a Canvas in order, with a painting Image annotation", () => {
    const m = toManifest(imgExhibit, { baseUrl: base });
    expect(m.items).toHaveLength(2);
    const c0 = m.items[0]!;
    expect(c0.id).toBe(`${base}renaissance/canvas/obj-a`);
    expect(c0.width).toBe(4000);
    expect(c0.height).toBe(3000);
    const painting = c0.items[0]!.items[0]!;
    expect(painting.motivation).toBe("painting");
    expect(painting.body.type).toBe("Image");
    expect(painting.body.id).toBe("https://img/a.jpg");
    expect(painting.body.format).toBe("image/jpeg");
    expect(painting.target).toBe(c0.id);
  });

  it("attaches an Archie heads AnnotationPage reference per canvas (where notes load)", () => {
    const m = toManifest(imgExhibit, { baseUrl: base });
    const c0 = m.items[0]!;
    expect(c0.annotations?.[0]?.type).toBe("AnnotationPage");
    expect(c0.annotations?.[0]?.id).toContain("renaissance/canvas/obj-a");
  });

  it("projects narrative Sections to IIIF Ranges in manifest.structures (start = active canvas/region)", () => {
    const narrative: Exhibit = {
      id: "e3", slug: "story", title: "A Narrative",
      objects: [{ id: "oA", source: "https://img/a.jpg", label: "A", width: 100, height: 100 }],
      sections: [
        { id: "s1", title: "Opening", objectId: "oA", start: "xywh=10,10,40,40", prose: "Look here first." },
        { id: "s2", title: "Detail", objectId: "oA" },
      ],
    };
    const m = toManifest(narrative, { baseUrl: base });
    expect(m.structures).toHaveLength(2);
    const r0 = m.structures![0]!;
    expect(r0.type).toBe("Range");
    expect(r0.id).toBe(`${base}story/range/s1`);
    expect(r0.label).toEqual({ none: ["Opening"] });
    expect(r0.items[0]!.id).toBe(`${base}story/canvas/oA`);
    expect(r0.start?.id).toBe(`${base}story/canvas/oA#xywh=10,10,40,40`); // region start
    expect(m.structures![1]!.start?.id).toBe(`${base}story/canvas/oA`); // no region -> bare canvas
  });

  it("omits structures for a non-narrative exhibit (no sections)", () => {
    expect(toManifest(imgExhibit, { baseUrl: base }).structures).toBeUndefined();
  });

  it("sectionsFromManifest round-trips the narrative spine (inverse of toRanges; prose + region preserved)", () => {
    const sections = [
      { id: "s1", title: "Opening", objectId: "oA", start: "xywh=10,10,40,40", prose: "Look here first." },
      { id: "s2", title: "Detail", objectId: "oA" },
    ];
    const narrative: Exhibit = {
      id: "e3", slug: "story", title: "A Narrative",
      objects: [{ id: "oA", source: "https://img/a.jpg", label: "A", width: 100, height: 100 }],
      sections,
    };
    const m = toManifest(narrative, { baseUrl: base });
    expect(sectionsFromManifest(m)).toEqual(sections); // exact round-trip → Viewer can read the spine from the published tree
  });

  it("sectionsFromManifest returns [] when the manifest has no structures", () => {
    expect(sectionsFromManifest(toManifest(imgExhibit, { baseUrl: base }))).toEqual([]);
  });

  it("projects an AV (sound) object to a Canvas with duration + a Sound body", () => {
    const av: Exhibit = { id: "e2", slug: "audio", title: "Audio", objects: [{ id: "s1", source: "https://a/clip.mp3", label: "Clip", mediaType: "sound", duration: 120, format: "audio/mpeg" }] };
    const c = toManifest(av, { baseUrl: base }).items[0]!;
    expect(c.duration).toBe(120);
    expect(c.width).toBeUndefined();
    expect(c.items[0]!.items[0]!.body.type).toBe("Sound");
  });
});
