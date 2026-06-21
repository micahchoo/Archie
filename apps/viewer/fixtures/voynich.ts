// The SINGLE Voynich seed — Beinecke MS 408, the genuinely-plural Readings exhibit (ADR-0007).
// Authored directly as render-core `AObject[]` (no more VoynichObject/VoynichNote mini-schema).
// SOURCE OF TRUTH for both the Viewer (sample-data.ts) and the Studio (App.svelte) — the duplicate
// apps/studio/src/voynich.ts was deleted in the Phase-4 A2 surgery (one source of truth).
//
// IMAGE OBJECTS (o1–o11) reference Yale IIIF DIRECTLY (no download): `source` is the bare image-service
// base `https://collections.library.yale.edu/iiif/2/{imageId}` — resolveTileSource (ADR-0004) normalises
// it to `{base}/info.json` and classifies it `kind:"iiif"`, so OSD consumes the institutional tile server.
// imageIds + native px verified against the live IIIF Presentation-3 manifest (collections.library.yale.edu
// /manifests/2002046, 213 canvases) per docs/exhibits/voynich-rewrite/01 §3 + 03 §1.
//
// o12 is the SOUND object (the Kryptogramm sonification of folio 18v) — the AV evidence in the
// cipher/hoax/natural-language debate (04-design §E; 02-av-and-material-manifest §1). It maps to o2 (f18v),
// the very page it sonifies.
import { asObjectId, type AObject } from "@render/core";

export const voynichTitle = "The Voynich Manuscript";
export const voynichCredits =
  "Voynich folios courtesy of the Beinecke Rare Book and Manuscript Library, Yale University (MS 408), via the IIIF image service. Sound: Kryptogramm — “04-f18v” (Elias Schwerdtfeger), CC BY-NC-SA 3.0.";

// Yale IIIF image-service base for a canvas imageId. The numeric tail is the imageId (01 §3 URL grammar).
const iiif = (imageId: string) => `https://collections.library.yale.edu/iiif/2/${imageId}`;

// o12 audio. TODO(Wave 2 / build): re-host on one.compost.digital per the CC BY-NC-SA 3.0 Share-Alike
// + attribution requirement (02 §3 / HANDOFF — re-host approved, not yet done). Until then, link the
// Internet Archive master directly. duration 296 s (4:57, 296.96s — 02 §1).
const AV_SOURCE = "https://archive.org/download/kryptogramm/04-f18v.mp3";

// 12 objects: 11 IIIF-direct images across all six MS-408 sections + 1 sound (04-design §B).
// width/height are the manifest's native px (verified live). NO pixel coords / regions this wave (Wave 1
// scaffold) — the per-region reading/tag notes are authored in Wave 2.
//
// RIGHTS (per-object, on the SHARED seed so Studio + Viewer both carry it — AObject extends RightsFields).
// Each folio o1–o11 IS a Beinecke MS 408 leaf → the attribution is truest at the OBJECT level: the
// Public-Domain-Mark license URI (an approved LICENSES entry) + the MS-408 credit. The sound o12 is
// Schwerdtfeger's Kryptogramm, a DIFFERENT rights-holder → its own CC BY-NC-SA 3.0 statement + URI.
const BEINECKE_RIGHTS = "http://creativecommons.org/publicdomain/mark/1.0/"; // Public Domain Mark 1.0 (LICENSES)
const BEINECKE_STATEMENT = { label: "Source", value: "Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)" } as const;
const folio = (o: AObject): AObject => ({ ...o, rights: BEINECKE_RIGHTS, requiredStatement: { ...BEINECKE_STATEMENT } });
export const voynichObjects: AObject[] = [
  folio({ id: asObjectId("o1"), source: iiif("1006076"), label: "f1r — Herbal (opening page)", width: 2972, height: 3766 }),
  folio({ id: asObjectId("o2"), source: iiif("1006109"), label: "f18v — Herbal (the sonified folio)", width: 2846, height: 3781 }),
  folio({ id: asObjectId("o3"), source: iiif("1006123"), label: "f25v — Herbal", width: 2863, height: 3769 }),
  folio({ id: asObjectId("o4"), source: iiif("1006139"), label: "f33v — Herbal", width: 2871, height: 3769 }),
  folio({ id: asObjectId("o5"), source: iiif("1006194"), label: "f67r — Astronomical (foldout)", width: 4972, height: 3738 }),
  folio({ id: asObjectId("o6"), source: iiif("1006196"), label: "f68r — Astronomical (foldout star-chart)", width: 7993, height: 3828 }),
  folio({ id: asObjectId("o7"), source: iiif("1006208"), label: "f75r — Balneological", width: 2852, height: 3759 }),
  folio({ id: asObjectId("o8"), source: iiif("1006214"), label: "f78r — Balneological", width: 2793, height: 3761 }),
  folio({ id: asObjectId("o9"), source: iiif("1006231"), label: "f85v–86r — Cosmological (the Rosettes foldout)", width: 7925, height: 7268 }),
  folio({ id: asObjectId("o10"), source: iiif("1006246"), label: "f99r — Pharmaceutical", width: 2702, height: 3765 }),
  folio({ id: asObjectId("o11"), source: iiif("1006277"), label: "f116v — Recipes (the final page)", width: 2686, height: 3697 }),
  { id: asObjectId("o12"), source: AV_SOURCE, label: "Kryptogramm — “04-f18v” (sonified folio 18v)", mediaType: "sound", format: "audio/mpeg", duration: 296,
    rights: "http://creativecommons.org/licenses/by-nc-sa/3.0/",
    requiredStatement: { label: "Sound", value: "Kryptogramm — Elias Schwerdtfeger, CC BY-NC-SA 3.0" } },
];

