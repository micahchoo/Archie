# Voynich Rewrite — Design / Build Spec (Phase 3: Ideation)

**Date:** 2026-05-27. **Status:** build spec — Phase 4 executes this mechanically.
**Reads:** `01-manuscript-foundation.md` (folios + Yale IIIF sources), `03-analysis.md` (regions R1–R8, sections, tags, readings, AV cues — verbatim prose lives there; this doc refers, does not restate).
**Altitude:** for each analysis item → the file + the exact call shape. Prose comes from `03`.

## Architecture (corrected — supersedes Scout B's paths)
`[SNAG]` Earlier scouting cited `apps/studio/src/sample-data.ts` and `av.ts` — **neither exists**. The true pipeline, verified by reading source:

```
SEED  apps/viewer/src/sample-data.ts   (export const library: Library + getLog(exhibitId))
  │     ├─ raw fixture: apps/viewer/src/voynich.ts  (voynichObjects, voynichNotes) ── twin of apps/studio/src/voynich.ts
  │     ├─ buildLog(slug, notes)         → base notes (purpose:commenting)
  │     ├─ addVoynich(objId,xywh,comment,{reading?,tags?},now) → reading/tag notes
  │     └─ importTranscript([],vtt,{…})  → AV time-anchored notes (purpose:supplementing)
  ▼
PUBLISH scripts/gen-published.mts → publishLibrary → apps/viewer/public/published/<slug>/
        manifest.json · canvas/<objId>/annotations.json · canvas/<objId>/annotations-<readingId>.json
        · readings.json · annotations/history/… · (gallery) exhibits.json + collection.json
  ▼
VIEW   apps/viewer/src/published.ts loadPublishedExhibit(slug) FETCHES the tree → ExhibitView.svelte
```
**Invariant:** the Viewer renders the *published* tree, never the seed directly. **Author the seed, then regenerate.** Never hand-edit `public/published/`.

**Why the old exhibit is borked, in code:** `sample-data.ts:42` defines only **2** readings (cipher, hoax); `addVoynich` fires on only **o2/o3/o5** (the "2-of-5" problem, literally); `voynich.ts` is a stripped `VoynichObject/VoynichNote` fixture with no reading/tag/section fields; layout is `grid` so the authored narrative never had a home.

---

## A. A2 surgery — single source of truth
1. Rewrite `apps/viewer/src/voynich.ts` as the **one** voynich seed: real `AObject[]` (§B) + the authored note/reading/section/AV data — drop the `VoynichObject`/`VoynichNote` mini-schema; author directly in `AObject` + the `sample-data.ts` helpers.
2. **Delete `apps/studio/src/voynich.ts`** (the duplicate). Point `apps/studio/src/App.svelte` `DEFAULT_EXHIBITS` (line 60) at the shared seed for objects + readings list. (Studio only needs objects + the readings registry to seed authoring; per-note bodies live on the publish path.)
3. Leave `scripts/import-voynich.mjs` as a deprecated one-shot (add a header note); it is no longer the source of truth.

## B. Objects — 12 total (11 images IIIF-direct + 1 sound), layout **narrative**
Layout is **narrative**, not grid: the exhibit carries Sections, and `model.ts` binds Sections→narrative (`resolveLayout`). Grid was never on the showcase list (notes/tags/readings/sections/cross-links/AV are); dropping it is intended.

Image objects reference **Yale IIIF directly** (no download): `source` = the canvas image-service/`info.json` URL per imageId in `01` (`resolveTileSource` classifies it). `width/height` from `01` where given, else pull from the manifest at build.

| objId | folio | section | imageId (`01`) | regions |
|---|---|---|---|---|
| o1 | f1r | herbal | 1006076 | R1, tags botanical/marginalia/provenance/currier-hand-A |
| o2 | f18v | herbal | 1006109 (2846×3781) | R2 + **AV anchor** (§E) |
| o3 | f25v | herbal | 1006123 | R3 |
| o4 | f33v | herbal | 1006139 | R4 |
| o5 | f67r | astronomical | 1006194 | R5, foldout |
| o6 | f68r | astronomical | 1006196 | next-region (star-cluster), foldout |
| o7 | f75r | balneological | 1006208 | next-region (pool/tube) |
| o8 | f78r | balneological | 1006214 | R6 |
| o9 | f85v–86r Rosettes | cosmological | 1006231 (7925×7268) | R7, foldout, **cross-link source** |
| o10 | f99r | pharmaceutical | 1006246 | next-region (jar label) |
| o11 | f116v | recipes/final | 1006277 | R8 |
| o12 | — | (sound) | Kryptogramm `04-f18v` | AV-1…4 (§E) |

## C. Readings — 3 (was 2). Edit `voynichReadings` (`sample-data.ts:42`)
Add the third pass. Even-handed (locked stance): equal description weight, no hedging on `hoax`.
```ts
const voynichReadings = [
  { id: "cipher", name: "Cipher reading",  description: "…", colour: "#3a6b4c" },
  { id: "hoax",   name: "Hoax reading",    description: "…", colour: "#a3553a" },
  { id: "abjad",  name: "Natural-language reading", description: "…", colour: "<3rd>" }, // NEW
];
```
Descriptions/prose: `03` §1 + source tags. (`#3a6b4c`/`#a3553a` exist; pick a distinct third.)

