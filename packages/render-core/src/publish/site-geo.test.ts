// Regression: the live-source published with baseUrl=`${PUBLISHED}/` (a tree path) while the Studio writes
// annotation targets against BASE (https://archie.demo/). site.ts groups per-canvas annotations by
// `targetSource(h) === ${baseUrl}{slug}/canvas/{id}`, so a mismatched base silently DROPS every annotation —
// invisible for images (baked via a consistent base) but fatal for maps (live-source only). These tests pin
// the base-match contract AND that a Map object's annotations (with archie:geo) project + survive publish.
import { describe, it, expect } from "vitest";
import { publishLibrary } from "./site.js";
import { fsJsonSource } from "./read.js";
import { MemoryFilesystem } from "../fs/memory.js";
import { appendNew } from "../spine/log.js";
import { asClientId, asExhibitId, asLibraryId, asObjectId } from "../wadm/brand.js";
import type { Library } from "../model/model.js";
import type { TileSourceDescriptor } from "../iiif/resolve.js";
import type { AnnotationLog, W3CAnnotation } from "../wadm/types.js";

const alice = asClientId("alice");
const BASE = "https://archie.demo/";
const tileSource: TileSourceDescriptor = { kind: "xyz", template: "https://t/{z}/{x}/{y}.png", tileSize: 256, minZoom: 0, maxZoom: 6, bounds: [-1, 50, 1, 52] };
const library: Library = { id: asLibraryId("lib"), exhibits: [{ id: asExhibitId("exMap"), slug: "geo", title: "Geo", objects: [{ id: asObjectId("m1"), source: tileSource.template, label: "Map", tileSource }] }] };
// a geo-region note targeting the map canvas at BASE, carrying archie:geo (geo-truth)
const log: AnnotationLog = appendNew([], {
  target: { type: "SpecificResource", source: `${BASE}geo/canvas/m1`, selector: { type: "FragmentSelector", value: "xywh=pixel:100,100,40,40" } },
  geo: { type: "bbox", west: -0.1, south: 51.4, east: 0.1, north: 51.6 },
  lastEditor: alice, modifiedAt: "t", now: 1,
}).log;
const getLog = (id: string): AnnotationLog => (id === "exMap" ? log : []);

async function mapPage(baseUrl: string): Promise<{ items?: W3CAnnotation[] }> {
  const fs = new MemoryFilesystem();
  await publishLibrary(fs, library, getLog, { baseUrl });
  return fsJsonSource(fs).get<{ items?: W3CAnnotation[] }>("geo/canvas/m1/annotations.json");
}

describe("publishLibrary — Map annotation projection (live-source baseUrl regression)", () => {
  it("projects a Map object's annotations + carries archie:geo when baseUrl matches the target base", async () => {
    const page = await mapPage(BASE);
    expect(page.items?.length).toBe(1);
    expect((page.items![0] as unknown as Record<string, unknown>)["archie:geo"]).toEqual({ type: "bbox", west: -0.1, south: 51.4, east: 0.1, north: 51.6 });
  });

  it("DROPS the annotations when baseUrl ≠ the target base (the bug the live source hit)", async () => {
    const page = await mapPage("/published/");
    expect(page.items?.length ?? 0).toBe(0);
  });
});
