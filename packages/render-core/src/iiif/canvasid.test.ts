import { describe, it, expect } from "vitest";
import { toManifest, canvasIdMap } from "./manifest.js";
import { canvasIdFor, rebaseCanvasId } from "./canvasid.js";
import type { Exhibit } from "../model/model.js";
import { asExhibitId, asObjectId } from "../wadm/brand.js";

describe("canvasIdFor", () => {
  it("mints `${base}${slug}/canvas/${objectId}`", () => {
    expect(canvasIdFor("https://u.gh.io/lib/", "voynich", "o1")).toBe("https://u.gh.io/lib/voynich/canvas/o1");
  });
  it("reproduces toManifest's canvas IRI exactly (the shared invariant)", () => {
    const m = toManifest(ex, { baseUrl: "https://u.gh.io/lib/" });
    expect(canvasIdFor("https://u.gh.io/lib/", "voynich", "o1")).toBe(canvasIdMap(m).o1);
  });
  it("supports a relative manifest (empty base)", () => {
    expect(canvasIdFor("", "geo-map", "o3")).toBe("geo-map/canvas/o3");
  });
});

// canvasIdMap is the SNAG fix: the canvas IRI must come from the manifest (which bakes the publish
// origin), NOT a fixed viewer-side BASE. This test pins that it reflects the manifest's baseUrl.

const ex: Exhibit = {
  id: asExhibitId("e"),
  slug: "voynich",
  title: "V",
  objects: [
    { id: asObjectId("o1"), source: "https://img/1.jpg", label: "one" },
    { id: asObjectId("o2"), source: "https://img/2.jpg", label: "two" },
  ],
};

describe("canvasIdMap", () => {
  it("maps each object id to its full canvas IRI from the manifest's baked base", () => {
    const m = toManifest(ex, { baseUrl: "https://u.gh.io/lib/" });
    expect(canvasIdMap(m)).toEqual({
      o1: "https://u.gh.io/lib/voynich/canvas/o1",
      o2: "https://u.gh.io/lib/voynich/canvas/o2",
    });
  });
});

// rebaseCanvasId — the seam where a library changes origin. Every case below is a REBASE-or-not
// decision; the whole point is that "not" is the default and the rebase is narrow.
describe("rebaseCanvasId", () => {
  const PUB = "https://u.gh.io/lib/";
  const WORKING = "https://archie.demo/";
  const known = (id: string) => id === "o1" || id === "o2";

  it("re-mints a target authored against another base onto the publish base", () => {
    // The exact shape that shipped broken: 182 history records in the committed zip target
    // WORKING_IRI_BASE while the manifest's canvases are at the deploy origin, so the publisher's
    // exact-equality filter matched none of them and emitted zero inline annotations.
    expect(rebaseCanvasId(`${WORKING}voynich/canvas/o1`, PUB, "voynich", known))
      .toBe(`${PUB}voynich/canvas/o1`);
  });

  it("is idempotent — an IRI already at the base re-mints to itself", () => {
    // Both the live-source projection and a load→publish round trip may apply this to an already
    // canonical target. Applying twice must not corrupt one.
    const once = rebaseCanvasId(`${WORKING}voynich/canvas/o1`, PUB, "voynich", known);
    expect(rebaseCanvasId(once, PUB, "voynich", known)).toBe(once);
  });

  it("leaves a tail that is NOT one of this exhibit's objects alone", () => {
    // The guard that keeps this a rebase rather than a fuzzy match: an unknown tail is not evidence
    // of this canvas at another origin, it is evidence of a different resource.
    expect(rebaseCanvasId(`${WORKING}voynich/canvas/o99`, PUB, "voynich", known))
      .toBe(`${WORKING}voynich/canvas/o99`);
  });

  it("leaves ANOTHER exhibit's canvas alone", () => {
    expect(rebaseCanvasId(`${WORKING}rosettes/canvas/o1`, PUB, "voynich", known))
      .toBe(`${WORKING}rosettes/canvas/o1`);
  });

  it("leaves a foreign IIIF canvas alone", () => {
    // Archie must never claim a canvas it does not publish — a note may legitimately target an
    // external IIIF resource.
    const foreign = "https://collections.library.yale.edu/iiif/2/1006231/canvas/p1";
    expect(rebaseCanvasId(foreign, PUB, "voynich", known)).toBe(foreign);
  });

  it("keeps a media-fragment attached to the tail", () => {
    // A bare-string target may carry `#xywh=` (legal WADM). The fragment is not part of the object
    // id; dropping it would silently turn a region note into a whole-canvas note.
    expect(rebaseCanvasId(`${WORKING}voynich/canvas/o1#xywh=pixel:10,20,30,40`, PUB, "voynich", known))
      .toBe(`${PUB}voynich/canvas/o1#xywh=pixel:10,20,30,40`);
  });

  it("takes the RIGHTMOST canvas segment when the base repeats the slug", () => {
    // `https://host/voynich/published/voynich/canvas/o1` — indexOf would slice at the base's own
    // occurrence and derive a garbage object id.
    expect(rebaseCanvasId("https://host/voynich/published/voynich/canvas/o1", PUB, "voynich", known))
      .toBe(`${PUB}voynich/canvas/o1`);
  });

  it("refuses a tail with a nested path or no tail at all", () => {
    for (const bad of [`${WORKING}voynich/canvas/o1/extra`, `${WORKING}voynich/canvas/`]) {
      expect(rebaseCanvasId(bad, PUB, "voynich", known)).toBe(bad);
    }
  });
});
