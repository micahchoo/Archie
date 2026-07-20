import { describe, it, expect } from "vitest";
import { classifyIiifDocument, labelToString, manifestToExhibit, metadataEntriesFromPairs, ManifestImportError } from "./iiif-import.js";

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
  // Pin the VERBATIM user-facing text: add-to-exhibit scope keys off "Paste the URL of a single
  // manifest instead", so a reword here must break a test, not slip through.
  it("refuses collections with a pointer to paste a member manifest", () => {
    expect(() => manifestToExhibit({ type: "Collection", items: [] }, "u")).toThrow(ManifestImportError);
    expect(() => manifestToExhibit({ type: "Collection", items: [] }, "u")).toThrow(
      "This is a IIIF Collection (a list of manifests). Paste the URL of a single manifest instead.",
    );
  });
  it("refuses non-manifest JSON", () => {
    expect(() => manifestToExhibit({ hello: 1 }, "u")).toThrow(ManifestImportError);
    expect(() => manifestToExhibit({ hello: 1 }, "u")).toThrow("That URL didn't return a IIIF manifest.");
    expect(() => manifestToExhibit(null, "u")).toThrow("That URL didn't return a IIIF manifest.");
  });
  it("refuses a manifest with nothing readable", () => {
    expect(() => manifestToExhibit({ type: "Manifest", items: [{ type: "Canvas", items: [] }] }, "u")).toThrow(/no images or media/);
  });
});

describe("classifyIiifDocument — the shared type sniff", () => {
  it("classifies P3 and P2 manifests", () => {
    expect(classifyIiifDocument(P3)).toBe("manifest");
    expect(classifyIiifDocument(P2)).toBe("manifest");
    expect(classifyIiifDocument({ "@type": "sc:Manifest" })).toBe("manifest");
  });
  it("classifies P3 and P2 collections", () => {
    expect(classifyIiifDocument({ type: "Collection", items: [] })).toBe("collection");
    expect(classifyIiifDocument({ "@type": "sc:Collection" })).toBe("collection");
  });
  it("folds non-objects and unread shapes into 'unknown'", () => {
    expect(classifyIiifDocument(null)).toBe("unknown");
    expect(classifyIiifDocument("nope")).toBe("unknown");
    expect(classifyIiifDocument({ hello: 1 })).toBe("unknown");
  });
});

describe("metadataEntriesFromPairs — Dublin Core import mapping (Archie-c6bf)", () => {
  it("maps a preferred-label match to its dcterms property, no label override needed", () => {
    expect(metadataEntriesFromPairs([{ label: { none: ["Creator"] }, value: { none: ["Ada"] } }]))
      .toEqual([{ property: "dcterms:creator", value: "Ada" }]);
  });
  it("maps an alias (Author → dcterms:creator) and keeps the original label", () => {
    expect(metadataEntriesFromPairs([{ label: { en: ["Author"] }, value: { en: ["Babbage"] } }]))
      .toEqual([{ property: "dcterms:creator", label: "Author", value: "Babbage" }]);
  });
  it("keeps the original label when it differs from the preferred label (case counts as different)", () => {
    expect(metadataEntriesFromPairs([{ label: "date created", value: "1843" }]))
      .toEqual([{ property: "dcterms:created", label: "date created", value: "1843" }]);
  });
  it("imports an EXCLUDED-property label VERBATIM (never double-authors a native field)", () => {
    expect(metadataEntriesFromPairs([{ label: { none: ["Title"] }, value: { none: ["The Real Title"] } }]))
      .toEqual([{ label: "Title", value: "The Real Title" }]);
    expect(metadataEntriesFromPairs([{ label: "Rights", value: "All rights reserved" }]))
      .toEqual([{ label: "Rights", value: "All rights reserved" }]);
  });
  it("imports an unmatched label verbatim", () => {
    expect(metadataEntriesFromPairs([{ label: { none: ["Shelfmark"] }, value: { none: ["MS 408"] } }]))
      .toEqual([{ label: "Shelfmark", value: "MS 408" }]);
  });
  it("flattens a multi-valued language map into one repeated entry per value (first language wins)", () => {
    expect(metadataEntriesFromPairs([{ label: { none: ["Subject"] }, value: { none: ["Botany", "Cryptography"], de: ["Botanik"] } }]))
      .toEqual([
        { property: "dcterms:subject", value: "Botany" },
        { property: "dcterms:subject", value: "Cryptography" },
      ]);
  });
  it("reads P2 forms (@value / plain strings / arrays) and skips label-less or valueless pairs", () => {
    expect(metadataEntriesFromPairs([
      { label: "Author", value: { "@value": "Ada" } },
      { label: "Keywords", value: ["ciphers", { "@value": "herbals" }] },
      { value: "no label — skipped" },
      { label: "Empty", value: "   " },
    ])).toEqual([
      { property: "dcterms:creator", label: "Author", value: "Ada" },
      { property: "dcterms:subject", label: "Keywords", value: "ciphers" },
      { property: "dcterms:subject", label: "Keywords", value: "herbals" },
    ]);
  });
  it("returns [] for absent/garbage metadata", () => {
    expect(metadataEntriesFromPairs(undefined)).toEqual([]);
    expect(metadataEntriesFromPairs("nope")).toEqual([]);
  });
});

