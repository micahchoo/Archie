// Archie-4b0a — `PublishOptions.scaleSelectors` at the publish seam.
//
// The blocker this closes: Studio's web quality tier re-encodes a 6000 px master at 2400 px and
// rewrites the manifest's canvas dimensions to match, but selectors are absolute MASTER pixels and
// the viewer maps them off the loaded image's content size — so every region landed 2.5x out of
// place. The projection now moves them with the image.
//
// What each block is protecting, since a rescale is easy to test in a way that cannot fail:
//   - the ABSENT case is byte-identical (`getViewerBundle`'s idiom — a new option must not move an
//     existing tree by one byte, or every publish in the repo has silently changed);
//   - the projection is scaled and the HISTORY sidecar is NOT (the round-trip source stays canonical,
//     the same posture `rebaseCanvasId` takes one line above it in site.ts);
//   - a MIXED library scales only the objects the callback names — a publish where the factor leaks
//     onto an untiered object is the same defect with the sign flipped;
//   - a Section's `start` (the narrative camera) moves too, because it is the same pixel space;
//   - `archie:geo` and a `t=` window do not move, because they are not.
import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { fsJsonSource } from "./read.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { AnnotationLog, W3CAnnotation, W3CAnnotationPage } from "../wadm/types.js";
import type { SelectorScale } from "../geometry/rescale.js";

const alice = asClientId("alice");
const BASE = "https://archie.demo/";
const SLUG = "plates";

/** o1 is the TIERED object: authored 6000x4000, served 2400x1600. o2 is untiered (already small). */
const TIER: SelectorScale = { sx: 2400 / 6000, sy: 1600 / 4000 };

const library: Library = {
  id: asLibraryId("lib"),
  exhibits: [{
    id: asExhibitId("ex1"),
    slug: SLUG,
    title: "Plates",
    objects: [
      { id: asObjectId("o1"), source: "https://img/one.webp", label: "One", width: 2400, height: 1600 },
      { id: asObjectId("o2"), source: "https://img/two.webp", label: "Two", width: 800, height: 600 },
      { id: asObjectId("o3"), source: "https://img/three.opus", label: "Three", mediaType: "audio" },
    ],
    sections: [
      { id: "s1", title: "Open", objectId: "o1", start: "xywh=pixel:1200,800,600,400" },
      { id: "s2", title: "Aside", objectId: "o2", start: "xywh=pixel:100,100,50,50" },
    ],
  }],
};

const canvas = (o: string) => `${BASE}${SLUG}/canvas/${o}`;
const sel = (value: string, type: "FragmentSelector" | "SvgSelector" = "FragmentSelector") => ({ type, value });

/** Four notes: a rect and a polygon on the TIERED object, a rect on the untiered one, and a time
 *  window on the audio object. Each is a different claim about what must (not) move. */
function buildLog(): AnnotationLog {
  let log: AnnotationLog = [];
  const add = (source: string, selector: unknown, extra: Record<string, unknown> = {}) => {
    log = appendNew(log, { target: { type: "SpecificResource", source, selector }, lastEditor: alice, modifiedAt: "t", now: 1, ...extra } as never).log;
  };
  add(canvas("o1"), sel("xywh=pixel:1200,800,600,400"));
  add(canvas("o1"), sel(`<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`, "SvgSelector"));
  add(canvas("o2"), sel("xywh=pixel:100,100,50,50"), { geo: { type: "bbox", west: -0.1, south: 51.4, east: 0.1, north: 51.6 } });
  add(canvas("o3"), sel("t=12.5,30"));
  return log;
}
const log = buildLog();
const getLog = (id: string): AnnotationLog => (id === "ex1" ? log : []);

/** The tier's own report, as a `scaleSelectors` callback: only o1 moved. */
const scaleSelectors = (slug: string, objectId: string): SelectorScale | null =>
  slug === SLUG && objectId === "o1" ? TIER : null;

async function publish(opts: { scaleSelectors?: typeof scaleSelectors } = {}) {
  const fs = new MemoryFilesystem();
  const result = await publishLibrary(fs, library, getLog, { baseUrl: BASE, ...opts });
  const src = fsJsonSource(fs);
  return { fs, result, src };
}

/** The selector VALUES on one canvas's base heads page, keyed by shape so nothing depends on the
 *  order the log projected in (`.claude/rules/a-green-run-is-one-sample.md`: never key on position). */
async function selectorsOn(src: ReturnType<typeof fsJsonSource>, objId: string): Promise<string[]> {
  const page = await src.get<W3CAnnotationPage>(`${SLUG}/canvas/${objId}/annotations.json`);
  return (page.items ?? []).map((a: W3CAnnotation) => {
    const t = a.target as { selector?: { value?: string } };
    return t.selector?.value ?? "";
  }).sort();
}

