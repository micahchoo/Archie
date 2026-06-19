// Seed / default-exhibit data (the DOMINO cut out of App.svelte — pure data + constructors). Owns:
//   - BASE (the demo Library's canonical baseUrl) + the pure region/time selector constructors,
//   - the bundled DEFAULT_EXHIBITS (the three-layout Voynich exercise + the atlas + the geo-map),
//   - the per-slug AnnotationSession seed factories (seededVoynich / seededAtlas / seededGeo).
// No component scope, no runes — the session factories take the `author` ClientId explicitly so a
// caller (App.svelte's openExhibit) wires the live identity. The SHARED authored content comes from
// the Viewer's voynich.ts / atlas.ts (single source of truth, §A) — both apps read it.
import {
  AnnotationSession, lngLatToPixel, pixelToLngLat, WORKING_IRI_BASE,
  type Section, type RightsFields, type TileSourceDescriptor, type W3CBody, type ClientId,
  type WorkingExhibitMeta,
  timeFragmentValue,
} from "@render/core";
// The canonical authored-structure type is core's WorkingExhibitMeta (store.ts re-exports it as
// ExhibitMeta). Reference the core type directly here so DEFAULT_EXHIBITS' Map basemap object — whose
// `tileSource` lives on WorkingObjectMeta — types cleanly regardless of store.ts's re-export shape.
type ExhibitMeta = WorkingExhibitMeta;
import { atlasTitle, atlasSummary, atlasRights, atlasReadings, atlasObjects, atlasNotes } from "../../viewer/fixtures/atlas.js";
import { voynichObjects, voynichNotes, voynichReadings, voynichReadingNotes, voynichAvNotes, voynichSections } from "../../viewer/fixtures/voynich.js";

/** The working-store IRI base — every authored/seeded note targets `${BASE}{slug}/canvas/{objId}`.
 *  Sourced from core's WORKING_IRI_BASE (the ONE namespace the Viewer's live source projects with), so
 *  the Studio writer and the live reader can't drift — the cause of "live exhibit shows no notes" when
 *  they did. App.svelte + ingest-flows share this; it is an internal identifier, NOT the published base. */
export const BASE = WORKING_IRI_BASE;

