import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId } from "../wadm/brand.js";
import type { Library, Exhibit } from "../model/model.js";
import type { AnnotationLog, W3CSpecificResource } from "../wadm/types.js";

// PHASE 5 (content) — the Voynich reconceived as a genuinely-plural Readings exhibit, authored as a
// real source Library and proven through the published engine (ADR-0007 / strategy Phase 5). Grounded:
// real Beinecke MS 408 IIIF image + the documented competing readings (Cipher / Hoax / Natural-language). This is the
// CONTENT + end-to-end proof; the viewer LEGEND (Phase 3) + Studio panel (Phase 4) are browser-verify-owed.
// NB: scoped to one real folio "as you see fit" — only one Beinecke image id is research-verified
// (1006074); scaling to more folios = pulling more ids from the live manifest (a content step, not code).

const scholar = asClientId("scholar-a");
const BASE = "https://u.gh.io/voynich-lib/";
const CANVAS = `${BASE}voynich/canvas/f1`;
const region = (xywh: string): W3CSpecificResource => ({ source: CANVAS, selector: { type: "FragmentSelector", value: `xywh=pixel:${xywh}` } });
const KEYSTONE = region("300,1200,520,180"); // the SAME glyph-block both camps read incompatibly

const voynich: Exhibit = {
  id: "voynich",
  slug: "voynich",
  title: "The Voynich Manuscript — competing readings",
  summary: "Beinecke MS 408, read through rival scholarly interpretations.",
  objects: [
    { id: "f1", source: "https://collections.library.yale.edu/iiif/2/1006074/full/full/0/default.jpg", label: "Folio (MS 408)", width: 1450, height: 2000 },
  ],
  readings: [
    { id: "cipher", name: "Cipher reading", description: "the glyphs encode a natural language (Friedman / NSA tradition)", colour: "#3a6b4c" },
    { id: "hoax", name: "Hoax reading", description: "the glyphs are meaningless, Cardan-grille-style (Rugg 2004; Gaskell & Bowern 2022)", colour: "#a3553a" },
    { id: "abjad", name: "Natural-language reading", description: "the glyphs are a real natural language in an invented alphabet (Bax 2014; Amancio et al. 2013)", colour: "#4c5d8a" },
  ],
};
const library: Library = { id: "voynich-lib", title: "Voynich", exhibits: [voynich] };

// The genuine exercise: rival camps annotate the SAME block; plus a base fact and an apparatus Tag.
function buildLog(): AnnotationLog {
  let log: AnnotationLog = [];
  const add = (target: W3CSpecificResource, value: string, opts: { reading?: string; tags?: string[] } = {}, now = 1) => {
    const body = [{ type: "TextualBody" as const, value }, ...(opts.tags ?? []).map((v) => ({ type: "TextualBody" as const, value: v, purpose: "tagging" }))];
    log = appendNew(log, { target, body, lastEditor: scholar, modifiedAt: "t", now, ...(opts.reading ? { reading: opts.reading } : {}) }).log;
  };
  // KEYSTONE — the same region, three incompatible readings (the whole point of the demo):
  add(KEYSTONE, "Under the cipher hypothesis this paragraph is a noun-heavy passage; word-length clustering at 4–6 glyphs fits an enciphered natural language.", { reading: "cipher" }, 1);
  add(KEYSTONE, "Under the hoax hypothesis the same block is meaningless — its statistical regularity is reproducible with a Cardan grille (Rugg 2004).", { reading: "hoax" }, 2);
  add(KEYSTONE, "Under the natural-language hypothesis the same block is plaintext in an invented alphabet — its word-entropy sits within the natural-language range (Amancio et al. 2013; Bax 2014).", { reading: "abjad" }, 3);
  // A neutral, uncontested fact → the always-visible BASE:
  add(region("80,80,300,120"), "Voynichese: ~35,000 characters across ~240 leaves in a single distinctive script.", {}, 4);
  // An apparatus observation → a Tag in the base (Frame C: apparatus = additive Tag, not a Reading):
  add(region("90,1700,400,140"), "The hand here is consistent with Currier 'Language B'.", { tags: ["paleography"] }, 5);
  return log;
}

describe("Phase 5 — the Voynich publishes as a genuinely-plural Readings exhibit (ADR-0007)", () => {
  const readJson = async (fs: MemoryFilesystem, ...path: string[]) => {
    let dir = await fs.root();
    for (let i = 0; i < path.length - 1; i++) dir = await dir.getDirectory(path[i]!);
    return JSON.parse(new TextDecoder().decode(await (await dir.getFile(path[path.length - 1]!)).readable()));
  };

  it("the KEYSTONE: the same region is annotated under all three readings, on separate toggleable pages", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, (id) => (id === "voynich" ? buildLog() : []), { baseUrl: BASE });

    const cipher = await readJson(fs, "voynich", "canvas", "f1", "annotations-cipher.json");
    const hoax = await readJson(fs, "voynich", "canvas", "f1", "annotations-hoax.json");
    const abjad = await readJson(fs, "voynich", "canvas", "f1", "annotations-abjad.json");
    expect(cipher.items).toHaveLength(1);
    expect(hoax.items).toHaveLength(1);
    expect(abjad.items).toHaveLength(1);
    // Same marks, rival readings: all three target the identical region (the demo's payoff).
    const target = (a: { target: { selector: { value: string } } }) => a.target.selector.value;
    expect(target(cipher.items[0])).toBe("xywh=pixel:300,1200,520,180");
    expect(target(hoax.items[0])).toBe(target(cipher.items[0]));
    expect(target(abjad.items[0])).toBe(target(cipher.items[0]));
    expect(cipher.partOf).toEqual([{ id: `${BASE}voynich/annotations/readings/cipher.json`, type: "AnnotationCollection" }]);
    expect(abjad.partOf).toEqual([{ id: `${BASE}voynich/annotations/readings/abjad.json`, type: "AnnotationCollection" }]);
  });

  it("base holds the uncontested fact + the apparatus note; apparatus rides a Tag, not a Reading", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, (id) => (id === "voynich" ? buildLog() : []), { baseUrl: BASE });
    const base = await readJson(fs, "voynich", "canvas", "f1", "annotations.json");
    expect(base.items).toHaveLength(2); // the neutral fact + the paleography note (both reading-less)
    const hasPaleographyTag = base.items.some((a: { body?: unknown }) => {
      const bodies = Array.isArray(a.body) ? a.body : a.body ? [a.body] : [];
      return bodies.some((b: { purpose?: string; value?: unknown }) => b.purpose === "tagging" && b.value === "paleography");
    });
    expect(hasPaleographyTag).toBe(true); // apparatus = an additive Tag (Frame C), living in the base
  });

  it("the manifest exposes base + both readings as separate AnnotationPages (Mirador-toggleable)", async () => {
    const fs = new MemoryFilesystem();
    await publishLibrary(fs, library, (id) => (id === "voynich" ? buildLog() : []), { baseUrl: BASE });
    const manifest = await readJson(fs, "voynich", "manifest.json");
    expect(manifest.items[0].annotations.map((a: { id: string }) => a.id)).toEqual([
      `${CANVAS}/annotations.json`,
      `${CANVAS}/annotations-cipher.json`,
      `${CANVAS}/annotations-hoax.json`,
      `${CANVAS}/annotations-abjad.json`,
    ]);
    const coll = await readJson(fs, "voynich", "annotations", "readings", "hoax.json");
    expect(coll.summary.en[0]).toContain("Cardan");
  });
});
