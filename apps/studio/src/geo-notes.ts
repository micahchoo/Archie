// Geo-note selector math (the DOMINO cut out of App.svelte): the two pure helpers that turn a note's
// pixel selector / stored geo-truth into a lng/lat readout, and a drawn region's WORLD-pixel selector
// into its lng/lat anchor. Both took the reactive `currentTileSource` via closure in App.svelte; here
// they take the `TileSourceDescriptor` explicitly, so they are pure and unit-testable. The underlying
// projection (pixel↔lng/lat) is core's geometry/geo — this module only composes it over a note's shape.
import {
  formatLngLat, parseFragmentXYWH, parsePolygonPoints, pixelToLngLat,
  type AnnotationRecord, type W3CTarget, type GeoAnchor, type TileSourceDescriptor,
} from "@render/core";

/** The selector `value` string off a record's target (xywh / polygon fragment), or "" if absent. */
export const selectorValue = (r: AnnotationRecord): string =>
  ((r.target as { selector?: { value?: string } } | undefined)?.selector?.value) ?? "";

// Geo readout (geo-annotation, Q5): the region's CENTRE lng/lat. Prefer the stored geo-truth (archie:geo,
// ADR-0015 — record.geo); fall back to deriving from the pixel selector for any pre-geo record. Returns
// null off a Map (no tileSource) or when the shape can't be located.
export function geoLabelOf(r: AnnotationRecord, ts: TileSourceDescriptor | undefined): string | null {
  if (!ts) return null;
  if (r.geo?.type === "bbox") return formatLngLat({ lng: (r.geo.west + r.geo.east) / 2, lat: (r.geo.south + r.geo.north) / 2 });
  if (r.geo?.type === "polygon" && r.geo.coordinates.length) {
    const cs = r.geo.coordinates;
    return formatLngLat({ lng: cs.reduce((s, c) => s + c[0], 0) / cs.length, lat: cs.reduce((s, c) => s + c[1], 0) / cs.length });
  }
  const box = parseFragmentXYWH(selectorValue(r));
  if (!box) return null;
  return formatLngLat(pixelToLngLat({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, ts));
}

// Geo-truth capture (Q4 / ADR-0015): turn a drawn region's WORLD-pixel selector into its lng/lat anchor
// (the source of truth). Box → bbox (NW/SE corners); Outline → polygon (each vertex). undefined off-map.
export function geoForTarget(target: W3CTarget, ts: TileSourceDescriptor | undefined): GeoAnchor | undefined {
  if (!ts) return undefined;
  const v = (target as { selector?: { value?: string } } | undefined)?.selector?.value;
  if (!v) return undefined;
  const box = parseFragmentXYWH(v);
  if (box) {
    const nw = pixelToLngLat({ x: box.x, y: box.y }, ts);
    const se = pixelToLngLat({ x: box.x + box.w, y: box.y + box.h }, ts);
    return { type: "bbox", west: nw.lng, south: se.lat, east: se.lng, north: nw.lat };
  }
  const pts = parsePolygonPoints(v);
  if (pts) return { type: "polygon", coordinates: pts.map((p) => { const ll = pixelToLngLat(p, ts); return [ll.lng, ll.lat] as [number, number]; }) };
  return undefined;
}
