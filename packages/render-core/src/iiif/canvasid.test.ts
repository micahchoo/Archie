import { describe, it, expect } from "vitest";
import { toManifest, canvasIdMap } from "./manifest.js";
import type { Exhibit } from "../model/model.js";

// canvasIdMap is the SNAG fix: the canvas IRI must come from the manifest (which bakes the publish
// origin), NOT a fixed viewer-side BASE. This test pins that it reflects the manifest's baseUrl.

const ex: Exhibit = {
  id: "e",
  slug: "voynich",
  title: "V",
  objects: [
    { id: "o1", source: "https://img/1.jpg", label: "one" },
    { id: "o2", source: "https://img/2.jpg", label: "two" },
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
