// The seed CARRY CONTRACT, asserted (Archie-f4fb / Archie-4524).
//
// The shared fixtures under `apps/viewer/fixtures/` are read TWICE — by the Viewer's published bake
// (`sample-data.ts`) and by the Studio's seeded session (`seed-data.ts`) — and the two mapping loops
// are hand-written. A field only one of them carries is a SILENT divergence: both apps compile, both
// suites pass, and the Studio simply boots without a note the published demo shows. `sampler.ts:84-90`
// already writes that contract down for `SamplerTimeNote.tags`; nothing enforced it.
//
// This is the enforcement, and it is deliberately about the two NEWEST carries — the ones with no
// history of being noticed. `render-core`'s `model/carry.ts` sentinels make a dropped MODEL field a
// compile error; these fixture loops are outside that mechanism (they map fixture-local interfaces,
// not model types), so a runtime assertion is what is available.
import { describe, it, expect } from "vitest";
import { asClientId, selectorOf, shapeLabel, type W3CAnnotation } from "@render/core";
import { seededFor } from "./seed-data.js";
import { voynichPolygonNotes, polygonSelectorValue, voynichAvNotes } from "../../viewer/fixtures/voynich.js";

const author = asClientId("test-author");
const notesOf = (slug: string) => {
  const make = seededFor(author, slug);
  expect(make, `no seed factory for ${slug}`).not.toBeNull();
  return make!().notes(); // the head projection — what the Studio actually renders, not the raw log
};

describe("the Studio seed carries what the Viewer's bake carries", () => {
  it("seeds the polygon region on both o9 exhibits, with the IDENTICAL selector value", () => {
    // Byte-identical markup, not merely "a polygon": the two seeds mint the value through the same
    // shared helper precisely so a curator opening `voynich` in the Studio sees the same geometry the
    // published demo shows. Comparing the VALUE is what would catch one side reformatting the points.
    const expected = polygonSelectorValue(voynichPolygonNotes[0]!.points);
    for (const slug of ["voynich", "voynich-rosettes"]) {
      const polys = notesOf(slug)
        .map((r) => selectorOf(r as unknown as W3CAnnotation))
        .filter((s) => s !== null && shapeLabel(s) === "Polygon");
      expect(polys, `${slug} seeds no polygon`).toHaveLength(1);
      expect(polys[0]!.value).toBe(expected);
    }
  });

  it("does NOT seed the polygon into an exhibit that has no o9", () => {
    // `keep()` filters by object id. The rosettes exhibit is o9-only and the grid has everything, so
    // the negative case has to come from elsewhere — the atlas, whose objects are a different set
    // entirely. A polygon appearing there means the filter stopped filtering.
    const polys = notesOf("language-atlas")
      .map((r) => selectorOf(r as unknown as W3CAnnotation))
      .filter((s) => s !== null && shapeLabel(s) === "Polygon");
    expect(polys).toHaveLength(0);
  });

  it("seeds the AV note's `reading`, which is the field a legend will read", () => {
    // Archie-4524's fixture half. The Studio's AV loop spreads `reading` conditionally
    // (`seed-data.ts` seededVoynich); dropping that spread is a one-character edit that nothing else
    // would notice, and it would make the eventual legend list nothing in the Studio while the
    // published demo listed it.
    const expected = voynichAvNotes.find((a) => a.reading)!.reading;
    const readings = notesOf("voynich")
      .filter((r) => {
        const s = selectorOf(r as unknown as W3CAnnotation);
        return s !== null && s.type === "FragmentSelector" && s.value.startsWith("t=");
      })
      .map((r) => (r as { reading?: string }).reading)
      .filter((x): x is string => !!x);
    expect(readings).toEqual([expected]);
  });
});
