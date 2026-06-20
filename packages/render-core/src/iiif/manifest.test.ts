import { describe, it, expect } from "vitest";
import { toManifest, sectionsFromManifest, sectionToAnnotation, sectionsToAnnotationCollection } from "./manifest.js";
import type { Exhibit } from "../model/model.js";
import type { W3CSpecificResource, W3CTextualBody } from "../wadm/types.js";

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
    expect(m["@context"]).toBe("https://iiif.io/api/presentation/3/context.json");
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

  it("declares an ImageService2 + sized thumbnail for a IIIF-service-base source (routed through resolveTileSource/thumbnailUrl)", () => {
    const svc: Exhibit = {
      id: "e4", slug: "iiif", title: "IIIF",
      objects: [{ id: "obj-s", source: "https://iiif.example.org/iiif/2/folio", label: "Folio", width: 6000, height: 8000 }],
    };
    const c = toManifest(svc, { baseUrl: base }).items[0]!;
    const body = c.items[0]!.items[0]!.body;
    expect(body.service).toEqual([{ id: "https://iiif.example.org/iiif/2/folio", type: "ImageService2", profile: "level2" }]);
    expect(c.thumbnail).toEqual([{ id: "https://iiif.example.org/iiif/2/folio/full/240,/0/default.jpg", type: "Image" }]);
  });

  it("does NOT declare a service/thumbnail for a plain raster source, a blob: URL, or a disallowed scheme", () => {
    const ex: Exhibit = {
      id: "e5", slug: "mixed", title: "Mixed",
      objects: [
        { id: "raster", source: "https://img/a.jpg", label: "Raster" },
        { id: "blob", source: "blob:https://app/abc", label: "Blob" },
        { id: "evil", source: "javascript:alert(1)", label: "Evil" },
      ],
    };
    for (const c of toManifest(ex, { baseUrl: base }).items) {
      expect(c.items[0]!.items[0]!.body.service).toBeUndefined();
      expect(c.thumbnail).toBeUndefined();
    }
  });

  it("projects an AV (sound) object to a Canvas with duration + a Sound body", () => {
    const av: Exhibit = { id: "e2", slug: "audio", title: "Audio", objects: [{ id: "s1", source: "https://a/clip.mp3", label: "Clip", mediaType: "sound", duration: 120, format: "audio/mpeg" }] };
    const c = toManifest(av, { baseUrl: base }).items[0]!;
    expect(c.duration).toBe(120);
    expect(c.width).toBeUndefined();
    expect(c.items[0]!.items[0]!.body.type).toBe("Sound");
  });
});

describe("Section → WADM annotation (ADR-0017: additive, all-round-compatible export)", () => {
  const narrative: Exhibit = {
    id: "e3", slug: "story", title: "A Narrative",
    objects: [{ id: "oA", source: "https://img/a.jpg", label: "A", width: 100, height: 100 }],
    sections: [
      { id: "s1", title: "Opening", objectId: "oA", start: "xywh=10,10,40,40", prose: "Look here first." },
      { id: "s2", title: "Detail", objectId: "oA" },
    ],
  };

  it("bakes the Range affordances into a supplementing annotation (title→label, region→FragmentSelector, prose→describing body, position→archie:order)", () => {
    const a = sectionToAnnotation(narrative.sections![0]!, 0, `${base}story`);
    expect(a.type).toBe("Annotation");
    expect(a.id).toBe(`${base}story/section/s1`);
    expect(a.motivation).toBe("supplementing");
    expect(a.label).toEqual({ none: ["Opening"] });
    expect(a["archie:role"]).toBe("section");
    expect(a["archie:order"]).toBe(0);
    const t = a.target as W3CSpecificResource;
    expect(t.source).toBe(`${base}story/canvas/oA`);
    expect(t.selector).toEqual({ type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: "xywh=10,10,40,40" });
    expect(a.body as W3CTextualBody).toEqual({ type: "TextualBody", value: "Look here first.", format: "text/html", purpose: "describing" });
  });

  it("carries NO archie DAG fields, so the reload importer ignores it (no double-count with the structures[] Range)", () => {
    const a = sectionToAnnotation(narrative.sections![0]!, 0, `${base}story`) as unknown as Record<string, unknown>;
    for (const k of ["archie:logicalId", "archie:rev", "archie:version", "archie:lastEditor"]) expect(a[k]).toBeUndefined();
  });

  it("targets the bare canvas and emits no body when a Section has no region or prose", () => {
    const a = sectionToAnnotation(narrative.sections![1]!, 1, `${base}story`);
    expect(a.target).toBe(`${base}story/canvas/oA`);
    expect(a.body).toBeUndefined();
    expect(a["archie:order"]).toBe(1);
  });

  it("sectionsToAnnotationCollection emits one self-contained ordered collection (WADM_CONTEXT at collection level; section-annotations inline in spine order)", () => {
    const coll = sectionsToAnnotationCollection(narrative, { baseUrl: base })!;
    expect(coll.type).toBe("AnnotationCollection");
    expect(coll["@context"]).toBe("https://www.w3.org/ns/anno.jsonld");
    expect(coll.id).toBe(`${base}story/annotations/narrative.json`);
    expect(coll.total).toBe(2);
    expect(coll.first?.type).toBe("AnnotationPage");
    expect(coll.first?.items.map((i) => i.id)).toEqual([`${base}story/section/s1`, `${base}story/section/s2`]);
    expect(coll.first?.partOf).toEqual({ id: coll.id, type: "AnnotationCollection" });
  });

  it("returns undefined for a non-narrative exhibit (nothing to write)", () => {
    expect(sectionsToAnnotationCollection(imgExhibit, { baseUrl: base })).toBeUndefined();
  });

  it("links each IIIF Range to the narrative collection via supplementary (the IIIF Pres 3 §5.4 bridge)", () => {
    const m = toManifest(narrative, { baseUrl: base });
    const collId = `${base}story/annotations/narrative.json`;
    for (const r of m.structures!) expect(r.supplementary).toEqual({ id: collId, type: "AnnotationCollection" });
  });
});
