# READINGS — Implementation Strategy

_Compiled 2026-05-27 from the `/grill-with-docs` design (CONTEXT.md → "Readings & Tags", Q1–Q17). The **method + sequence** to build the Reading model and the Voynich plural-Readings exercise — NOT a task list (each phase gets its own detailed plan when it starts). Supplements `docs/IMPLEMENTATION-STRATEGY.md` — link this from its Deferred-work registry._

## Design corpus (sole inputs)
- `CONTEXT.md` → **"Readings & Tags"** (Q1–Q17) — authoritative.
- `HANDOFF.md` → ▶ RESUME "LAYERS→READINGS" block — build/rename debt + grounded Voynich inputs.
- The spine (CONTEXT §86, ADR-0003): append-only log → projection.
- Grounded research: Beinecke IIIF manifest `collections.library.yale.edu/manifests/2002046`; competing readings (Cipher/Hoax/…); sections; apparatus facts.

## What this builds (one line)
"Layer" was one word doing two jobs; it splits into **Reading** (a mutually-exclusive interpretive pass = an IIIF `AnnotationPage` per Object under an `AnnotationCollection` per Exhibit) and **Tag** (additive per-note discovery, now carrying apparatus). The Voynich demo is re-authored as a real Studio project — competing Cipher/Hoax readings of real Beinecke folios — and shipped as a template.

## Ordering principles (DERIVED from the design, not invented)
1. **Source before projection.** A reading lives on the append-only log (the `reading` field on a record) BEFORE it projects to an IIIF `AnnotationPage` BEFORE it projects to the viewer legend. Build in that order; a projection built before its source is rework.
2. **Mechanical/adopted before invented.** The model rename + partitioned heads-compiler are *greenfield-specifiable* (corpus → green). The legend, active-reading authoring, and the Voynich content are *invented* (human-gated "does a reader/curator grok it"). Ship the mechanical spine before gating on the inventions.
3. **Highest-assumption-load first.** The single `reading` field + the partitioned projection is the keystone everything assumes and the hardest to retrofit (it changes serialization + manifest + mount). Build it first.

## Phases (serial at the phase level)

### Phase 1 — Reading data model (SOURCE / keystone)
- **Builds:** `record.reading?: string` (replaces `layers: string[]`, single-valued); `archie:reading` (replaces `archie:layers`); `query/filter.ts` reading equivalents; `Exhibit.readings: {id,name,description,colour}[]` registry (the AnnotationCollection identities).
- **VALIDATES:** the source-of-truth shape + mutual-exclusivity + registry resolution.
- **Does NOT validate:** rendering, toggling, authoring.
- **Boundary:** the log round-trips a single reading per record; the registry resolves id→identity.
- **Reducibility:** greenfield-specifiable — corpus FIRST.

### Phase 2 — Heads-projection partitioning (PROJECTION)
- **Builds:** heads compiler (`publish/site.ts:175–187`) → **N `AnnotationPage`s per Object partitioned by `reading` + a base page**; each reading-page `partOf` → its `AnnotationCollection`; emit the AnnotationCollections into the tree; `Canvas.annotations` (`iiif/manifest.ts:57`) → multi-element array.
- **VALIDATES:** IIIF-native serialization; **pure-viewer toggles (Mirador) for free**.
- **Does NOT validate:** Archie viewer UX, authoring.
- **Boundary:** a published exhibit opens in Mirador with toggleable reading-pages.
- **Reducibility:** greenfield-specifiable — corpus FIRST. **DECEPTIVELY SIMPLE** (see below).

### Phase 3 — Viewer Reading legend + flip (READER projection) [INVENTED]
- **Builds:** canvas legend (radio: base + readings; base-only arrival; flip swaps the active page; base always visible); Tag chip row in the note pane (never built); mount per-page toggle (`mount.ts:150` flattens today).
- **VALIDATES:** the reader experience (Q16) — "does flip-between-readings read."
- **Does NOT validate:** authoring.
- **Boundary:** a reader flips Cipher↔Hoax on one region and watches it reinterpret in place.
- **Reducibility:** invented (human gate) + adopted mount. **interface-design** skill ("curator's study") attaches at the decomposer.

