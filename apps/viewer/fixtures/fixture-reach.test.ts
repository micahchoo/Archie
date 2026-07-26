// The gates for two fixtures that exist to make a code path REACHABLE (Archie-f4fb, Archie-4524).
//
// Both are the same failure this whole slice exists to end: a path that is implemented, correct, and
// touched by nothing anyone looks at. A fixture that makes such a path reachable is only half the job —
// without an assertion it is a fixture nobody would notice the loss of, and the path goes straight back
// to unexercised the first time someone tidies the seed.
//
// WHAT THIS FILE'S SUBJECT ACTUALLY IS, because the distinction is the one this repo keeps being bitten
// by. `getLog` is a lookup into `logsById` — the IN-MEMORY log the generator consumes, one step UPSTREAM
// of `apps/viewer/public/published/**`. So these assertions prove the fixture reaches the bake's input,
// NOT that the committed tree was regenerated. **Nothing here goes red if someone edits a fixture and
// forgets `pnpm gen`**; the e2e suite's prebuild is what covers that, by regenerating and driving the
// result. Same shape as `.claude/rules/svelte-no-typecheck-net.md`'s "a gate proves the code compiled,
// never that the output carries anything" — worth stating plainly in a file whose whole subject is
// assertions that answer a narrower question than they appear to.
//
// EVERY PREDICATE HERE IS IMPORTED FROM THE APP, NEVER RESTATED. `offline.ts:112-124` records what a
// restated classifier costs: a hand-written "has a selector ⇒ region" test passed on a tree where the
// app drew ZERO regions, because `isWholeObjectFor` routes a >=75%-coverage selector to the object
// FRAME instead. `shapeLabel`, `selectorBBox`, `parsePolygonPoints` and `isWholeObjectFor` all come
// from `@render/core` for exactly that reason: change the shape vocabulary or the coverage threshold
// and these assertions change with it instead of drifting into agreement with a version of the app
// that no longer exists.
//
// ONE PREDICATE IS DELIBERATELY NOT IMPORTED, and it is worth naming. The function the overlay builder
// actually calls is `overlayShapeFor` (`@render/mount`), and asserting against it directly would be
// the strongest form. apps/viewer does NOT depend on `@render/mount` — it reaches it only through
// `@render/svelte`, which re-exports named pieces precisely so the viewer "needn't depend on
// @render/mount directly" (`packages/render-svelte/src/index.ts:12`, `:23`). Adding a direct dep for a
// test would also mean an `optimizeDeps.include` entry
// (`.claude/rules/viewer-optimizedeps-bare-includes.md`), which is a real cost for a test-only reach.
// `overlayShapeFor` is `isV1Shape` + `parsePolygonPoints` composed, and both are asserted below; the
// composition itself is covered by render-mount's own suite.
import { describe, it, expect } from "vitest";
import { selectorOf, selectorBBox, shapeLabel, isWholeObjectFor, wholeObjectFlagOf, isV1Shape, parsePolygonPoints, type W3CAnnotation } from "@render/core";
import { getLog } from "./sample-data.js";
import { voynichPolygonNotes, voynichAvNotes } from "./voynich.js";

/** o9's native pixel dimensions (fixtures/voynich.ts:99) — the canvas the coverage test measures against. */
const O9 = { w: 7925, h: 7268 };

/**
 * Selectors published for an exhibit.
 *
 * The emptiness guard is not defensive noise — it is the fix for a measured hole. `getLog` is
 * `logsById[exhibitId] ?? []` (`sample-data.ts`), so a MISTYPED OR RENAMED exhibit id yields an empty
 * log, every filter over it yields `[]`, and any `toHaveLength(0)` assertion passes for the wrong
 * reason. The review proved it: pointing this helper at `ex-atlas-RENAMED` left the file at 8/8. That
 * is the same shape as the fixture rename that took a capability suite from 33 assertions to 6.
 *
 * Borrowed wholesale from `seed-carry.test.ts`'s `notesOf`, whose equivalent guard DID go red under the
 * same probe — the donor was already in this commit, one file over.
 */
