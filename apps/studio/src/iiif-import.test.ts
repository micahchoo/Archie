import { describe, it, expect } from "vitest";
import { labelToString, manifestToExhibit, ManifestImportError } from "./iiif-import.js";

const P3 = {
  "@context": "https://iiif.io/api/presentation/3/context.json",
  type: "Manifest",
  label: { none: ["The Whole Manuscript"] },
  items: [
    {
      type: "Canvas", label: { none: ["f1r — Herbal"] }, width: 800, height: 1000,
      items: [{ type: "AnnotationPage", items: [{ type: "Annotation", motivation: "painting", body: {
        type: "Image", id: "https://x.org/iiif/2/img1/full/full/0/default.jpg",
        service: [{ "@id": "https://x.org/iiif/2/img1", type: "ImageService2", profile: "level1" }],
      } }] }],
    },
    {
      type: "Canvas", label: { none: ["Kryptogramm (sonified)"] },
      items: [{ type: "AnnotationPage", items: [{ type: "Annotation", motivation: "painting", body: {
        type: "Sound", id: "https://archive.org/download/k/04.mp3",
      } }] }],
    },
    { type: "Canvas", label: { none: ["empty"] }, items: [] },
  ],
};

const P2 = {
  "@context": "http://iiif.io/api/presentation/2/context.json",
  "@type": "sc:Manifest",
  label: "A Legacy Book",
  sequences: [{ canvases: [
    { "@type": "sc:Canvas", label: "p. 1", width: 600, height: 900,
      images: [{ resource: { "@id": "https://y.edu/iiif/p1/full/full/0/default.jpg", service: { "@context": "http://iiif.io/api/image/2/context.json", "@id": "https://y.edu/iiif/p1", profile: "http://iiif.io/api/image/2/level1.json" } } }] },
  ] }],
};

describe("labelToString — P3 language maps and P2 strings", () => {
  it("reads P3 {none:[...]} and {en:[...]}", () => {
    expect(labelToString({ none: ["X"] }, "f")).toBe("X");
    expect(labelToString({ en: ["Y"] }, "f")).toBe("Y");
  });
  it("reads P2 plain strings and @value forms, with fallback", () => {
    expect(labelToString("Z", "f")).toBe("Z");
    expect(labelToString({ "@value": "W" }, "f")).toBe("W");
    expect(labelToString(undefined, "f")).toBe("f");
  });
});

describe("manifestToExhibit — Presentation 3", () => {
  const plan = manifestToExhibit(P3, "https://x.org/manifest.json");
  it("titles the exhibit from the manifest label", () => {
    expect(plan.title).toBe("The Whole Manuscript");
  });
  it("prefers the image service base over the direct URL (deep-zoomable source)", () => {
    expect(plan.objects[0]).toEqual({ source: "https://x.org/iiif/2/img1", label: "f1r — Herbal", width: 800, height: 1000 });
  });
  it("imports AV canvases with a mediaType and no dims", () => {
    expect(plan.objects[1]).toEqual({ source: "https://archive.org/download/k/04.mp3", label: "Kryptogramm (sonified)", mediaType: "sound" });
  });
  it("skips empty canvases", () => {
    expect(plan.objects).toHaveLength(2);
  });
});

describe("manifestToExhibit — service selection (real-world manifests)", () => {
  it("ignores non-Image services (auth/search) — only an Image API service may replace the body URL", () => {
    const m = { type: "Manifest", label: { none: ["Auth-gated"] }, items: [
      { type: "Canvas", width: 10, height: 10, items: [{ items: [{ body: {
        type: "Image", id: "https://x.org/direct.jpg",
        service: [{ "@id": "https://x.org/auth/login", profile: "http://iiif.io/api/auth/1/login" }],
      } }] }] },
    ] };
    expect(manifestToExhibit(m, "u").objects[0]!.source).toBe("https://x.org/direct.jpg");
  });
  it("AV bodies never take a service URL, and the canvas duration rides along", () => {
    const m = { type: "Manifest", label: { none: ["AV"] }, items: [
      { type: "Canvas", duration: 123.5, items: [{ items: [{ body: {
        type: "Sound", id: "https://a.org/rec.mp3",
        service: [{ "@id": "https://a.org/auth", profile: "http://iiif.io/api/auth/1/login" }],
      } }] }] },
    ] };
    expect(manifestToExhibit(m, "u").objects[0]).toEqual({ source: "https://a.org/rec.mp3", label: "Canvas 1", mediaType: "sound", duration: 123.5 });
  });
  it("an unmarked bare-@id service is NOT trusted as an image service — the direct URL wins", () => {
    const m = { type: "Manifest", label: { none: ["Bare"] }, items: [
      { type: "Canvas", items: [{ items: [{ body: { type: "Image", id: "https://x.org/direct.jpg", service: [{ "@id": "https://x.org/mystery" }] } }] }] },
    ] };
    expect(manifestToExhibit(m, "u").objects[0]!.source).toBe("https://x.org/direct.jpg");
  });
  it("falls back to the URL hostname when the manifest has no label", () => {
    const m = { type: "Manifest", items: [
      { type: "Canvas", items: [{ items: [{ body: { type: "Image", id: "https://x.org/i.jpg" } }] }] },
    ] };
    expect(manifestToExhibit(m, "https://gallica.bnf.fr/iiif/m.json").title).toBe("gallica.bnf.fr");
  });
});

describe("manifestToExhibit — Presentation 2 (legacy)", () => {
  const plan = manifestToExhibit(P2, "https://y.edu/m.json");
  it("walks sequences→canvases→images→resource", () => {
    expect(plan.title).toBe("A Legacy Book");
    expect(plan.objects).toEqual([{ source: "https://y.edu/iiif/p1", label: "p. 1", width: 600, height: 900 }]);
  });
});

describe("manifestToExhibit — refusals carry user-facing messages", () => {
  it("refuses collections with a pointer to paste a member manifest", () => {
    expect(() => manifestToExhibit({ type: "Collection", items: [] }, "u")).toThrow(ManifestImportError);
    expect(() => manifestToExhibit({ type: "Collection", items: [] }, "u")).toThrow(/Collection/);
  });
  it("refuses non-manifest JSON", () => {
    expect(() => manifestToExhibit({ hello: 1 }, "u")).toThrow(ManifestImportError);
    expect(() => manifestToExhibit(null, "u")).toThrow(ManifestImportError);
  });
  it("refuses a manifest with nothing readable", () => {
    expect(() => manifestToExhibit({ type: "Manifest", items: [{ type: "Canvas", items: [] }] }, "u")).toThrow(/no images or media/);
  });
});