// Base captions (purpose:commenting) for the always-visible BASE layer. ONE reading-LESS note per image
// folio o1–o11, so the DEFAULT view (no reading selected — activeReading === null) is never empty:
// annotationsOf() returns these whenever no reading is active (ExhibitView §Q16). Content is NEUTRAL
// curator description of what the folio DEPICTS, drawn from 03-analysis §3 + 01-foundation §2/§3 — NOT
// interpretive (cipher/hoax/abjad stays in the reading notes). Filtered by object id in buildVoynichLog,
// so the SINGLE Rosettes exhibit (o9 only) gets o9's, and the grid/narrative get all eleven. o12 (sound)
// already carries its own AV base — none added here. `region` is an APPROX rect (// xywh APPROX —
// human visual-tune): centred on the folio's characteristic feature, native px per voynichObjects.
export interface VoynichNote { objectId: string; region: [number, number, number, number]; comment: string }
export const voynichNotes: VoynichNote[] = [
  // o1 f1r (2972×3766) Herbal — the opening page. // xywh APPROX — human visual-tune
  { objectId: "o1", region: [260, 240, 2400, 3300], comment: "The opening page: a single herbal plant rising the height of the leaf, with the manuscript's first lines of script flowing around it. A faded, erased inscription sits in the top margin — the earliest trace of an owner's hand." },
  // o2 f18v (2846×3781) Herbal — the sonified folio. // xywh APPROX — human visual-tune
  { objectId: "o2", region: [240, 260, 2360, 3260], comment: "A herbal folio in the same plant-to-a-page grammar — one drawing, a block of text set beside it. This is the page sounded aloud in the recording that accompanies the manuscript." },
  // o3 f25v (2863×3769) Herbal. // xywh APPROX — human visual-tune
  { objectId: "o3", region: [240, 260, 2380, 3260], comment: "A vivid herbal plant in strong colour, among the most often reproduced of the botanical pages. The paint sits over an earlier outline, laid on more crudely than the drawing beneath it." },
  // o4 f33v (2871×3769) Herbal. // xywh APPROX — human visual-tune
  { objectId: "o4", region: [240, 260, 2380, 3260], comment: "A striking, near-fantastical herbal drawing — a plant that does not match any growing thing with certainty. Its layered paint and ink reward close looking." },
  // o5 f67r (4972×3738) Astronomical foldout. // xywh APPROX — human visual-tune
  { objectId: "o5", region: [300, 240, 4300, 3250], comment: "An astronomical foldout: circular diagrams of Sun, Moon, and stars, wider than a standard leaf. Rings of small labelled words surround the central wheel." },
  // o6 f68r (7993×3828) Astronomical foldout star-chart. // xywh APPROX — human visual-tune
  { objectId: "o6", region: [400, 240, 7100, 3350], comment: "A wide foldout star-chart: a dense cluster of stars, each tied to a small written label, spread across an unusually broad leaf." },
  // o7 f75r (2852×3759) Balneological. // xywh APPROX — human visual-tune
  { objectId: "o7", region: [240, 300, 2360, 3200], comment: "A balneological page: small bathing figures moving through green networks of pipes, pools, and basins, with text running continuously between them." },
  // o8 f78r (2793×3761) Balneological. // xywh APPROX — human visual-tune
  { objectId: "o8", region: [240, 300, 2300, 3200], comment: "The most reproduced of the bathing pages: nude figures connected by branching green tubes that carry liquid between basins — the signature imagery of this section." },
  // o9 f85v–86r Rosettes (7925×7268) Cosmological foldout. // xywh APPROX — human visual-tune
  { objectId: "o9", region: [600, 600, 6700, 6100], comment: "The Rosettes — nine medallions joined by causeways and castle-like forms, the largest spread in the manuscript. A six-panel foldout that opens far beyond a single leaf." },
  // o10 f99r (2702×3765) Pharmaceutical. // xywh APPROX — human visual-tune
  { objectId: "o10", region: [220, 300, 2260, 3200], comment: "A pharmaceutical page: rows of labelled containers set beside isolated roots and leaves — several of them tidier copies of plants from the opening herbal." },
  // o11 f116v (2686×3697) Recipes — final page. // xywh APPROX — human visual-tune
  { objectId: "o11", region: [200, 240, 2280, 3200], comment: "The manuscript's final page: short starred paragraphs and, set apart from the unknown script, a few lines in ordinary Latin written by a later hand." },
];