### Phase 4 — Studio Reading authoring (active-reading context) [INVENTED]
- **Builds:** overarching **Readings panel** (create/name/describe/colour at exhibit level); per-note single-select defaulting to the active reading; the **active-reading context**; Tag input carries apparatus; the publish-time description **soft-warning** (Q17 — join the `brokenLinks` advisory strip).
- **VALIDATES:** authoring (Q3/Q13) — "does the curator grok active-reading + overarching readings."
- **Does NOT validate:** collaboration-specific flows (those ride the existing merge/import UI — Readings already proven orthogonal, Q12).
- **Boundary:** a curator creates a reading, sets it active, authors notes into it, switches to author the rival pass.
- **Reducibility:** invented (human gate) + interface-design.

### Phase 5 — Voynich plural exercise (INTEGRATION / dogfood) [INVENTED content]
- **Builds:** the source Library — real Beinecke IIIF folios (Herbal · Voynichese script · Rosettes · …), genuine **Cipher + Hoax** reading notes, the **keystone shared-region pair** (one glyph-block annotated under both), apparatus **Tags** (Currier A/B · radiocarbon · codicology); freeze as a **template** (`DEFAULT_EXHIBITS`; canonical form = committed source Library); **retire `voynich.ts` + `import-voynich.mjs`**; publish → committed tree.
- **VALIDATES:** the WHOLE stack end-to-end (dogfood) + "does plurality read to a DH practitioner."
- **Does NOT validate:** nothing new — it is the integration gate.
- **Boundary:** opening the Voynich template shows base; entering Cipher/Hoax flips the contested region.
- **Reducibility:** invented *content* (scholarship-grade annotation = human authoring) on mechanical scaffolding.
- **First Phase-5 task (sanity check, before authoring any content):** verify the editor allows **two notes on the same region with different `logicalId`s** — the keystone (rival Cipher/Hoax notes co-located on one glyph-block) depends on it. Almost certainly true by construction (different logicalIds = different notes), but confirm in 5 min before authoring ~30 notes against a false assumption.

**Phase 1 DEPLOYMENT PREREQUISITE — migration (NOT a side-channel).** v1 has shipped + is user-verified, so real Libraries in OPFS already carry `record.layers: string[]`. The instant Phase 1's `reading?` code reads that data it fails at load — so Phase 1 **cannot ship** without migration. The v1.1 migration runner (§90.3) is itself unbuilt, so don't depend on it. **Chosen approach (b): inline migration on read** — `load()` transforms the old shape when it sees it, version-stamped, no runner needed. **Collapse rule (lossless): legacy `layers: string[]` → Tags, NOT a `reading`.** Rationale: a Reading is exclusive (one) and would force data-loss on a multi-value `layers`; Tags are additive (many) and absorb `string[]` losslessly — and the old undifferentiated "layer" maps most safely onto the additive side of the split. The user re-curates Readings deliberately in the new model (promoting a tag to a reading is a manual act). Mechanically: `record.layers[]` → `purpose:tagging` bodies; stamp version; drop `archie:layers`. **A migration round-trip corpus is a Phase 1 leaf task** (old-shape Library → loads → layers became tags → no reading set). The Voynich authors fresh → no legacy data there, but every other v1 Library hits this.

## Reducibility classification → model-tiering & gating
| Phase | Kind | Terminus |
|---|---|---|
| 1 model | greenfield-specifiable | small-model mechanical AFTER corpus |
| 2 projection | greenfield-specifiable (deceptively simple) | corpus FIRST, then mechanical |
| 3 legend/flip | invented | human gate + interface-design |
| 4 authoring | invented | human gate + interface-design |
| 5 Voynich | invented content | human authoring + gate |

Phases 1–2 → small-model executors after a strong model writes the corpus. Phases 3–5 → design-skilled, human-gated.

## Deceptively-simple items (corpus before any executor touches them)
- **Phase 2 partitioning** sounds like "group notes by reading" but hides: the **base page** (no-reading notes), **readings with zero notes on a canvas** (emit nothing — no empty page), the **`partOf` collection chain**, **mutual-exclusivity at the boundary**, and the **multi-element `Canvas.annotations`** ordering. Write the corpus (`log → expected {N reading-pages + base + partOf}`) FIRST — that is where these surface.
- **Migration collapse rule** — legacy `layers: string[]` with >1 value → which single `reading`? Corpus the rule before the runner.

## Mechanical execution system
- **Decomposer** (strong model, once per phase): phase → ordered leaf-task DAG, each with a pre-written acceptance test. Phases 3–5 invoke `/interface-design:interface-design` at the decomposer; UI leaf tasks cite `.interface-design/system.md` ("curator's study") the way they cite ADRs.
- **Wave-builder** (mechanical): group ready tasks with disjoint write-targets.
- **Executor** (small model): make one pre-written test green; no scope expansion.
- **Verifier** (mid): tests meaningful + cross-worker seams cohere — the **layers→reading rename is the cross-cutting seam** (touches `query/filter.ts`, `spine/serialize.ts`, `publish/site.ts`, `iiif/manifest.ts`, both apps); coordinate it via the shared prefix.

