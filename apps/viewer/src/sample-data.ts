// The Viewer's published Library — the three Voynich exhibits (Beinecke MS 408, generated ./voynich.ts),
// one shared seed rendered three ways (rosettes / grid / narrative). `published.ts` runs this through
// publishLibrary and reads it back per-exhibit, exactly as a static consumer would. One log per exhibit;
// each note targets its object's canvas.
import { appendNew, asClientId, type AObject, type AnnotationLog, type Library, type Section } from "@render/core";
import { voynichObjects, voynichNotes, voynichReadings, voynichReadingNotes, voynichAvNotes, voynichSections, voynichCredits } from "./voynich.js";
// Single source of truth lives in the viewer-owned base module (not this demo file), so the shell
// can import canvasIdFor without pulling in demo fixtures. Re-exported for gen-published.mts.
import { BASE, canvasIdFor } from "./published-base.js";
export { BASE, canvasIdFor };

const author = asClientId("curator");

// ADR-0007 — the Voynich reconceived as a genuinely-plural Readings exhibit: rival scholarly camps
// read the SAME marks incompatibly (the demo's payoff). The authored content (readings, the per-region
// reading/tag notes, the AV notes, the narrative sections) lives in the SHARED ./voynich.ts as the
// single source of truth so the Studio reads the IDENTICAL content. The SAME seed now feeds THREE
// exhibits — one per Archie layout, each a different story (the three-layout exercise):
//   • voynich-rosettes (SINGLE) — only o9 (the Rosettes foldout), only its R7 reading-notes.
//   • voynich          (GRID)   — all 11 folios + o12 sound, every reading-note (the main exhibit).
//   • voynich-reading  (NARRATIVE) — all + o12, every reading-note + the AV notes, the 6-beat spine.
// Notes target canvasIdFor(slug, objectId), so each exhibit needs its OWN log built against its OWN
// slug (a published note targets the canvas IRI baked with that slug). buildVoynichLog is the factory:
// it owns its log/running-now LOCALLY and filters by object id, so the three logs never share state.
// Append ORDER inside a log is load-bearing (appendNew needs a monotonic, distinct `now`, and the
// published logical IDs depend on it): base notes → reading notes in array order → AV notes.
function buildVoynichLog(slug: string, opts: { objectIds?: Set<string>; includeAv: boolean }): AnnotationLog {
  const keep = (objectId: string) => !opts.objectIds || opts.objectIds.has(objectId);
  let log: AnnotationLog = [];
  let now = 0; // running `now` — appendNew needs monotonic, distinct timestamps
  const addBody = (comment: string, tags?: string[]) => [
    { type: "TextualBody" as const, value: comment, purpose: "commenting" as const },
    ...(tags ?? []).map((tg) => ({ type: "TextualBody" as const, value: tg, purpose: "tagging" as const })),
  ];
  // Base captions (EMPTY this wave — shape preserved). Filtered by object id.
  for (const n of voynichNotes) {
    if (!keep(n.objectId)) continue;
    const [x, y, w, h] = n.region;
    ({ log } = appendNew(log, {
      target: { type: "SpecificResource", source: canvasIdFor(slug, n.objectId), selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${x},${y},${w},${h}` } },
      body: addBody(n.comment), lastEditor: author, now: ++now,
    }));
  }
  // §D — the per-region reading/tag notes (cipher/hoax/abjad on the same xywh), filtered by object id.
  for (const n of voynichReadingNotes) {
    if (!keep(n.objectId)) continue;
    ({ log } = appendNew(log, {
      target: { type: "SpecificResource", source: canvasIdFor(slug, n.objectId), selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `xywh=pixel:${n.xywh}` } },
      body: addBody(n.comment, n.tags), lastEditor: author, now: ++now, ...(n.reading ? { reading: n.reading } : {}),
    }));
  }
  // §E — AV-1…4 reading-bearing notes on the o12 sound canvas, appended AFTER the §D reading notes.
  // Only the GRID + NARRATIVE exhibits carry o12; t= ranges are PROVISIONAL.
  if (opts.includeAv && keep("o12")) {
    for (const a of voynichAvNotes) {
      ({ log } = appendNew(log, {
        target: { type: "SpecificResource", source: canvasIdFor(slug, "o12"), selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `t=${a.t}` } },
        body: addBody(a.comment, a.tags), lastEditor: author, now: ++now, ...(a.reading ? { reading: a.reading } : {}),
      }));
    }
  }
  return log;
}

// One log per slug from the SHARED note data (the wiring contract: notes target canvasIdFor(slug, …)).
const rosettesLog = buildVoynichLog("voynich-rosettes", { objectIds: new Set(["o9"]), includeAv: false }); // only o9's R7 notes
const voynichLog = buildVoynichLog("voynich", { includeAv: true }); // all folios + o12 (grid main)
const readingLog = buildVoynichLog("voynich-reading", { includeAv: true }); // all + AV (narrative)

// 11 IIIF-direct images + o12 (sound) — carry through the AV fields. Spread conditionally so o12 (which
// has no width/height) doesn't assign `width: undefined` (exactOptionalPropertyTypes), and so the sound
// canvas publishes with its mediaType/format/duration (Sound canvas, audio/mpeg, 296s — §B/§E).
// Each folio IS a Beinecke folio → the credit + license is TRUEST at the object level (CONTEXT Q2), and
// now lives on the SHARED seed (voynich.ts) so Studio carries it too — preserved through (no longer
// overwritten here): per-object `rights` (Public Domain Mark for the folios, CC BY-NC-SA 3.0 for the
// sound) + `requiredStatement` publish onto the canvas, so Mirador shows it free and the Reader renders
// the object's OWN credit — NOT a Viewer-side display fallback (Q5: the Viewer never re-runs inheritance).
const voynichObjs: AObject[] = voynichObjects.map((o) => ({
  id: o.id, source: o.source, label: o.label,
  ...(o.width !== undefined ? { width: o.width } : {}),
  ...(o.height !== undefined ? { height: o.height } : {}),
  ...(o.mediaType ? { mediaType: o.mediaType } : {}),
  ...(o.format ? { format: o.format } : {}),
  ...(o.duration !== undefined ? { duration: o.duration } : {}),
  ...(o.rights ? { rights: o.rights } : {}),
  ...(o.requiredStatement ? { requiredStatement: o.requiredStatement } : {}),
}));
// The SINGLE exhibit's object set: only o9 (the Rosettes foldout), carrying its own Beinecke credit.
const rosettesObjs: AObject[] = voynichObjs.filter((o) => o.id === "o9");

// §G — the 6-beat narrative spine (03 §3) now lives in the shared ./voynich.ts (imported above as
// voynichSections). A Section is a self-contained reading beat (ADR-0005): its own camera target
// (`start`) + curator prose. Attached to ex-voynich-reading below; publishes as IIIF Ranges and
// round-trips via sectionsFromManifest. The imported VoynichSection is structurally a
// Section; the explicit annotation keeps the Library type-checked.
const voynichSectionsTyped: Section[] = voynichSections;

export const library: Library = {
  id: "archie-lib",
  title: "The Archie Library",
  // A genuine library summary now that the Beinecke credit moved to its EXHIBIT (rights grill un-hack):
  // `voynichCredits` was abusing `library.summary` to surface the Voynich folio attribution, but the
  // Beinecke isn't the LIBRARY's provider. The credit now lives on each voynich exhibit's
  // `requiredStatement`; the library carries no library-wide credit.
  summary: "A contested manuscript read more than one way — Beinecke MS 408, the same undeciphered marks read three ways across three exhibits.",
  exhibits: [
    // THE THREE-LAYOUT EXERCISE — one shared seed (./voynich.ts), three exhibits, each a different story,
    // each a different Archie layout. The Viewer's resolveLayout RE-DERIVES the layout from objects/sections
    // (sections ⇒ narrative; >1 object ⇒ grid; one ⇒ single), so the SHAPE here picks the reader; `layout`
    // is the authored intent (Studio + the published manifest). cover = a RENDERABLE IIIF 400px derivative
    // (the gallery card needs an image, not the bare service base which resolves to info.json). Each folio's
    // own Beinecke credit lives on the object (rights un-hack); the exhibit `requiredStatement` is the chrome
    // credit line. Each summary EXPLICITLY names its layout word.
    //
    // SINGLE — "The Rosettes": just o9 (the f85v–86r foldout), no sections → resolveLayout = single → Reader
    // deep-zoom + the 3-option readings legend over the one canvas.
    { id: "ex-voynich-rosettes", slug: "voynich-rosettes", title: "The Rosettes", summary: "A single-folio deep-zoom study: the Rosettes foldout (f85v–86r), the largest spread in MS 408, read three ways — cipher, hoax, and natural language — over one canvas.", cover: "https://collections.library.yale.edu/iiif/2/1006231/full/400,/0/default.jpg", objects: rosettesObjs, layout: "single", readings: voynichReadings, requiredStatement: { label: "Source", value: voynichCredits } },
    // GRID — "The Whole Manuscript" (the MAIN voynich slug): all 11 folios + the sounded page, NO sections →
    // resolveLayout = grid → ObjectGrid; click a folio → Reader with the prev/next carousel + legend + tags.
    { id: "ex-voynich", slug: "voynich", title: "The Whole Manuscript", summary: "A grid of all eleven folios of MS 408 across its six sections — herbal, astronomical, balneological, cosmological, pharmaceutical, and recipes — to browse side by side, each readable three ways, with a sounded page.", cover: "https://collections.library.yale.edu/iiif/2/1006076/full/400,/0/default.jpg", objects: voynichObjs, layout: "grid", readings: voynichReadings, requiredStatement: { label: "Source", value: voynichCredits } },
    // NARRATIVE — "Reading the Unreadable": all + the sounded page, the 6-beat voynichSections attached →
    // resolveLayout = narrative → NarrativeReader (the section spine + the readings-legend fix + AV notes).
    { id: "ex-voynich-reading", slug: "voynich-reading", title: "Reading the Unreadable", summary: "A narrative walk through the six divisions of MS 408 — herbal to recipes — pausing on each to read the same undeciphered marks three ways, ending on a page sounded aloud.", cover: "https://collections.library.yale.edu/iiif/2/1006231/full/400,/0/default.jpg", objects: voynichObjs, layout: "narrative", sections: voynichSectionsTyped, readings: voynichReadings, requiredStatement: { label: "Source", value: voynichCredits } },
  ],
};

const logsById: Record<string, AnnotationLog> = { "ex-voynich-rosettes": rosettesLog, "ex-voynich": voynichLog, "ex-voynich-reading": readingLog };
/** Log lookup for publishLibrary, by exhibit id. */
export const getLog = (exhibitId: string): AnnotationLog => logsById[exhibitId] ?? [];