const selectorsOf = (exhibitId: string) => {
  const log = getLog(exhibitId);
  expect(log.length, `no published log for "${exhibitId}" — an unknown id reads as empty, not as absent`).toBeGreaterThan(0);
  return log.map((r) => selectorOf(r as unknown as W3CAnnotation)).filter((s) => s !== null);
};

describe("Archie-f4fb — the seed carries a polygon region, and it renders as one", () => {
  // The showroom gap this closes: before this fixture the corpus was 100% rectangles, so every
  // screenshot, demo and e2e run exercised the rect branch only and a polygon regression would have
  // surfaced in front of a reader. It is filed low BECAUSE the selector is implemented — this asserts
  // the seed reaches it, not that the feature works.
  const polygonsIn = (exhibitId: string) => selectorsOf(exhibitId).filter((s) => shapeLabel(s) === "Polygon");

  it("publishes BOTH polygons into the exhibits that carry both objects", () => {
    // The grid has every folio and the narrative carries the full set, so both polygons (o9's rosette,
    // o5's star-wheel) belong in both.
    for (const exhibitId of ["ex-voynich", "ex-voynich-reading"]) {
      // LITERAL counts, deliberately, and not `voynichPolygonNotes.length`. The first draft of this line
      // derived the expected count from the very fixture under test, so emptying `voynichPolygonNotes`
      // made it assert `0 === 0` and pass — the exact vacuity this whole file exists to prevent,
      // reintroduced inside the gate against it. Adding a third polygon should be a deliberate edit
      // here, not something the test silently absorbs.
      expect(polygonsIn(exhibitId), `${exhibitId} does not publish both polygon regions`).toHaveLength(2);
    }
    expect(voynichPolygonNotes).toHaveLength(2); // the fixture and the number above agree
  });

  it("FILTERS the o5 polygon out of the o9-only exhibit — the negative case, and it can fail", () => {
    // THIS ASSERTION REPLACES ONE THAT COULD NOT FAIL, and the reason is worth keeping because the
    // mistake is available anywhere in this fixture set.
    //
    // The old version asserted no polygon appears in `ex-atlas` / `ex-geo` / `ex-sampler`, and called
    // that a test of the object filter. It is not. Those three exhibits are built by `buildAtlasLog` /
    // `buildGeoLog` / `buildSamplerLog` — functions that never reference `voynichPolygonNotes` at all —
    // so no change to `keep()` could put a polygon in them. Deleting the filter outright
    // (`if (!keep(…)) continue;` → `if (false) continue;`) left the file green at 8/8. It asserted over
    // data the filter cannot reach, which is the same shape as deriving an expectation from the thing
    // under test: the assertion was true for a reason that had nothing to do with the code it named.
    //
    // What makes THIS one real: `voynich-rosettes` is built by `buildVoynichLog` with
    // `objectIds: {ex-voynich.o9}`, so the o5 polygon is a note the filter must actively drop. It gets
    // exactly one polygon, not two. Delete `keep()` and this goes red — which is why the o5 polygon
    // exists at all (see the fixture's own comment).
    const rosettes = polygonsIn("ex-voynich-rosettes");
    expect(rosettes, "the o9-only exhibit no longer filters the o5 polygon out").toHaveLength(1);
    // …and it is the RIGHT one. A count alone would pass if the filter kept o5 and dropped o9.
    expect(selectorBBox(rosettes[0]!)!.x).toBe(935); // the rosette's bbox origin, not the star-wheel's 555
  });

  it("survives the publish round-trip as parseable geometry, not just as a string", () => {
    // `shapeLabel` only reads for the substring `<polygon`, so it alone would pass on markup the
    // renderer cannot use. `selectorBBox` runs the SAME `parsePolygonPoints` the overlay builder does,
    // and returns null on empty/NaN points — this is what makes the assertion about geometry.
    const poly = selectorsOf("ex-voynich").find((s) => shapeLabel(s) === "Polygon")!;
    const box = selectorBBox(poly);
    expect(box, "the published polygon's points do not parse").not.toBeNull();
    expect(box!.w).toBeGreaterThan(0);
    expect(box!.h).toBeGreaterThan(0);
  });

  it("passes the v1 shape gate and yields all twelve vertices", () => {
    // The two halves `overlayShapeFor` composes. `isV1Shape` is the vocabulary gate the overlay applies
    // ITSELF (rect + polygon only — an ellipse or a path selector returns null and draws nothing), and
    // `parsePolygonPoints` is the parser that turns the markup into the points the `<polygon>` element
    // gets. A fixture that lost a vertex, or gained a `<path>`, fails here rather than in front of a
    // reader.
    const poly = selectorsOf("ex-voynich").find((s) => shapeLabel(s) === "Polygon")!;
    expect(isV1Shape(poly)).toBe(true);
    expect(parsePolygonPoints(poly.value)).toHaveLength(12);
  });

  it("is drawn as a REGION, not routed to the whole-object frame", () => {
    // The vacuity `offline.ts` caught for rects, applied here before it can happen: a polygon covering
    // >=75% of o9 would be classified whole-object, so the reader would draw the object frame and no
    // polygon element would ever exist — with this file still green if it only checked the selector.
    const rec = getLog("ex-voynich").find((r) => {
      const s = selectorOf(r as unknown as W3CAnnotation);
      return s !== null && shapeLabel(s) === "Polygon";
    })!;
    const ann = rec as unknown as W3CAnnotation;
    expect(isWholeObjectFor(selectorOf(ann), O9.w, O9.h, wholeObjectFlagOf(ann))).toBe(false);
  });
});