/** A pixel-region (xywh) selector target on a canvas — the OSD draw analogue. */
export const rectSel = (canvas: string, x: number, y: number, w: number, h: number) => ({
  type: "SpecificResource" as const, source: canvas,
  selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w},${h}` },
});
/** Temporal selector (AV notes) — the time analogue of rectSel; one source of truth for `t=` is core. */
export const timeSel = (canvas: string, start: number, end: number) => ({
  type: "SpecificResource" as const, source: canvas,
  selector: { type: "FragmentSelector" as const, conformsTo: "http://www.w3.org/TR/media-frags/", value: timeFragmentValue(start, end) },
});

// §B object set: 11 IIIF-direct images + 1 sound (o12). Spread width/height/mediaType/duration
// conditionally — o12 (sound) carries no dims, and exactOptionalPropertyTypes forbids `width: undefined`.
const voynichObjMeta = voynichObjects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}) }));
// Geo-annotation prototype (DESIGN.md): a slippy-map basemap as a first-class Archie surface. OSM raster
// XYZ tiles fetched LIVE (Phase 1; offline/baked tiles = Phase 3 / D1). maxZoom 6 = world→continent, light
// to demo. Attribution is REQUIRED by the OSM tile usage policy (surfaced as a credit on the canvas).
export const GEO_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const geoBasemap: TileSourceDescriptor = { kind: "xyz", template: GEO_TEMPLATE, tileSize: 256, minZoom: 0, maxZoom: 6, attribution: "© OpenStreetMap contributors" };
const geoRights: RightsFields = { rights: "https://opendatacommons.org/licenses/odbl/", requiredStatement: { label: "Basemap", value: "© OpenStreetMap contributors, ODbL." } };

// The default exhibits on first run: the imported Voynich manuscript (../../viewer/src/voynich.ts),
// one shared seed rendered three ways (rosettes / grid / narrative), the atlas, and the geo-map.
export const DEFAULT_EXHIBITS: ExhibitMeta[] = [
  // THE THREE-LAYOUT EXERCISE — one shared seed (../../viewer/src/voynich.ts), three exhibits, each a
  // different Archie layout. The authored readings/sections come from the SHARED voynich.ts (§G / ADR-0007).
  // seedVersion forces the onMount reconcile to treat a pre-exercise persisted copy as STALE and reseed
  // (the old single `voynich` was narrative @seedVersion 1 → bumped to 2 now it's the GRID main).
  // The leading surface is DERIVED from content (ADR-0016): `layout` is no longer written — resolveLayout
  // re-derives it (sections ⇒ narrative; >1 object ⇒ grid; one ⇒ single). The shape below IS the intent.
  // SINGLE — only o9 (the Rosettes foldout); no sections, one object → single.
  { id: "ex-voynich-rosettes", slug: "voynich-rosettes", title: "The Rosettes", seedVersion: 1, readings: voynichReadings, objects: voynichObjMeta.filter((o) => o.id === "o9") },
  // GRID — all 11 folios + the sounded page; NO sections, >1 object → grid (the main voynich slug).
  { id: "ex-voynich", slug: "voynich", title: "The Whole Manuscript", seedVersion: 2, readings: voynichReadings, objects: voynichObjMeta },
  // NARRATIVE — all + the sounded page, the 6-beat spine; sections present → narrative.
  { id: "ex-voynich-reading", slug: "voynich-reading", title: "Reading the Unreadable", seedVersion: 1, readings: voynichReadings, sections: voynichSections as Section[], objects: voynichObjMeta },
  // MAP/CLASSROOM — the segment-diverse template (③+⑬, Archie-eaae; user-decided in the grill):
  // UNESCO's endangered-languages atlas via the Internet Archive (CC BY-SA 4.0 — template-content
  // rule: third-party rights-clean, never the author's personal work). Two Readings demonstrate
  // the rival-interpretations differentiator in a non-manuscript register. DRAFT — human-gated.
  { id: "ex-atlas", slug: "language-atlas", title: atlasTitle, summary: atlasSummary, seedVersion: 1, readings: atlasReadings, ...atlasRights, objects: atlasObjects.map((o) => ({ ...o, ...atlasRights })) },
  // GEO MAP — the geo-annotation prototype (DESIGN.md). One slippy-map basemap object, geo-annotated with
  // pins anchored to lng/lat. Hand-seeded descriptor (no map-import UI yet — Phase 2 / D7). DRAFT: this is
  // the prototype the UI/UX grilling stress-tests.
  { id: "ex-geo", slug: "geo-map", title: "World map (geo-annotation prototype)", summary: "Drop pins on a live map — each one stays on its place as you zoom and pan, anchored to a longitude and latitude. An early look at annotating maps in Archie.", seedVersion: 1, ...geoRights, objects: [{ id: "m1", source: GEO_TEMPLATE, label: "World basemap", tileSource: geoBasemap, ...geoRights }] },
];

// Seed a default exhibit's notes so it isn't empty on first run (pre-OPFS). Per-slug because the
// three default exhibits share one seed (the Voynich folios) rendered three ways.
// Seed the Voynich from the SHARED authored content (../../viewer/src/voynich.ts) — the SAME source the
// Viewer publishes from, so the Studio boots with the full Readings exhibit. Order mirrors sample-data:
// base notes → the reading notes (xywh + reading + tag bodies) → the AV notes on the o12 sound canvas.
function seededVoynich(author: ClientId, slug: string, opts: { objectIds?: Set<string>; includeAv: boolean }): AnnotationSession {
  const keep = (objectId: string) => !opts.objectIds || opts.objectIds.has(objectId);
  const s = new AnnotationSession(author);
  for (const n of voynichNotes) {
    if (!keep(n.objectId)) continue;
    const [x, y, w, h] = n.region;
    s.createNote({ target: rectSel(`${BASE}${slug}/canvas/${n.objectId}`, x, y, w, h), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
  }
  for (const n of voynichReadingNotes) {
    if (!keep(n.objectId)) continue;
    const [x, y, w, h] = n.xywh.split(",").map(Number) as [number, number, number, number];
    const body: W3CBody[] = [
      { type: "TextualBody", value: n.comment, purpose: "commenting" },
      ...(n.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
    ];
    s.createNote({ target: rectSel(`${BASE}${slug}/canvas/${n.objectId}`, x, y, w, h), body, ...(n.reading ? { reading: n.reading } : {}) });
  }
  if (opts.includeAv && keep("o12")) {
    for (const a of voynichAvNotes) {
      const [start, end] = a.t.split(",").map(Number) as [number, number];
      const body: W3CBody[] = [
        { type: "TextualBody", value: a.comment, purpose: "commenting" },
        ...(a.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
      ];
      s.createNote({ target: timeSel(`${BASE}${slug}/canvas/o12`, start, end), body, ...(a.reading ? { reading: a.reading } : {}) });
    }
  }
  return s;
}
function seededAtlas(author: ClientId): AnnotationSession {
  const s = new AnnotationSession(author);
  for (const n of atlasNotes) {
    const [x, y, w, h] = n.region;
    s.createNote({
      target: rectSel(`${BASE}language-atlas/canvas/${n.objectId}`, x, y, w, h),
      body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }],
      ...(n.reading ? { reading: n.reading } : {}),
    });
  }
  return s;
}
// Seed the geo-map prototype with a few city pins so the exhibit isn't empty and the lng/lat readout is
// immediately visible. Pins are ordinary pixel-selector notes placed at lngLatToPixel(city) — the map
// surface keeps them geo-anchored; the readout derives lng/lat back from the pixel centre (geometry/geo).
function seededGeo(author: ClientId): AnnotationSession {
  const s = new AnnotationSession(author);
  const cities = [
    { name: "London", lng: -0.1276, lat: 51.5074 },
    { name: "New York", lng: -74.006, lat: 40.7128 },
    { name: "Tokyo", lng: 139.6917, lat: 35.6895 },
    { name: "Nairobi", lng: 36.8219, lat: -1.2921 },
  ];
  const W = 140; // image-px box at the full extent — a visible region at the world-fit zoom
  for (const c of cities) {
    const p = lngLatToPixel({ lng: c.lng, lat: c.lat }, geoBasemap);
    const x = Math.round(p.x - W / 2), y = Math.round(p.y - W / 2);
    const nw = pixelToLngLat({ x, y }, geoBasemap);
    const se = pixelToLngLat({ x: x + W, y: y + W }, geoBasemap);
    s.createNote({
      target: rectSel(`${BASE}geo-map/canvas/m1`, x, y, W, W),
      body: [{ type: "TextualBody", value: c.name, purpose: "commenting" }],
      geo: { type: "bbox", west: nw.lng, south: se.lat, east: se.lng, north: nw.lat }, // geo-truth (Q4)
    });
  }
  return s;
}

/** The per-slug seed factory: returns a thunk that builds the seed session for a default slug, or null
 *  for a user-created exhibit (no seed). The `author` is threaded so seeded notes stamp the live identity. */
export const seededFor = (author: ClientId, slug: string): (() => AnnotationSession) | null =>
  slug === "voynich-rosettes" ? () => seededVoynich(author, "voynich-rosettes", { objectIds: new Set(["o9"]), includeAv: false })
  : slug === "voynich" ? () => seededVoynich(author, "voynich", { includeAv: true })
  : slug === "voynich-reading" ? () => seededVoynich(author, "voynich-reading", { includeAv: true })
  : slug === "language-atlas" ? () => seededAtlas(author)
  : slug === "geo-map" ? () => seededGeo(author)
  : null;