## D. Notes — author across ALL folios via `addVoynich(...)`
Replace the o2/o3/o5-only block with the full set. Each region R1–R8 → **three** `addVoynich` calls (one per reading) targeting the *same* `xywh`; plus the 3 next-regions (o6/o7/o10) so the toggle is live on all image folios. Tags via `opts.tags` (§F). Base captions stay via `buildLog`/`voynichNotes`.

Call shape (prose = `03` Rn.<reading>; `xywh` TBD at build):
```ts
addVoynich("o1", "<xywh>", "<03 R1.cipher>", { reading: "cipher", tags: ["botanical","currier-hand-A"] }, now++);
addVoynich("o1", "<xywh>", "<03 R1.hoax>",   { reading: "hoax" },  now++);
addVoynich("o1", "<xywh>", "<03 R1.abjad>",  { reading: "abjad" }, now++);
// … R2(o2) R3(o3) R4(o4) R5(o5) R6(o8) R7(o9) R8(o11) + next-regions o6,o7,o10
```
`xywh` pixels are **deferred to build** (`03` §6) — author against the live folio. The same region string is reused across that region's three reading-notes (mutual exclusivity, ADR-0007).

## E. AV object (o12) + the `importTranscript` gap
Object: `{ id:"o12", source:"<Kryptogramm 04-f18v, re-hosted one.compost.digital>", label:"…", mediaType:"sound", format:"audio/mpeg", duration:296 }` (precedent: the `av` exhibit object, `sample-data.ts:82`).

`[SNAG-PRESPEC]` **`importTranscript(vtt)` produces `purpose:supplementing` notes only — it does NOT carry `reading`.** The four AV-1…4 notes (`03` §4) are *reading-bearing*. Phase 4 must add a small helper (mirror `addVoynich` but with a `t=start,end` FragmentSelector instead of `xywh=`), e.g.:
```ts
const addAvNote = (t: string, comment: string, opts:{reading?:string;tags?:string[]}, now:number) => /* appendNew w/ selector value `t=${t}`, body commenting (+tags), reading */;
addAvNote("0,30", "<03 AV-1>", {}, now++); // AV-1 spans the toggle in prose; AV-2..4 per 03 §4
```
`t=` boundaries are **provisional pending the human listen-confirm** (`02`/`03`). Section beat may also frame o12 via `Section.start = "t=…"` (model.ts allows it).

## F. Tags — 10-term vocabulary (`03` §2) via `opts.tags`
Author as `purpose:tagging` bodies through `addVoynich`'s `tags` (already supported, `sample-data.ts:49`). Map per `03` §2 table (botanical, astronomical-symbol, nymphs, apothecary, foldout, marginalia, currier-hand-A, currier-hand-B, label-word, provenance). `currier-hand-*` rides alongside any reading (apparatus, not interpretation).

## G. Sections — 6-beat narrative spine (`03` §3)
Add `voynichSections: Section[]` and attach to the `ex-voynich` library entry; set `layout:"narrative"`.
```ts
const voynichSections: Section[] = [
  { id:"s1", title:"Herbal",         objectId:"o1",  start:"xywh=pixel:<…>", prose:"<03 §3 row1>" },
  // s2 Astronomical→o5, s3 Balneological→o8(/o7), s4 Cosmological→o9, s5 Pharmaceutical→o10, s6 Recipes→o11
];
```
Then `sample-data.ts:103`: add `sections: voynichSections`, change `layout` to `"narrative"`, and **rewrite the stale `summary`** ("Five folios…" → ~"Eleven folios of MS 408 across six sections, read through three rival interpretations, with a sounded page"). The gallery `exhibits.json` regenerates from this.

## H. Cross-exhibit link — Link 1 (`03` §5)
From R7 (o9 Rosettes) → `bidar` canvas (`https://archie.demo/bidar/canvas/o1`), angle "a network rendered as a map." Author as an `archie://`/deep-link reference in the R7 note prose (the ⌘K link grammar). Link 2 stays dropped (weak — `03` §5).

## I. Build-time invariants & gotchas
- **Update `packages/render-core/src/publish/voynich-readings.test.ts` in lockstep** — it pins the readings publish contract and WILL break when readings go 2→3 and notes expand. (Non-negotiable; it is the contract guard.)
- Regenerate: run `scripts/gen-published.mts` after seed edits; verify `public/published/voynich/` (manifest, per-reading `annotations-abjad.json` now present, readings.json has 3).
- Node: **fnm Node v24** for pnpm/corepack (system v20 incompatible).
- Verify: **happy-dom mount tests, NOT lightpanda** (wedges here); visual sign-off by human.
- Listen-confirm the Kryptogramm track before finalizing `t=` ranges.

## J. Phase 4 task order
1. A2 surgery (§A) + new 11-image+1-sound object set (§B) → seed compiles.
2. Readings 2→3 (§C); `addAvNote` helper (§E).
3. Author R1–R8 + 3 next-regions notes ×3 readings (§D) + tags (§F); set `xywh` against live folios.
4. AV notes (§E); listen-confirm.
5. Sections + layout=narrative + summary rewrite (§G); cross-link (§H).
6. Update `voynich-readings.test.ts` (§I); regenerate published; happy-dom verify.
