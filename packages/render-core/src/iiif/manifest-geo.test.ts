// Map descriptor round-trip through the IIIF manifest (Phase 4 — DESIGN.md (e) / ADR-0015): toCanvas emits
// archie:tileSource only for Maps (byte-stable otherwise); objectsFromManifest reads it back. This is the
// seam the published Viewer relies on (it renders from the manifest, not the live store).
import { describe, it, expect } from "vitest";
import { toManifest, objectsFromManifest } from "./manifest.js";
import type { Exhibit } from "../model/model.js";
import type { TileSourceDescriptor } from "./resolve.js";
import { asExhibitId, asObjectId } from "../wadm/brand.js";

const ts: TileSourceDescriptor = {
  kind: "xyz",
  template: "https://tile.example/{z}/{x}/{y}.png",
  tileSize: 256,
  minZoom: 0,
  maxZoom: 6,
  bounds: [-0.5, 51.3, 0.3, 51.7],
  attribution: "© OpenStreetMap contributors",
};
const mapExhibit: Exhibit = { id: asExhibitId("ex"), slug: "geo", title: "Geo", objects: [{ id: asObjectId("m1"), source: ts.template, label: "World map", tileSource: ts }] };

describe("Map tileSource round-trip through the manifest", () => {
  it("toManifest → objectsFromManifest preserves the descriptor", () => {
    const objs = objectsFromManifest(toManifest(mapExhibit));
    expect(objs[0]!.tileSource).toEqual(ts);
  });

  it("emits archie:tileSource on a Map canvas", () => {
    const m = toManifest(mapExhibit);
    expect((m.items[0] as unknown as Record<string, unknown>)["archie:tileSource"]).toEqual(ts);
  });

  it("is byte-stable for a non-Map object (no archie:tileSource key)", () => {
    const m = toManifest({ id: asExhibitId("e"), slug: "img", title: "Img", objects: [{ id: asObjectId("o1"), source: "https://x/a.jpg", label: "img" }] });
    expect("archie:tileSource" in (m.items[0] as object)).toBe(false);
    expect(objectsFromManifest(m)[0]!.tileSource).toBeUndefined();
  });

  it("a malformed archie:tileSource reads back as absent (skip, not throw)", () => {
    const m = toManifest(mapExhibit);
    (m.items[0] as unknown as Record<string, unknown>)["archie:tileSource"] = { kind: "xyz" }; // missing template/maxZoom
    expect(objectsFromManifest(m)[0]!.tileSource).toBeUndefined();
  });
});
