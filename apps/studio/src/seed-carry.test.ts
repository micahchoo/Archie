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
import { asClientId, selectorOf, shapeLabel, type W3CAnnotation, type W3CSelector } from "@render/core";
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
    // LITERAL counts, not `voynichPolygonNotes.length` — the grid seeds BOTH polygons, the o9-only
    // exhibit seeds one. Deriving either number from the fixture would make emptying it assert nothing.
    const values = (slug: string) =>
      notesOf(slug)
        .map((r) => selectorOf(r as unknown as W3CAnnotation))
        .filter((s): s is W3CSelector => s !== null && shapeLabel(s) === "Polygon")
        .map((s) => s.value);
    expect(values("voynich"), "the grid does not seed both polygons").toHaveLength(2);
    expect(values("voynich")).toEqual(voynichPolygonNotes.map((n) => polygonSelectorValue(n.points)));
    expect(values("voynich-rosettes"), "the o9-only exhibit seeds the wrong number").toHaveLength(1);
    expect(values("voynich-rosettes")[0]).toBe(polygonSelectorValue(voynichPolygonNotes[0]!.points));
  });

  it("FILTERS the o5 polygon out of the o9-only exhibit — a negative case that can fail", () => {
    // The previous version of this test picked the ATLAS as its negative case, reasoning that rosettes
    // and the grid both carry o9 so neither could serve. That reasoning was right up to its last step
    // and then landed in a hole: `seededAtlas` is a different function from `seededVoynich` and never
    // reads `voynichPolygonNotes`, so no change to `keep()` could ever seed a polygon there. Deleting
    // the filter left this file green at 3/3. It was unrelated data wearing the costume of a negative
    // case.
    //
    // `voynich-rosettes` is seeded by `seededVoynich` restricted to o9, so the o5 polygon is one the
    // filter must actively drop — one polygon seeded, not two. This is the assertion that goes red when
    // `keep()` does.
    const polys = notesOf("voynich-rosettes")
      .map((r) => selectorOf(r as unknown as W3CAnnotation))
      .filter((s) => s !== null && shapeLabel(s) === "Polygon");
    expect(polys, "the o9-only exhibit no longer filters the o5 polygon out").toHaveLength(1);
    // The RIGHT one — a bare count would pass if the filter kept o5 and dropped o9.
    expect(polys[0]!.value).toBe(polygonSelectorValue(voynichPolygonNotes[0]!.points));
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