## Enumeration strategy
- **Enumerable now:** Phases 1–2 (the corpus IS the enumeration — one test per task).
- **Discovered later:** Phases 3–5 leaf tasks emerge from each phase's decomposer pass + the human gate on the inventions.

## ADRs to write (grill deferred them)
- **ADR-0007 (proposed): "Reading = IIIF AnnotationPage/AnnotationCollection; mutually-exclusive membership v1"** — reverses §92's per-note-string layer model; amends ADR-0003 (the spine: heads projection now partitions by reading). Provenance already in CONTEXT §92.

## Progress log
- **2026-05-27 — Phase 1, sub-phase 1A DONE + verified (expand step, non-breaking).** Approach = expand-and-contract (12 files / 80 occurrences; `layers: string[]`→`reading?: string` is a *cardinality change*, so big-bang is unsafe). 1A added the `reading` model + query + log threading ALONGSIDE the deprecated `layers`: `wadm/types.ts` (`reading?: string`, `ARCHIE_READING`), `query/filter.ts` (`readingOf`/`filterByReading`/`baseNotes`/`allReadings`), `spine/log.ts` (thread `reading` through `appendNew`/`appendEdit`), + `query/reading.test.ts` (7-test corpus: query semantics, base, the keystone rival-readings-same-region, edit-carries-forward). **Verified: 331/331 render-core tests green; the 4 changed files are `tsc --noEmit` clean** (4 pre-existing tsc errors in `fs/binding.test.ts` are unrelated). Old `layers` data still loads (expand step).
- **2026-05-27 — 1B/1C/1D + Phase-2 CORE DONE + verified (still additive/expand; nothing removed yet).** `vitest` render-core **342/342 green**.
  - **1B** serialize/deserialize carry `archie:reading` (`withReading` + `withDagMeta`; deserialize parse) + round-trip corpus.
  - **1C** migration `foldLayersIntoTags(record)` in `migrate/migrate.ts` (legacy `layers[]`→`purpose:tagging` bodies, lossless, idempotent, dedupes) + corpus. NOT yet wired into the load path (wiring = CONTRACT, so the expand-phase layers round-trip test still passes).
  - **1D** `Reading` interface + `Exhibit.readings?: Reading[]` registry + `readingById` resolver (`model/model.ts`) + corpus. (Soft terminology note: distinct from the §42 `readingFamily`/reading-MODE axis — flagged in the type doc.)
  - **Phase-2 CORE** `headsPagesByReading(...)` pure partitioner (`spine/serialize.ts`): one AnnotationPage per reading + base page; base-first order; zero-note readings emit nothing; `partOf`→collection on readings, none on base. Corpus covers all three deceptively-simple cases. `[SNAG→fixed]` Array.sort moves `undefined` last regardless of comparator → sort defined keys, prepend base.