// Whole-object (Object-level) Notes — a Note whose target is the OBJECT itself (a bare canvas IRI,
// no selector — ADR-0018), not a drawn region. It frames the whole folio in the Viewer and is reachable
// from the note list / finder. Dogfoods the Object rung of the target-scope ladder. Consumers append
// these LAST (after the reading/AV notes) so the existing notes' deterministic logical ids are unchanged.
export interface VoynichWholeNote { objectId: string; comment: string }
export const voynichWholeObjectNotes: VoynichWholeNote[] = [
  { objectId: "o1", comment: "**The opening leaf, as a whole object.** Quire structure, the ruling of the page, and the erased ownership inscription in the top margin all belong to *folio 1r entire* — not to any single drawn region. This note is attached to the whole object (no box), so the Viewer frames the folio rather than pinning a spot on it." },
  { objectId: "o9", comment: "**The Rosettes foldout, as a whole object.** The nine medallions, their joining causeways, and the six-panel fold structure are properties of the spread *entire* (f85v–86r) — the largest object in the manuscript. Attached to the whole object (no box), so the Viewer frames the foldout rather than pinning one rosette." },
  // o12 is the SOUND object — a whole-object Note on a recording (no time range): the AV analogue, rendered
  // as the whole-track band above the transcript (ADR-0018), not a timeline mark.
  { objectId: "o12", comment: "This note is about the whole recording, not any moment in it: the Kryptogramm sonification reads folio 18v end to end. Whether you hear enciphered speech, a grille's rhythm, or an unknown real language is the manuscript's whole condition — so the claim attaches to the track entire." },
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// AUTHORED READINGS CONTENT (ADR-0007). The SINGLE SOURCE OF TRUTH for the genuinely-plural Voynich
// exhibit — extracted here so BOTH the Viewer (sample-data.ts → published tree) AND the Studio
// (App.svelte → seededVoynich + DEFAULT_EXHIBITS) read the IDENTICAL authored content. Previously this
// lived only in the Viewer's sample-data.ts, so the Studio booted the Voynich empty (no notes/readings/
// sections — the runtime bug this extraction fixes). Prose/regions are unchanged from sample-data.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface Reading { id: string; name: string; description: string; colour: string }

// Three rival readings of what Voynichese IS (ADR-0007; 03 §1 / 01 §4). Locked even-handed stance:
// equal descriptive weight, no hedging on hoax. cipher #3a6b4c (green) / hoax #a3553a (rust) pre-exist;
// abjad takes a distinct third hue #4c5d8a (slate-blue, the studio palette's next colour).
export const voynichReadings: Reading[] = [
  { id: "cipher", name: "Cipher reading", description: "The glyphs encode a real language through a cipher or steganographic scheme — the working assumption of the professional cryptanalysts (Currier, the Friedmans, Tiltman) who studied the manuscript.", colour: "#3a6b4c" },
  { id: "hoax", name: "Hoax reading", description: "The glyphs carry no content: Voynich-like text can be generated mechanically from prefix/stem/suffix tables drawn through a Cardan grille (Rugg 2004; Gaskell & Bowern 2022).", colour: "#a3553a" },
  { id: "abjad", name: "Natural-language reading", description: "The glyphs are a real natural language written plaintext in an invented alphabet — statistically compatible with natural language (Amancio et al. 2013), the basis of Bax's 2014 partial abjad-style reading.", colour: "#4c5d8a" },
];

// A per-region reading/tag note. `xywh` is the FragmentSelector pixel rect (string, as authored —
// APPROX, human visual-tune on verify); `reading` is the Reading id (undefined = base); `tags` ride
// alongside as purpose:tagging bodies (apparatus, not interpretation).
export interface VoynichReadingNote { objectId: string; xywh: string; comment: string; reading?: string; tags?: string[] }

// §D — the full reading set: regions R1–R8 + the 3 next-regions (o6/o7/o10) each carry THREE notes
// (cipher/hoax/abjad) on the SAME xywh (mutual exclusivity per reading, ADR-0007 — the toggle flips
// pages). 11 regions × 3 = 33 notes. ORDER IS LOAD-BEARING: the consumers append in array order to
// build a monotonic-`now` log; reordering changes the published logical IDs / byte output.
const R1 = "1500,360,1200,520";
const R2 = "300,1100,1100,620";
const R3 = "200,260,2400,3200";
const R4 = "260,2900,2300,560";
const R5 = "3600,520,420,180";
const O6 = "3400,1400,1000,1000";
const O7 = "300,900,2200,1900";
const R6 = "1400,1600,360,150";
const R7 = "3500,3300,900,700";
const O10 = "320,820,360,150";
const R8 = "200,160,2300,420";
export const voynichReadingNotes: VoynichReadingNote[] = [
  // R1 — f1r (o1, 2972×3766): opening incipit, first text paragraph upper-right beside the plant.
  { objectId: "o1", xywh: R1, comment: "Under the cipher reading, this is the manuscript's enciphered incipit — the opening lines a cryptographer would attack first, since openings often carry a title or invocation whose plaintext is guessable. The professional codebreakers (Currier, the Friedmans, Tiltman) all began here and none recovered it.", reading: "cipher", tags: ["botanical", "currier-hand-A", "marginalia", "provenance"] },
  { objectId: "o1", xywh: R1, comment: "Under the grille reading, this paragraph is the first output of a Cardan grille passed over prefix/stem/suffix tables — front-loaded, fluent-looking, and meaningless; its “opening” feel is an artefact of being generated first, not of any title.", reading: "hoax" },
  { objectId: "o1", xywh: R1, comment: "Under the abjad reading, these are the genuine first words of a natural-language preface in an invented alphabet; word-entropy here matches Latin/English (Landini), and the line behaves as a real text's opening would.", reading: "abjad" },

  // R2 — f18v (o2, 2846×3781): herbal text block beside the plant; the AV-anchored folio.
  { objectId: "o2", xywh: R2, comment: "Under the cipher reading, this block is enciphered description of the plant beside it — a herbal entry locked under a substitution or steganographic scheme.", reading: "cipher", tags: ["botanical", "currier-hand-A"] },
  { objectId: "o2", xywh: R2, comment: "Under the grille reading, the block is filler with no relation to the drawing; the apparent “caption” adjacency is the same page-layout habit the forger imitated, not meaning.", reading: "hoax" },
  { objectId: "o2", xywh: R2, comment: "Under the abjad reading, it is a plaintext herbal note whose statistics are “mostly compatible with natural languages and incompatible with random texts” (Amancio et al. 2013); Bax's method would attack the plant-name label first.", reading: "abjad" },

  // R3 — f25v (o3, 2863×3769): full-page herbal plant + its text (whole-page region).
  { objectId: "o3", xywh: R3, comment: "Under the cipher reading, drawing and text are a matched entry — the picture keys the cipher, the way a known herbal's illustration would hint at the enciphered plant-name.", reading: "cipher", tags: ["botanical", "currier-hand-A"] },
  { objectId: "o3", xywh: R3, comment: "Under the grille reading, the vivid later colour over an earlier outline is decoration added to sell the artefact; the text was generated independently of the plant, which is why no plant here is identifiable.", reading: "hoax" },
  { objectId: "o3", xywh: R3, comment: "Under the abjad reading, this is a real (possibly stylised or composite) plant with a genuine descriptive paragraph; unidentifiability reflects an unfamiliar regional flora, not absence of content.", reading: "abjad" },

  // R4 — f33v (o4, 2871×3769): the near-fantastical herbal drawing + caption line.
  { objectId: "o4", xywh: R4, comment: "Under the cipher reading, the “imaginary” plant is a deliberate cover image — the cipher's content need not match the picture, so an invented plant hides rather than reveals.", reading: "cipher", tags: ["botanical", "currier-hand-A"] },
  { objectId: "o4", xywh: R4, comment: "Under the grille reading, the fantastical plant is exactly what a forger with no botanical source produces; image and text are both invented, independently.", reading: "hoax" },
  { objectId: "o4", xywh: R4, comment: "Under the abjad reading, the drawing is a schematic of a real plant and the caption names it; Bax's program reads such labels by matching glyph-clusters to known plant names.", reading: "abjad" },

  // R5 — f67r (o5, 4972×3738, foldout): a single star-label in the outer ring of the astronomical diagram.
  { objectId: "o5", xywh: R5, comment: "Under the cipher reading, this one-word label is an enciphered star or month name — a short, high-value crib, which is why cryptanalysts targeted the labelled diagrams.", reading: "cipher", tags: ["astronomical-symbol", "foldout", "label-word"] },
  { objectId: "o5", xywh: R5, comment: "Under the grille reading, the label is a short grille-drawn token with no referent; its placement on a star is mimicry of real astronomical diagrams, not naming.", reading: "hoax" },
  { objectId: "o5", xywh: R5, comment: "Under the abjad reading, the label is a real word — plausibly a star or zodiac-figure name — written abjad-style; Bax's 2014 decoding proposed exactly such proper-name readings of Voynichese labels.", reading: "abjad" },

  // o6 — f68r (7993×3828, foldout star-chart): next-region, the star-cluster.
  { objectId: "o6", xywh: O6, comment: "Under the cipher reading, the cluster of small star-labels is a field of enciphered short tokens — exactly the high-value single-word cribs the codebreakers hunted across the labelled diagrams.", reading: "cipher", tags: ["astronomical-symbol", "foldout"] },
  { objectId: "o6", xywh: O6, comment: "Under the grille reading, the scattered labels are grille-drawn tokens sprinkled to mimic a real star-chart; their density sells the diagram without any of them naming a star.", reading: "hoax" },
  { objectId: "o6", xywh: O6, comment: "Under the abjad reading, each label is a genuine star or constellation name in the invented alphabet, distributed across the cluster as a real celestial chart would name its points.", reading: "abjad" },

  // o7 — f75r (2852×3759, balneological): next-region, the pool-and-tube cluster.
  { objectId: "o7", xywh: O7, comment: "Under the cipher reading, the text threading the pools and tubes is enciphered — and on the balneological pages, in Currier's “Language B,” it may run under a different cipher system than the herbal.", reading: "cipher", tags: ["nymphs", "currier-hand-B"] },
  { objectId: "o7", xywh: O7, comment: "Under the grille reading, the writing among the pipes is meaningless filler; the statistical shift Currier found here is just a second grille table, not a second language.", reading: "hoax" },
  { objectId: "o7", xywh: O7, comment: "Under the abjad reading, the text is real language in a genuinely distinct dialect or register (Currier “Language A” vs “B” = two real linguistic states), consistent with natural variation across a long manuscript.", reading: "abjad" },

  // R6 — f78r (o8, 2793×3761, balneological): a label beside one nymph in the tube-network.
  { objectId: "o8", xywh: R6, comment: "Under the cipher reading, the nymph-label is enciphered — a name or term for the figure or the fluid in the pipes — and the balneological pages, in Currier's “Language B,” may use a different cipher system than the herbal.", reading: "cipher", tags: ["nymphs", "currier-hand-B", "label-word"] },
  { objectId: "o8", xywh: R6, comment: "Under the grille reading, the label is meaningless filler; the statistical difference Currier found between this section and the herbal is just a second grille table, not a second language.", reading: "hoax" },
  { objectId: "o8", xywh: R6, comment: "Under the abjad reading, the label is a real word in a genuinely distinct dialect or register (Currier “Language A” vs “B” = two real linguistic states), consistent with natural-language variation across a long manuscript.", reading: "abjad" },

  // R7 — f85v–86r Rosettes (o9, 7925×7268, foldout): label inside the central medallion. Cross-link source (§H).
  { objectId: "o9", xywh: R7, comment: "Under the cipher reading, the central rosette's label is the key to the whole foldout — a place-name or cosmological term whose decryption would unlock the map's geography. [See the Rosettes alone, deep-zoomed.](archie:voynich-rosettes/) (§H cross-link, 03 §5: repointed from the sunset bidar exhibit to the SINGLE Rosettes study — `archie:` in-body ref grammar from link.ts, rewritten to the published voynich-rosettes URL on the heads projection; resolves to the exhibit root.)", reading: "cipher", tags: ["astronomical-symbol", "foldout", "label-word"] },
  { objectId: "o9", xywh: R7, comment: "Under the grille reading, the label is decorative gibberish; the causeways and castles are an impressive visual forgery, and the text laid over them carries no place-names because it carries nothing.", reading: "hoax" },
  { objectId: "o9", xywh: R7, comment: "Under the abjad reading, the label names a real place or region; the abjad hypothesis is what motivates reading the Rosettes as an actual (if stylised) geographic or cosmographic diagram.", reading: "abjad" },

  // o10 — f99r (2702×3765, pharmaceutical): next-region, the apothecary-jar label.
  { objectId: "o10", xywh: O10, comment: "Under the cipher reading, the word beside the jar is an enciphered label — the name of a simple or preparation — the kind of short, contextful token cryptanalysts hoped would crack the system.", reading: "cipher", tags: ["apothecary", "label-word"] },
  { objectId: "o10", xywh: O10, comment: "Under the grille reading, the jar-label is a grille-drawn token placed to imitate an apothecary's inventory; the tidy rows sell a working reference that names nothing.", reading: "hoax" },
  { objectId: "o10", xywh: O10, comment: "Under the abjad reading, the label is a real word naming the container's contents in the invented alphabet — exactly the proper-name labels Bax's method reads first.", reading: "abjad" },

  // R8 — f116v (o11, 2686×3697, final page): the later Latin-script marginalia (a different hand, NOT Voynichese).
  { objectId: "o11", xywh: R8, comment: "Under the cipher reading, this Latin line is a later owner's attempted key or crib — someone who believed the book was enciphered and jotted a decryption hint.", reading: "cipher", tags: ["marginalia", "provenance"] },
  { objectId: "o11", xywh: R8, comment: "Under the grille reading, the Latin is a later reader's failed gloss: proof that even early owners could extract no meaning, so they annotated around the void.", reading: "hoax" },
  { objectId: "o11", xywh: R8, comment: "Under the abjad reading, the Latin hand is a later scribe glossing the abjad text — treating it as a real language worth translating, which presupposes it has content.", reading: "abjad" },
];

// A reading-bearing AV note on the o12 sound canvas. `t` is the `t=start,end` FragmentSelector range
// (PROVISIONAL pending human listen-confirm). Same body/reading/tag plumbing as a reading note.
export interface VoynichAvNote { t: string; comment: string; reading?: string; tags?: string[] }

// §E — AV-1…4 reading-bearing notes on the o12 sound canvas (03 §4). The fourth, audible row of the
// same toggle. ORDER IS LOAD-BEARING (appended after the reading notes — see consumers). t= PROVISIONAL.
export const voynichAvNotes: VoynichAvNote[] = [
  { t: "0,30", comment: "The machine reads the page aloud, letter for letter. Under the cipher reading you are hearing enciphered speech; under the grille reading you are hearing the rhythm a table-and-overlay produces; under the abjad reading you are hearing a real language you simply don't know. Same sound, three claims. [Read the manuscript through, page by page.](archie:voynich-reading/) (03 §4 cross-link AV→the narrative walk; `archie:` ref resolves to the voynich-reading exhibit — the spoken/read metaphor matches the narrative spine. A note-precise `…/#/a/<logicalId>` target awaits a stable R2 note id — human/Studio follow-up.)" },
  { t: "45,80", comment: "A repeated cadence surfaces. Under the abjad reading this resembles a root-and-pattern morphology (Bax); under the grille reading it is the predictable repetition the prefix/stem/suffix tables force; under the cipher reading it is enciphered structure showing through." },
  { t: "120,160", comment: "Here the “words” cluster like labels. Cryptanalysts attacked exactly such short tokens as cribs (cipher); Rugg's tables emit them just as readily (grille); Bax read them as proper names (abjad)." },
  { t: "250,296", comment: "The reading ends without resolving. That the ear can't decide between language and noise is the manuscript's whole condition — undeciphered, even when sounded." },
];

// A self-contained narrative reading beat (ADR-0005): its own camera target (`start`) + curator prose,
// independent of the Note layer. `objectId` selects which folio the beat opens on; `start` is its xywh
// camera region (APPROX, human visual-tune on verify). Published as IIIF Ranges, round-tripped via
// sectionsFromManifest. Shape matches @render/core's Section.
export interface VoynichSection { id: string; title: string; objectId: string; start: string; prose: string }

// §G — the 6-beat narrative spine (03 §3). Curator voice (names what the visitor sees — no dev jargon).
export const voynichSections: VoynichSection[] = [
  { id: "s1", title: "Herbal", objectId: "o1", start: "xywh=pixel:200,200,2600,3400", prose: "The book opens as a herbal: a plant to a page, text flowing around the drawing. None of these plants can be named with certainty — some look observed, some invented — and the writing has never been read. Step back, first, to the leaf entire:\n\n[Folio 1r, as a whole object.](archie:voynich/#/o/o1)" },
  { id: "s2", title: "Astronomical", objectId: "o5", start: "xywh=pixel:400,300,4000,3100", prose: "The pages widen into fold-out wheels of Sun, Moon, and stars, each star tied to a small labelled word. Conventional zodiac figures appear, but the labels around them stay closed to us." },
  { id: "s3", title: "Balneological", objectId: "o8", start: "xywh=pixel:200,400,2400,3000", prose: "Small bathing figures move through green networks of pipes and basins. The script shifts character here — measurably a different system than the herbal — as if a second voice took up the pen." },
  { id: "s4", title: "Cosmological", objectId: "o9", start: "xywh=pixel:2600,2400,2800,2600", prose: "The largest spread in the book unfolds into nine medallions joined by causeways, with castle-like and map-like forms. Whether it charts real places or imagined ones is part of what the page refuses to settle. The same foldout, alone and deep-zoomed, is its own study:\n\n[The Rosettes foldout, in the full grid.](archie:voynich/#/o/o9)" },
  { id: "s5", title: "Pharmaceutical", objectId: "o10", start: "xywh=pixel:200,400,2300,3000", prose: "Rows of labelled containers sit beside isolated roots and leaves — many of them tidier copies of plants from the opening herbal, as if assembled into a working reference." },
  { id: "s6", title: "Recipes", objectId: "o11", start: "xywh=pixel:200,160,2300,420", prose: "The book closes on short starred paragraphs and, on its very last page, a few lines in ordinary Latin script — a later hand reaching in from outside the manuscript's silence." },
];
