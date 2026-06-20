import { describe, it, expect } from "vitest";
import { toManifest, canvasIdMap } from "./manifest.js";
import { canvasIdFor } from "./canvasid.js";
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