- **2026-05-27 — Phase 2 WIRING DONE + verified. `vitest` render-core 343/343 green; backend engine COMPLETE.** `iiif/manifest.ts` `toCanvas`/`toManifest` now list base + one page per **registry** reading (`exhibit.readings`); coupling avoided (reads the model, not the log — no reorder). `publish/site.ts` heads loop emits base page + a page per registry reading (empty `partOf`-stamped page if a canvas has no notes for a reading, so every manifest ref resolves) + one `AnnotationCollection` per reading at `{slug}/annotations/readings/{id}.json`. Backward-compatible: exhibits without `readings` publish exactly as before. New integration test in `site.test.ts` proves the full path (manifest multi-element · cipher page note+partOf · empty hoax page · collection).
- **2026-05-27 — Phase 5 CONTENT DONE + verified (the genuine exercise, proven through the engine). `vitest` render-core 346/346 green.** `publish/voynich-readings.test.ts` authors the Voynich as a real source Library — a real Beinecke MS 408 IIIF image, the documented Cipher vs Hoax readings (grounded descriptions), and the **KEYSTONE**: the SAME glyph-block region annotated under *both* readings → published to separate toggleable AnnotationPages (proven: identical `xywh`, distinct pages, partOf→collections). Plus a base fact and an apparatus note riding a **Tag** (Frame C). Scoped to one research-verified folio id (1006074); more folios = more manifest ids (a content step, not code).
- **DELIVERED + VERIFIED THIS SESSION:** Phase 1 (model) · Phase 2 (partitioner + publish wiring) · Phase 5 (content). The Readings feature works end-to-end at the DATA + PUBLISH layer, demonstrated on genuine Voynich content. 346 render-core tests green; everything additive (old `layers` data still loads).
- **REMAINING = browser-verify-owed FRONT-END + the contract (NOT done — needs your browser per memory; large Svelte):**
  - **Phase 3 — DONE + build-verified (browser-verify yours, 2026-05-27).** `publish/site.ts` now also emits `{slug}/readings.json` (the registry index, beside the IIIF AnnotationCollections). `apps/viewer/src/published.ts` loads it + per-reading pages (`readings` + `readingAnnotationsByObject`). New `apps/viewer/src/components/ReadingLegend.svelte` — a canvas-anchored radio (Base + each reading w/ colour swatch + the description as the intent line), curator's-study tokens. `ExhibitView.svelte`: `activeReading` state (base-only default), base+active-reading filtering, deep-link-into-a-reading. **Demo content (Phase 5 → bundled):** `sample-data.ts` gives the Voynich a `readings` registry (Cipher/Hoax, grounded) + competing notes on the existing folios incl. the KEYSTONE (same region, both readings) + a paleography Tag. **Verified:** render-core 355 green; `astro build` clean (4 pages); the regenerated `public/published/voynich/` has `readings.json` + per-reading pages + multi-element manifest. **Svelte-check `onclick`/`never` diagnostics are LSP noise** (the pre-existing arrival button shows the same; `astro build` is clean). **NOT done:** the Tag chip row (note-pane filter) + NarrativeReader legend (only the grid `Reader` path is wired). **BROWSER-VERIFY (yours):** viewer `/voynich` → open a folio → a "Readings" legend (Base · Cipher · Hoax); pick Cipher/Hoax → the note on folio o2's keystone region swaps to that camp's reading.
  - **Phase 4 — DONE + build-verified (Studio authoring; browser-verify yours, 2026-05-27).** `session.ts` + `log.ts` thread `reading` (additive; `appendEdit` supports `reading: null` = clear-to-base). `store.ts` `ExhibitMeta.readings`. `App.svelte`: `layerFilter`→`readingFilter` ("all"/"base"/id), `currentReadings`, `setReadings`/`addReading`/`removeReading`/`setNoteReading`, list+annotation filters by reading, new-note inherits the active reading (`onCreate`), `applyForm` drops layers (reading set separately), carry-forward carries `reading`, `buildFullLibrary` publishes `readings`. UI: header **Reading** filter `<select>` + **"+ Reading"** (creates a reading), the per-note **Reading single-select** replacing the rejected layer checkbox fieldset, reading-coloured note chips, reading-aware empty states. **Verified:** Studio `vite build` clean (199 modules); render-core 355 green. **Svelte-check `onclick`/`?.[` diagnostics = LSP phantoms** (build clean). **BROWSER-VERIFY (yours):** open a multi-note exhibit → "+ Reading" (e.g. Cipher) → it becomes active → draw a note (defaults into Cipher) → the per-note Reading select reassigns/clears → the header filter scopes the list.
  - **REMAINING = the CONTRACT only (pure cleanup, non-functional — the feature is COMPLETE without it).** Remove deprecated `layers`/`layersOf`/`filterByLayer`/`allLayers`/`ARCHIE_LAYERS` from core + `r.layers`/`c.layers` from `App.svelte`/`MergeReview` + the `layers` round-trip test; WIRE `foldLayersIntoTags` at the load path (deserialize/`session.load`) so legacy user data migrates `layers`→Tags (this step replaces the `layers` round-trip test with a migrate-on-load test). Left in the **expand** state deliberately: `layers` is `@deprecated`-marked, harmless, round-tripping; the new `reading` model is the active path everywhere. Functionally complete + fully verified; the contract is a safe separate pass.
  - **~~Phase 4 — scoped, NOT built~~ (superseded — built above).**
  - **2026-05-27 — UX-feedback round (4 browser-verified fixes; build-verified, render-core 355 / mount 18 / svelte 18 green, both apps build):**
    1. **Studio reading creation = AppNative** — replaced the OS `prompt()` with an in-app inline input (`addingReading` state + `commitNewReading` + autofocus `$effect`); Enter commits, Esc/blur cancels.
    2. **Better creation copy** (curator voice) — placeholder "Name a reading — e.g. Cipher"; button tooltip "Add a way of reading this source — e.g. a Cipher reading vs a Hoax reading".
    3. **Viewer now shows a VISIBLE difference between readings** — markers are coloured by their Reading. New `MountSurface.setStyle` (→ Annotorious `setStyle` `DrawingStyleExpression`, keyed by annotation id) in `mount.ts`/`surface.ts`; `Canvas.svelte` `styleOf` prop; `ExhibitView` builds annotation-id→reading-colour and passes `styleOf` → toggling Cipher↔Hoax recolours the keystone marker (green↔amber); base markers stay default. `MarkerStyle` re-exported via `@render/svelte`.
    4. **Legend redesigned + repositioned** — `ReadingLegend.svelte` rebuilt to match the Reader `.popup` canvas-overlay pattern (curator's-study tokens: `--surface-canvas-overlay`, accent left-border, swatch+name rows, the active reading's description as the one intent line). **Moved out of ExhibitView's viewport-`fixed` overlay INTO Reader** (`position: absolute` inside Reader's relative container) so it anchors to the canvas, not the viewport.
  - **2026-05-27 — UX-feedback round 2 (4 more browser-verified fixes; viewer build clean):**
    1. **Note cards accent-coloured by Reading** — each list card's left border = its reading's colour (`readingColourOf` reads `archie:reading` → registry colour); base notes stay neutral.
    2. **Notes un-truncated** — removed the `-webkit-line-clamp: 3` on the list card (it cut notes mid-sentence); full prose now shows, pane scrolls.
    3. **Legend nudged below the breadcrumb** — `top: 3.25rem` (was `--space-5`, overlapping the subtitle).
    4. **Top-centred prev/next object carousel** — a canvas-overlay `nav` in Reader (inside `main`, `position:relative`) showing ‹ prev-label · {i}/{n} · next-label ›; `ExhibitView` passes `siblings`/`currentId`/`onnavigate` (sets `selectedObjectId`) so the visitor moves between folios without returning to the grid. ~15 sites in `apps/studio/src/App.svelte` (~1480 lines, the project's largest file) + `session.ts` + `MergeReview.svelte`. Precise sites: `session.ts` add `reading` to NewNoteInput/EditInput/resolve (additive, alongside `layers`); App.svelte — replace the **layer multi-checkbox fieldset** (`1173–1175`, the control rejected in Q3) + the `layerFilter` `<select>` (`1077`) + `toggleLayer` (`668`) with (a) an overarching **Readings panel** (create/name/colour readings at the exhibit level → `Exhibit.readings`) and (b) a per-note **single-select** "which reading? (or none)" + an **active-reading** context (new-note default, replacing `createNote({layers:[layerFilter]})` at `623`); update `applyForm`/`carryForward` (`309/348/352/661/737`) + the note chips (`1225`) + empty-state (`1216`); `MergeReview.svelte:27` resolve. Needs clean context (large file) — best a focused session; the engine + Phase 3 are the foundation.
  - **CONTRACT** — couples core↔apps: removing `layers`/`layersOf`/`filterByLayer`/`allLayers`/`ARCHIE_LAYERS` breaks `session.ts` + `App.svelte`/`MergeReview.svelte`, so migrate those to `reading` in lockstep + wire `foldLayersIntoTags` at the OPFS load path + rewrite the existing `filter.test.ts` layers tests. Best in a fresh session (clean context for the big Svelte files); the engine + this content are the solid foundation.
- **REMAINING (human-gated here — per memory "leave visuals to the human", lightpanda wedges):** Phase 3 viewer legend+flip UI, Phase 4 Studio Readings-panel UX (Svelte — build-verifiable but behavior needs your browser-verify), Phase 5 Voynich scholarship content authoring (real Beinecke IIIF + genuine Cipher/Hoax notes).

## First concrete move
**Phase 1 / Task 1 — write the `reading` test corpus, then rename.** In `@render/core`: a failing corpus for (a) `record.reading` round-trips through the log + heads; (b) at most one reading per record (mutual exclusivity); (c) `Exhibit.readings` resolves id→{name,description,colour}; (d) a no-reading record = base. THEN make it green: `layers: string[]`→`reading?: string`, `archie:layers`→`archie:reading`, `layersOf`/`filterByLayer`/`allLayers`→reading equivalents. This is the keystone source the entire build hangs off; nothing else can be built before it.