describe("publishLibrary — scaleSelectors (Archie-4b0a)", () => {
  it("ABSENT is byte-identical: the option changes nothing for a caller that does not pass it", async () => {
    const a = await publish();
    const b = await publish();
    // Identity via the same route the fixity manifest takes — every file, every byte.
    const dump = async (fs: MemoryFilesystem) => {
      const s = fsJsonSource(fs);
      const out: Record<string, unknown> = {};
      for (const objId of ["o1", "o2", "o3"]) out[objId] = await s.get(`${SLUG}/canvas/${objId}/annotations.json`);
      out.manifest = await s.get(`${SLUG}/manifest.json`);
      return JSON.stringify(out);
    };
    expect(await dump(a.fs)).toBe(await dump(b.fs));
    expect(a.result.unscaledSelectors).toEqual([]);
    // and the coordinates are the AUTHORED ones — the baseline this whole fix moves away from
    expect(await selectorsOn(a.src, "o1")).toContain("xywh=pixel:1200,800,600,400");
  });

  it("an IDENTITY callback is byte-identical to the absent one (the archival tier's guarantee)", async () => {
    const off = await publish();
    const one = await publish({ scaleSelectors: () => ({ sx: 1, sy: 1 }) });
    const page = (r: Awaited<ReturnType<typeof publish>>) => r.src.get(`${SLUG}/canvas/o1/annotations.json`);
    expect(JSON.stringify(await page(one))).toBe(JSON.stringify(await page(off)));
    expect(JSON.stringify(await one.src.get(`${SLUG}/manifest.json`))).toBe(JSON.stringify(await off.src.get(`${SLUG}/manifest.json`)));
  });

  it("scales BOTH selector shapes on the tiered object", async () => {
    const { src } = await publish({ scaleSelectors });
    expect(await selectorsOn(src, "o1")).toEqual([
      "xywh=pixel:480,320,240,160",
      `<svg><polygon points="480,320 720,320 600,640" /></svg>`,
    ].sort());
  });

  it("scales ONLY the objects the callback names — the untiered object is untouched", async () => {
    const { src } = await publish({ scaleSelectors });
    expect(await selectorsOn(src, "o2")).toEqual(["xywh=pixel:100,100,50,50"]);
  });

  it("leaves a TIME window and an archie:geo anchor alone — neither is image-pixel space", async () => {
    const { src } = await publish({ scaleSelectors: () => TIER }); // scale EVERY object, to prove the guard is in the value and not in the lookup
    expect(await selectorsOn(src, "o3")).toEqual(["t=12.5,30"]);
    const page = await src.get<W3CAnnotationPage>(`${SLUG}/canvas/o2/annotations.json`);
    expect((page.items![0] as unknown as Record<string, unknown>)["archie:geo"]).toEqual({ type: "bbox", west: -0.1, south: 51.4, east: 0.1, north: 51.6 });
  });

  it("scales a SECTION's start on the tiered object and not on the untiered one", async () => {
    const { src } = await publish({ scaleSelectors });
    // The Range carries the fragment on `start.id` (manifest.ts:282) — there is no selector object here.
    const manifest = await src.get<{ structures?: Array<{ id: string; start?: { id?: string } }> }>(`${SLUG}/manifest.json`);
    const byRange = new Map((manifest.structures ?? []).map((r) => [r.id, r.start?.id ?? ""]));
    expect(byRange.get(`${BASE}${SLUG}/range/s1`)).toBe(`${canvas("o1")}#xywh=pixel:480,320,240,160`);
    expect(byRange.get(`${BASE}${SLUG}/range/s2`)).toBe(`${canvas("o2")}#xywh=pixel:100,100,50,50`);
    // …and the WADM view of the same Sections (ADR-0017, sectionToAnnotation) must agree, or a pure
    // annotation tool and a IIIF viewer would put the same beat in two different places.
    const narrative = await src.get<{ first?: { items?: Array<{ id: string; target: { selector?: { value?: string } } }> } }>(`${SLUG}/annotations/narrative.json`);
    const bySection = new Map((narrative.first?.items ?? []).map((a) => [a.id, a.target.selector?.value]));
    expect(bySection.get(`${BASE}${SLUG}/section/s1`)).toBe("xywh=pixel:480,320,240,160");
    expect(bySection.get(`${BASE}${SLUG}/section/s2`)).toBe("xywh=pixel:100,100,50,50");
  });

  it("the HISTORY sidecar keeps the AUTHORED coordinates — projection-only, so a round trip cannot compound", async () => {
    const { src } = await publish({ scaleSelectors });
    const index = await src.get<Record<string, string>>(`${SLUG}/annotations/history/index.json`);
    const values: string[] = [];
    for (const lid of Object.keys(index)) {
      const page = await src.get<W3CAnnotationPage>(`${SLUG}/annotations/history/${lid}.json`);
      for (const a of page.items ?? []) values.push(((a.target as { selector?: { value?: string } }).selector?.value) ?? "");
    }
    expect(values.sort()).toEqual([
      "t=12.5,30",
      "xywh=pixel:100,100,50,50",
      "xywh=pixel:1200,800,600,400",
      `<svg><polygon points="1200,800 1800,800 1500,1600" /></svg>`,
    ].sort());
  });

  it("REPORTS a selector it cannot scale instead of shipping master-space coordinates silently", async () => {
    const pathLog = appendNew([], {
      target: { type: "SpecificResource", source: canvas("o1"), selector: { type: "SvgSelector", value: `<svg><path d="M10 10 L30 30 Z" /></svg>` } },
      lastEditor: alice, modifiedAt: "t", now: 1,
    }).log;
    const fs = new MemoryFilesystem();
    const result = await publishLibrary(fs, library, () => pathLog, { baseUrl: BASE, scaleSelectors });
    expect(result.unscaledSelectors).toHaveLength(1);
    expect(result.unscaledSelectors[0]!.objectId).toBe("o1");
    expect(result.unscaledSelectors[0]!.reason).toMatch(/path/);
    // and the value shipped UNCHANGED — an unscalable selector is wrong in a KNOWN way, not a mangled one
    expect(await selectorsOn(fsJsonSource(fs), "o1")).toEqual([`<svg><path d="M10 10 L30 30 Z" /></svg>`]);
  });
});