describe("Archie-4524 — the AV surface's first reading-bearing note (FIXTURE HALF ONLY)", () => {
  // DELIBERATELY NOT ASSERTING A LEGEND, and saying so rather than leaving it silent. The AV surface has
  // no `ReadingLegend`; building one now would need five props threaded from `ExhibitView` and would
  // render a control over a list that the reader has no way to populate. The ticket is left OPEN for
  // the control half. What IS assertable today is that the data the legend will consume exists and is
  // on the reading channel — which is the half that, missing, would make the legend's own test vacuous
  // in precisely the way `Archie-0cc6` documents.
  const avNoteWithReading = voynichAvNotes.filter((a) => a.reading);

  it("exactly one AV note carries a reading, and it names a real Reading", () => {
    expect(avNoteWithReading).toHaveLength(1);
    // `voynichReadings` ids — a `reading` naming nothing would file the note under a reading the legend
    // never lists, i.e. invisible for a reason no assertion elsewhere would surface.
    expect(["cipher", "hoax", "abjad"]).toContain(avNoteWithReading[0]!.reading);
  });

  it("the DEFAULT view still shows exactly the four base AV notes", () => {
    // This is the assertion that keeps `av-surface.spec.ts`'s `.cues li` toHaveCount(4) honest, and it
    // is the reason adding the fifth note broke no consumer: `ExhibitView.annotationsOf` (:388-392)
    // returns base notes alone while `activeReading === null`, and the AV surface has no control that
    // can set it. When the legend lands, THIS number is the red-green — activating the reading must
    // make it five.
    expect(voynichAvNotes.filter((a) => !a.reading)).toHaveLength(4);
  });

  it("publishes as a time-ranged note, not as a region", () => {
    // A `reading` on a note whose selector lost its `t=` would vanish from the transcript spine
    // entirely (MediaPlayer's `cues` derived keeps only annotations with a time fragment), so the
    // legend would list a reading whose note has nowhere to appear.
    const timed = selectorsOf("ex-voynich").filter((s) => s.type === "FragmentSelector" && s.value.startsWith("t="));
    expect(timed.length).toBe(voynichAvNotes.length);
  });
});