describe("manifestToExhibit — manifest-level descriptive data lands on the plan (Archie-c6bf)", () => {
  const p3 = {
    ...P3,
    summary: { none: ["A famous cipher manuscript."] },
    rights: "http://creativecommons.org/publicdomain/mark/1.0/",
    requiredStatement: { label: { none: ["Held by"] }, value: { none: ["Beinecke Library"] } },
    metadata: [
      { label: { none: ["Author"] }, value: { none: ["Unknown"] } },
      { label: { none: ["Shelfmark"] }, value: { none: ["MS 408"] } },
    ],
    items: [
      { ...P3.items[0]!, metadata: [{ label: { none: ["Date"] }, value: { none: ["15th century"] } }] },
      ...P3.items.slice(1),
    ],
  };
  const plan = manifestToExhibit(p3, "https://x.org/manifest.json");
  it("maps summary / rights / requiredStatement to the NATIVE fields", () => {
    expect(plan.summary).toBe("A famous cipher manuscript.");
    expect(plan.rights).toBe("http://creativecommons.org/publicdomain/mark/1.0/");
    expect(plan.requiredStatement).toEqual({ label: "Held by", value: "Beinecke Library" });
  });
  it("maps manifest metadata pairs to the exhibit's entries", () => {
    expect(plan.metadata).toEqual([
      { property: "dcterms:creator", label: "Author", value: "Unknown" },
      { label: "Shelfmark", value: "MS 408" },
    ]);
  });
  it("maps per-canvas metadata to that object's entries; metadata-free canvases carry none", () => {
    expect(plan.objects[0]!.metadata).toEqual([{ property: "dcterms:date", value: "15th century" }]);
    expect(plan.objects[1]!.metadata).toBeUndefined();
  });
  it("a plain manifest still yields a field-free plan (no empty keys)", () => {
    const bare = manifestToExhibit(P3, "https://x.org/manifest.json");
    expect(bare.summary).toBeUndefined();
    expect(bare.rights).toBeUndefined();
    expect(bare.requiredStatement).toBeUndefined();
    expect(bare.metadata).toBeUndefined();
  });
  it("reads the P2 forms (description / license / attribution)", () => {
    const p2 = { ...P2, description: "A legacy description.", license: "http://rightsstatements.org/vocab/InC/1.0/", attribution: "Y University" };
    const plan2 = manifestToExhibit(p2, "https://y.edu/manifest.json");
    expect(plan2.summary).toBe("A legacy description.");
    expect(plan2.rights).toBe("http://rightsstatements.org/vocab/InC/1.0/");
    expect(plan2.requiredStatement).toEqual({ label: "Attribution", value: "Y University" });
  });
});
