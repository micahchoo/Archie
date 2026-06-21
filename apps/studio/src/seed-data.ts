// Seed / default-exhibit data (the DOMINO cut out of App.svelte — pure data + constructors). Owns:
//   - BASE (the demo Library's canonical baseUrl) + the pure region/time selector constructors,
//   - the bundled DEFAULT_EXHIBITS (the three-layout Voynich exercise + the atlas + the geo-map),
//   - the per-slug AnnotationSession seed factories (seededVoynich / seededAtlas / seededGeo).
// No component scope, no runes — the session factories take the `author` ClientId explicitly so a
// caller (App.svelte's openExhibit) wires the live identity. The SHARED authored content comes from
// the Viewer's voynich.ts / atlas.ts / geo.ts (single source of truth, §A) — both apps read it.
import {
  AnnotationSession, WORKING_IRI_BASE,
  type Section, type W3CBody, type ClientId,
  type WorkingExhibitMeta,
  timeFragmentValue, mediaFragmentValue, fragmentSelector, canvasIdFor,
} from "@render/core";
// The canonical authored-structure type is core's WorkingExhibitMeta (store.ts re-exports it as
// ExhibitMeta). Reference the core type directly here so DEFAULT_EXHIBITS' Map basemap object — whose
// `tileSource` lives on WorkingObjectMeta — types cleanly regardless of store.ts's re-export shape.
type ExhibitMeta = WorkingExhibitMeta;
import { atlasTitle, atlasSummary, atlasRights, atlasReadings, atlasObjects, atlasNotes } from "../../viewer/fixtures/atlas.js";
import { voynichObjects, voynichNotes, voynichReadings, voynichReadingNotes, voynichAvNotes, voynichWholeObjectNotes, voynichSections } from "../../viewer/fixtures/voynich.js";
// The geo-annotation prototype's content lives in the SHARED fixture (single source of truth, §A) — the
// SAME module the Viewer's published bake reads. Re-export GEO_TEMPLATE/geoBasemap so existing Studio
// consumers (geo-notes.test.ts) keep importing them from here while the definitions live in one place.
import { geoRights, geoTitle, geoSummary, geoObjects, geoNotes } from "../../viewer/fixtures/geo.js";
export { GEO_TEMPLATE, geoBasemap } from "../../viewer/fixtures/geo.js";

/** The working-store IRI base — every authored/seeded note targets `${BASE}{slug}/canvas/{objId}`.
 *  Sourced from core's WORKING_IRI_BASE (the ONE namespace the Viewer's live source projects with), so
 *  the Studio writer and the live reader can't drift — the cause of "live exhibit shows no notes" when
 *  they did. App.svelte + ingest-flows share this; it is an internal identifier, NOT the published base. */
export const BASE = WORKING_IRI_BASE;

/** A pixel-region (xywh) selector target on a canvas — the OSD draw analogue. The value + selector
 *  shape are both minted by core (mediaFragmentValue + fragmentSelector) so they're one source of truth. */
export const rectSel = (canvas: string, x: number, y: number, w: number, h: number) => ({
  type: "SpecificResource" as const, source: canvas,
  selector: fragmentSelector(mediaFragmentValue({ box: { x, y, w, h }, unit: "pixel" })),
});
/** Temporal selector (AV notes) — the time analogue of rectSel; one source of truth for `t=` is core. */
export const timeSel = (canvas: string, start: number, end: number) => ({
  type: "SpecificResource" as const, source: canvas,
  selector: fragmentSelector(timeFragmentValue(start, end)),
});

// §B object set: 11 IIIF-direct images + 1 sound (o12). Spread width/height/mediaType/duration
// conditionally — o12 (sound) carries no dims, and exactOptionalPropertyTypes forbids `width: undefined`.
const voynichObjMeta = voynichObjects.map((o) => ({ id: o.id, source: o.source, label: o.label, ...(o.width !== undefined ? { width: o.width } : {}), ...(o.height !== undefined ? { height: o.height } : {}), ...(o.mediaType ? { mediaType: o.mediaType } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}) }));

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
  // GEO MAP — the geo-annotation prototype (DESIGN.md / ADR-0015). One slippy-map basemap object, geo-annotated
  // with pins anchored to lng/lat. Descriptor / object / title / summary all come from the SHARED
  // ../../viewer/fixtures/geo.ts (single source of truth) — the SAME source the Viewer's published bake reads,
  // so the Studio playground and the published demo can't drift.
  { id: "ex-geo", slug: "geo-map", title: geoTitle, summary: geoSummary, seedVersion: 1, ...geoRights, objects: geoObjects.map((o) => ({ ...o, ...geoRights })) },
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
    s.createNote({ target: rectSel(canvasIdFor(BASE, slug, n.objectId), x, y, w, h), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
  }
  for (const n of voynichReadingNotes) {
    if (!keep(n.objectId)) continue;
    const [x, y, w, h] = n.xywh.split(",").map(Number) as [number, number, number, number];
    const body: W3CBody[] = [
      { type: "TextualBody", value: n.comment, purpose: "commenting" },
      ...(n.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
    ];
    s.createNote({ target: rectSel(canvasIdFor(BASE, slug, n.objectId), x, y, w, h), body, ...(n.reading ? { reading: n.reading } : {}) });
  }
  if (opts.includeAv && keep("o12")) {
    for (const a of voynichAvNotes) {
      const [start, end] = a.t.split(",").map(Number) as [number, number];
      const body: W3CBody[] = [
        { type: "TextualBody", value: a.comment, purpose: "commenting" },
        ...(a.tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" })),
      ];
      s.createNote({ target: timeSel(canvasIdFor(BASE, slug, "o12"), start, end), body, ...(a.reading ? { reading: a.reading } : {}) });
    }
  }
  // Whole-object (Object-level) Notes — a BARE canvas IRI target string, no selector (ADR-0018). Seeded
  // LAST so existing notes are unchanged; the Studio frames the whole object like the published Viewer.
  for (const n of voynichWholeObjectNotes) {
    if (!keep(n.objectId)) continue;
    s.createNote({ target: canvasIdFor(BASE, slug, n.objectId), body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }] });
  }
  return s;
}
function seededAtlas(author: ClientId): AnnotationSession {
  const s = new AnnotationSession(author);
  for (const n of atlasNotes) {
    const [x, y, w, h] = n.region;
    s.createNote({
      target: rectSel(canvasIdFor(BASE, "language-atlas", n.objectId), x, y, w, h),
      body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }],
      ...(n.reading ? { reading: n.reading } : {}),
    });
  }
  return s;
}
// Seed the geo-map prototype with the SHARED city pins (../../viewer/fixtures/geo.ts → geoNotes) so the
// exhibit isn't empty and the lng/lat readout is immediately visible. The pixel region + geo bbox were
// computed ONCE in the shared fixture, so this Studio seed and the Viewer's published bake place pin-for-pin
// identical notes. Each pin is an ordinary pixel-selector note; the map surface keeps it geo-anchored.
function seededGeo(author: ClientId): AnnotationSession {
  const s = new AnnotationSession(author);
  for (const n of geoNotes) {
    s.createNote({
      target: rectSel(canvasIdFor(BASE, "geo-map", n.objectId), n.x, n.y, n.w, n.h),
      body: [{ type: "TextualBody", value: n.comment, purpose: "commenting" }],
      geo: n.geo, // geo-truth (Q4)
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
