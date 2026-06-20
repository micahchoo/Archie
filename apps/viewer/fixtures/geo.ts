// "World map (geo-annotation prototype)" — the geo-annotation Playground template (DESIGN.md / ADR-0015).
// A single slippy-map basemap as a first-class Archie surface: OSM raster XYZ tiles fetched live (Phase 1),
// mounted as a BOUNDED OSD pixel raster (render-mount/xyz — NO MapLibre). Hand-seeded city pins demonstrate
// geo-anchoring: each note is an ordinary pixel-selector annotation placed at lngLatToPixel(city), carrying
// an archie:geo bbox (geo-truth, Q4) so the Viewer's lng/lat readout derives back from the pixel centre.
//
// SINGLE SOURCE OF TRUTH (§A): the basemap descriptor, rights, object, cover, and seeded pins live HERE and
// ONLY here. Both the Studio (seed-data.ts → seededGeo / DEFAULT_EXHIBITS) and the Viewer's published library
// (sample-data.ts → buildGeoLog) import this file; neither redefines the basemap or recomputes the pin
// geometry, so the authored Studio seed and the published bake cannot drift. Mirrors voynich.ts / atlas.ts.
import { lngLatToPixel, pixelToLngLat, thumbnailUrl, type AObject, type RightsFields, type TileSourceDescriptor } from "@render/core";

/** OSM raster XYZ template — `{z}/{x}/{y}` slippy tiles, fetched live. */
export const GEO_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** The basemap descriptor: whole-world Web-Mercator, maxZoom 6 (world→continent, light to demo). The full
 *  pixel extent is tileSize·2^maxZoom = 256·2^6 = 16384px square — the coordinate frame every pin lives in. */
export const geoBasemap: TileSourceDescriptor = { kind: "xyz", template: GEO_TEMPLATE, tileSize: 256, minZoom: 0, maxZoom: 6, attribution: "© OpenStreetMap contributors" };

/** The OSM tile usage policy REQUIRES attribution — surfaced as a credit on the Map canvas. */
export const geoRights: RightsFields = { rights: "https://opendatacommons.org/licenses/odbl/", requiredStatement: { label: "Basemap", value: "© OpenStreetMap contributors, ODbL." } };

export const geoTitle = "World map (geo-annotation prototype)";
export const geoSummary = "Drop pins on a live map — each one stays on its place as you zoom and pan, anchored to a longitude and latitude. An early look at annotating maps in Archie.";

/** The one Map object (the basemap canvas). Rights are spread by each consumer (mirrors atlasObjects). */
export const geoObjects: AObject[] = [{ id: "m1", source: GEO_TEMPLATE, label: "World basemap", tileSource: geoBasemap }];

/** A RENDERABLE gallery cover — the shallowest single world tile (z=minZoom, 0, 0); one fetch, a real image
 *  (the bare `{z}/{x}/{y}` template is not itself an image). thumbnailUrl owns the xyz→tile-URL derivation. */
export const geoCover = thumbnailUrl(geoBasemap);

// Seed pins: a few cities so the exhibit isn't empty and the lng/lat readout is immediately visible. The
// pixel region AND the geo bbox are COMPUTED ONCE here (against geoBasemap) so the Studio seed and the
// published bake place the IDENTICAL pins — the pin is a pixel-selector note, the bbox is its geo-truth.
const GEO_PIN_PX = 140; // image-px box at the full extent — a visible region at the world-fit zoom
const cities = [
  { name: "London", lng: -0.1276, lat: 51.5074 },
  { name: "New York", lng: -74.006, lat: 40.7128 },
  { name: "Tokyo", lng: 139.6917, lat: 35.6895 },
  { name: "Nairobi", lng: 36.8219, lat: -1.2921 },
];

/** Pre-computed seed pins (objectId · comment · pixel region · geo bbox), consumed by BOTH apps' note
 *  builders. Neither recomputes the geometry, so the Studio session seed and the Viewer's published log are
 *  pin-for-pin identical. The bbox is the SpecificResource's geo-truth (archie:geo on publish). */
export const geoNotes = cities.map((c) => {
  const p = lngLatToPixel({ lng: c.lng, lat: c.lat }, geoBasemap);
  const x = Math.round(p.x - GEO_PIN_PX / 2), y = Math.round(p.y - GEO_PIN_PX / 2);
  const nw = pixelToLngLat({ x, y }, geoBasemap);
  const se = pixelToLngLat({ x: x + GEO_PIN_PX, y: y + GEO_PIN_PX }, geoBasemap);
  return {
    objectId: "m1",
    comment: c.name,
    x, y, w: GEO_PIN_PX, h: GEO_PIN_PX,
    geo: { type: "bbox" as const, west: nw.lng, south: se.lat, east: se.lng, north: nw.lat },
  };
});
