import { describe, it, expect } from "vitest";
import { toCollection } from "./collection.js";
import { toExhibitsJson, toReadingCollection, shouldRenderGallery, shouldRenderGalleryFromJson } from "./exhibits.js";
import type { AObject, Exhibit, Library } from "../model/model.js";
import { asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";

const base = "https://u.gh.io/lib/";
const lib: Library = {
  id: asLibraryId("lib1"),
  title: "My Library",
  summary: "Things.",
  exhibits: [
    { id: asExhibitId("e1"), slug: "a", title: "Exhibit A", cover: "https://img/a-cover.jpg", summary: "first", objects: [] },
    { id: asExhibitId("e2"), slug: "b", title: "Exhibit B", objects: [] },
  ],
};

describe("toCollection (Library -> IIIF Collection)", () => {
  it("builds a Collection referencing each Exhibit's manifest, in order", () => {
    const c = toCollection(lib, { baseUrl: base });
    expect(c.type).toBe("Collection");
    expect(c["@context"]).toBe("https://iiif.io/api/presentation/3/context.json");
    expect(c.label).toEqual({ none: ["My Library"] });
    expect(c.items.map((i) => i.id)).toEqual([`${base}a/manifest.json`, `${base}b/manifest.json`]);
    expect(c.items[0]!.thumbnail?.[0]?.id).toBe("https://img/a-cover.jpg");
  });
  it("falls back to a default label when the Library has no title", () => {
    const c = toCollection({ id: asLibraryId("x"), exhibits: [] }, {});
    expect(c.label.none?.[0]).toBeTruthy();
  });
});

describe("toExhibitsJson (the Gallery source — UX-Q7 schema-forward)", () => {
  it("emits a top-level library object + ordered exhibit cards + reserved presentation ns", () => {
    const j = toExhibitsJson(lib);
    expect(j.library).toEqual({ id: "lib1", title: "My Library", summary: "Things." });
    expect(j.exhibits).toEqual([
      { slug: "a", title: "Exhibit A", cover: "https://img/a-cover.jpg", description: "first", order: 0 },
      { slug: "b", title: "Exhibit B", order: 1 },
    ]);
    expect(j.presentation).toEqual({}); // reserved for v1.1 curation (additive, not a migration)
  });

  it("carries the UNLISTED lever onto the card only when set — default LISTED (Archie-77b2)", () => {
    const withFlag: Library = {
      id: asLibraryId("lib2"),
      exhibits: [
        { id: asExhibitId("e1"), slug: "shown", title: "Shown", objects: [] },
        { id: asExhibitId("e2"), slug: "hidden", title: "Hidden", objects: [], unlisted: true },
      ],
    };
    const j = toExhibitsJson(withFlag);
    expect(j.exhibits[0]).toEqual({ slug: "shown", title: "Shown", order: 0 }); // no `unlisted` key when absent
    expect("unlisted" in j.exhibits[0]!).toBe(false);
    expect(j.exhibits[1]).toEqual({ slug: "hidden", title: "Hidden", order: 1, unlisted: true });
  });
});

describe("toExhibitsJson cover fallback (thumbnail-mitigations gap 5 — derive from the first image object)", () => {
  const obj = (id: string, over: Partial<AObject> = {}): AObject => ({ id: asObjectId(id), source: `https://img/${id}.jpg`, label: id, ...over });
  const exOf = (slug: string, objects: AObject[], cover?: string): Exhibit =>
    ({ id: asExhibitId(slug), slug, title: slug, objects, ...(cover !== undefined ? { cover } : {}) });
  const cardOf = (e: Exhibit) => toExhibitsJson({ id: asLibraryId("x"), exhibits: [e] }).exhibits[0]!;

  it("an authored cover always wins over derivation", () => {
    const e = exOf("a", [obj("o1")], "https://img/authored.jpg");
    expect(cardOf(e).cover).toBe("https://img/authored.jpg");
  });
  it("derives from the FIRST image object, skipping earlier AV (the AV-first exhibit gets a picture card)", () => {
    const e = exOf("a", [obj("wave", { source: "https://x/wave.mp3", mediaType: "sound" }), obj("photo", { mediaType: "image" })]);
    expect(cardOf(e).cover).toBe("https://img/photo.jpg");
  });
  it("skips an xyz-map basemap (thumbKind parity: a map is not an image, even with mediaType unset)", () => {
    const e = exOf("a", [
      obj("map", { tileSource: { kind: "xyz", template: "https://t/{z}/{x}/{y}.png", maxZoom: 4 } }),
      obj("photo"),
    ]);
    expect(cardOf(e).cover).toBe("https://img/photo.jpg");
  });
  it("prefers the baked thumbnail, rewritten tree-relative under the slug (the published layout)", () => {
    const e = exOf("voy", [obj("o1", { source: "/assets/folio.png", thumbnail: "/assets-thumb/folio.png" })]);
    expect(cardOf(e).cover).toBe("voy/assets-thumb/folio.png");
  });
  it("rewrites an unbaked working /assets/ source tree-relative under the slug too", () => {
    const e = exOf("voy", [obj("o1", { source: "/assets/folio.png" })]);
    expect(cardOf(e).cover).toBe("voy/assets/folio.png");
  });
  it("derives a sized JPEG from a IIIF service-base source (a bare base is not an <img> src)", () => {
    const e = exOf("a", [obj("o1", { source: "https://iiif.example/im/f1" })]);
    expect(cardOf(e).cover).toBe("https://iiif.example/im/f1/full/480,/0/default.jpg");
  });
  it("an all-AV exhibit stays coverless (an <img> can't render audio — the title card is honest)", () => {
    const e = exOf("a", [obj("wave", { source: "https://x/wave.mp3", mediaType: "sound" }), obj("clip", { source: "https://x/clip.mp4", mediaType: "video" })]);
    expect("cover" in cardOf(e)).toBe(false);
  });
  it("an empty exhibit stays coverless", () => {
    expect("cover" in cardOf(exOf("a", []))).toBe(false);
  });
});

describe("shouldRenderGallery (UX-Q7 single-exhibit collapse THRESHOLD)", () => {
  it("renders the gallery when there are multiple exhibits", () => {
    expect(shouldRenderGallery(lib)).toBe(true);
  });
  it("collapses (skips) only when exactly one exhibit AND no library title/summary", () => {
    expect(shouldRenderGallery({ id: asLibraryId("x"), exhibits: [lib.exhibits[0]!] })).toBe(false);
  });
  it("renders a single-exhibit library if it has a title (something to frame)", () => {
    expect(shouldRenderGallery({ id: asLibraryId("x"), title: "Framed", exhibits: [lib.exhibits[0]!] })).toBe(true);
  });
  it("renders an empty library (nothing to collapse to)", () => {
    expect(shouldRenderGallery({ id: asLibraryId("x"), exhibits: [] })).toBe(true);
  });
});

describe("toReadingCollection (ADR-0007 per-Reading AnnotationCollection header)", () => {
  it("emits a header-only WADM collection with the caller-supplied id + `en` name/description", () => {
    const id = `${base}voynich/annotations/readings/cipher.json`;
    const coll = toReadingCollection({ id: "cipher", name: "Cipher", description: "The decipherment." }, id);
    expect(coll).toEqual({
      "@context": "https://www.w3.org/ns/anno.jsonld",
      id,
      type: "AnnotationCollection",
      label: { en: ["Cipher"] },
      summary: { en: ["The decipherment."] },
    });
  });
  it("prefers `prose` over `description` for `summary` — the full voice wins when both exist", () => {
    const coll = toReadingCollection(
      { id: "cipher", name: "Cipher", description: "One line.", prose: "The **full** wall text.\n\nTwo paragraphs." },
      "x",
    );
    expect(coll.summary).toEqual({ en: ["The **full** wall text.\n\nTwo paragraphs."] });
  });
  it("omits `summary` when the Reading has no description (byte-stable absence)", () => {
    const coll = toReadingCollection({ id: "r1", name: "Plain" }, "x");
    expect(coll).toEqual({
      "@context": "https://www.w3.org/ns/anno.jsonld",
      id: "x",
      type: "AnnotationCollection",
      label: { en: ["Plain"] },
    });
    expect("summary" in coll).toBe(false);
  });
});

describe("shouldRenderGalleryFromJson (consumer side — same rule on the published ExhibitsJson)", () => {
  it("agrees with shouldRenderGallery for every framing case", () => {
    expect(shouldRenderGalleryFromJson(toExhibitsJson(lib))).toBe(true); // N>1
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), exhibits: [lib.exhibits[0]!] }))).toBe(false); // N=1, no framing
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), title: "Framed", exhibits: [lib.exhibits[0]!] }))).toBe(true); // N=1, framed
    expect(shouldRenderGalleryFromJson(toExhibitsJson({ id: asLibraryId("x"), exhibits: [] }))).toBe(true); // empty
  });
});
