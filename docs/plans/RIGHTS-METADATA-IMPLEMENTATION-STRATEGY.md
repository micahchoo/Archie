# Rights & Metadata — Implementation Strategy

_Compiled 2026-05-27 from the locked design corpus. **Design** = `CONTEXT.md` → "Exhibit / Library rights & metadata" (Q1–Q6 + UX/UI synthesis). **This doc** = the method + sequence only (not a task list; each phase decomposes when it starts)._

## The through-line

Author edits friendly inputs (credit, license) at any of three levels; the model projects **thin** to IIIF-standard fields so a pure IIIF viewer (Mirador) shows credit + license for free, and Archie's Viewer shows a quiet credit line. Replaces two `summary`-abuse hacks (`voynichCredits` on `library.summary`; the Bidar attribution on `exhibit.summary`).

## Ordering principles (derived from the design, not invented)

1. **Sources before projections.** The model fields (rights on Library/Exhibit/Object) → the publish projection (IIIF Collection/Manifest/Canvas emission) → the Viewer display. A projection built before its source is rework. ⇒ **Phase 1 = model + projection.**
2. **Standard before invented.** The IIIF-standard fields are deterministic and binary-testable (meta in → exact IIIF JSON out); the editing UI and the inherit toggle are comprehension-gated inventions. Ship the standard core; gate the inventions. ⇒ Phase 1 mechanical; Phases 2–3 gated.
3. **Core-first within the field set.** `requiredStatement` + `rights` (the MUST-display credit + the license) before `provider` / `metadata` / contributors / inherit. The latter are **additive** — the IIIF fields exist; expose progressively.
4. **Highest-assumption-load first.** The keystone is *where rights live on the three level metas and how they project* — hardest to retrofit once UI binds to it. Build + freeze that shape before any UI.

## Reducibility classification

| Work | Kind | Donor / test | Terminus |
|---|---|---|---|
| Model fields on Library/Exhibit/Object + store metas | Greenfield-specifiable | type round-trip test | mechanical-after-corpus |
| IIIF projection (`toCollection`/`toManifest`/`toCanvas` emit `rights`/`requiredStatement`) | Greenfield-specifiable | corpus: meta → expected IIIF JSON | mechanical-after-corpus |
| Contributors derive (union of `lastEditor`, bubbling up) | Greenfield-specifiable | corpus: notes → expected contributor set | mechanical-after-corpus (additive) |
| Studio `RightsEditor` + 2 invocation patterns | **Invented** | "does the curator grok it" | **human gate** + browser-verify |
| Viewer credit line + ⓘ disclosure + MediaPlayer credit | **Invented** | display comprehension | **human gate** + browser-verify |
| Opt-in inherit toggle | **Invented** | "no silent drift" comprehension | **human gate** (additive) |

## Phases

### Phase 1 — Rights model + IIIF projection (core-first, corpus-mechanical)
- **Builds:** a shared `RightsFields` (`rights?: string`, `requiredStatement?: {label, value}`) on `Library`/`Exhibit`/`AObject` (`@render/core/model`) + the mirrors on `LibraryMeta`/`ExhibitMeta`/`ObjectMeta` (studio store; `LibraryMeta` gains `title`/`summary`/rights — it has none today). IIIF types gain optional `rights`/`requiredStatement` (+ `metadata`/`provider` shapes for later) on `IIIFCollection`/`IIIFManifest`/`IIIFCanvas`. `toCollection`/`toManifest`/`toCanvas` emit them (default `requiredStatement` label "Attribution").
- **Validates:** the standard credit + license round-trip to **spec-correct IIIF** at all three levels; a Mirador-class viewer would show them.
- **Does NOT validate:** any UI; inheritance/cascade resolution; `provider`/`metadata`/contributors. (Phase-1 projection emits each level's OWN values — the cascade is the additive `inherit` phase.)
- **Boundary:** ends when `pnpm vitest` is green with the projection corpus and both apps build. No UI touched.

### Phase 2 — Studio `RightsEditor` (invented UI, gated)
- **Builds:** one shared `RightsEditor.svelte` (credit `<textarea>` + license `<select>` of approved URIs), rendered via **two invocation patterns** (CONTEXT UX synthesis): header-button → slide-in drawer for **Library** (`LibraryHome`) + **Exhibit** (`ExhibitOverview`); inline panel for **Object** (`App.svelte` `<aside>`, between note list + WADM form). Un-hacks `voynichCredits` + Bidar attribution → `requiredStatement`. Curator-voice copy ("Attribution / credit", "License").
- **Validates:** a curator can set credit + license at all three levels; it persists + publishes.
- **Does NOT validate:** the inherit toggle, contributors chip-list, provider/metadata (all behind "More fields", additive).
- **Gate:** browser-verify + comprehension ("does it read as setting rights, in curator voice?").

### Phase 3 — Viewer credit display (invented UI, gated)
- **Builds:** one quiet credit line per view-level at the existing title areas (`Gallery:17`, `ObjectGrid:32`, `NarrativeReader:81`, `Reader:112`) + the ⓘ "About & rights" disclosure (reusing `ReadingLegend.svelte`'s accent-stripe overlay) + a credit prop threaded through `MediaPlayer` (AV MUST-display). Viewer reads ALREADY-RESOLVED published values.
- **Validates:** published rights are displayed per IIIF MUST-display, understated.
- **Gate:** browser-verify.

### Additive phase (later, after the user exercises the core)
`provider` / `metadata` (repeatable `{label,value}`) · **contributors** (Q4 — a derived aggregate: union of note `lastEditor` bubbling object→exhibit→library, + manual additions, → IIIF `metadata` "Contributors"; rendered as a read-only chip list + "+ Add", NOT a field) · the **opt-in inherit toggle** (Q6 — per-field "↰ Use {parent}'s value", comprehension-gated, built WITH the user) + the cascade resolution at publish.

## Deceptively-simple flags (need a corpus before mechanical execution)
- **`requiredStatement` round-trip:** `{label, value}` ↔ IIIF dual-langMap — the default-label-"Attribution" rule and the empty-vs-absent distinction need explicit cases.
- **Cascade resolution (additive):** "child borrows parent" is per-field, opt-in — the corpus must cover {set here / inherit / absent} × three levels. NOT in Phase 1.
- **Contributors aggregation (additive):** dedupe + ordering of the `lastEditor` union across heads; manual-vs-derived merge.

## Progress log

- **Phase 1 — DONE + verified (2026-05-27).** Model `RightsFields` (`rights` + `requiredStatement`) on `Library`/`Exhibit`/`AObject` (extends). IIIF types `IIIFRightsProps` (+ `IIIFLabelValue`/`IIIFAgent` for the additive phase) on `IIIFCollection`/`IIIFManifest`/`IIIFCanvas`. Forward helper `rightsProps` (default-label "Attribution"; omits blank value / empty URI) wired into `toCollection`/`toManifest`/`toCanvas`; reverse helper `rightsFromIIIF` wired into `objectsFromManifest` + `loadLibrary` (exhibit ← manifest, library ← exhibits.json) + `readPublishedExhibit`. `exhibits.json` `library` carries the friendly model shape (Gallery source + load round-trip; the Archie-convenience mirror of `collection.json`). Corpus = `iiif/rights.test.ts` (17 cases: forward, reverse, round-trip incl. default-label stability, all 3 projections, publish↔load). **378 core tests green; Studio + Viewer build clean.** Store metas + `buildFullLibrary` mapping deferred to Phase 2 (where the editor populates them) — Phase 1 kept pure `@render/core`.

- **Phase 2 — DONE + build-verified (2026-05-27; browser-verify + comprehension gate OWED).** Store metas extend `RightsFields` (`ObjectMeta`/`ExhibitMeta`/`LibraryMeta`; `LibraryMeta` also gains `title`/`summary` so the Library has an authoring home). `buildFullLibrary` threads library/exhibit/object rights via a `rightsOf` helper; `replaceProjectFrom` (Open zip/folder) restores them. Shared `RightsEditor.svelte` (credit `<textarea>` + license `<select>` over the new core `LICENSES` registry, curator voice). Three placements: **Object** = inline `<details>` "Rights & credit" disclosure at the foot of the editor `<aside>`; **Exhibit** = an `ⓘ Rights` header chip in `ExhibitOverview` → `PropsDrawer.svelte` (new shared right-side slide-in); **Library** = an `ⓘ Rights` button in `LibraryHome`'s title row → the same drawer. Core `rights.ts` gains `LICENSES` + `licenseLabel` (shared Studio picker + Viewer display). **386 core tests; Studio + Viewer build clean.** Setters `setObjectRights`/`setExhibitRights`/`setLibraryRights` persist via `persistLibrary`. **Gate Q (owed):** does each level's rights surface read clearly + in curator voice; does the drawer-vs-inline split feel right.

- **Phase 3 — DONE + build-verified (2026-05-27; browser-verify OWED).** Shared `Credit.svelte` (viewer) = the quiet credit line (`requiredStatement.value`) + an ⓘ "About & rights" disclosure (license via `licenseLabel`) in the `ReadingLegend` accent-stripe overlay idiom; `tone` prop (paper/canvas). Wired at all four surfaces: **Gallery** (library rights from `exhibits.json`), **ObjectGrid** + **NarrativeReader** (exhibit rights), **Reader** (object rights, falling back to exhibit so the MUST-display credit stays visible — a display fallback, not the authored cascade), **MediaPlayer** (AV credit prop — the gap closed). `published.ts` `PublishedExhibit` extends `RightsFields` (exhibit rights via `rightsFromIIIF(manifest)`); per-object rights ride on `objects`. ExhibitView computes `exhibitRights`/`objectRightsOf` and passes down. **Un-hack landed (advisor flag):** `sample-data.ts` `voynichCredits` → `ex-voynich.requiredStatement` ("Source"); Bidar attribution off `summary` → `ex-bidar.requiredStatement`; AV → its own; `library.summary` is now a real description. **End-to-end verified:** the regenerated published tree carries the credits at the right level (library `exhibits.json` no longer holds the Beinecke credit; voynich/bidar/av manifests carry `requiredStatement`). **Both apps build.** **Browser-verify owed:** `/` shows the library credit line + ⓘ; `/voynich` shows the Beinecke credit under the title + on a folio; `/bidar` + `/av` show their attributions; ⓘ opens the license/credit panel.

- **Advisor reconcile (2026-05-27).** The Reader's object→exhibit credit fallback was display-time inheritance — it violated Q5 ("Viewer never re-runs inheritance") + Q2 ("no silent drift"). Fixed per the design's own logic: dropped the fallback; set TRUTHFUL per-folio Beinecke `requiredStatement` on the Voynich objects (each folio IS Beinecke → published on the canvases, Mirador shows it free). Added `Credit.svelte` click-outside dismiss.
- **Phase 4 — DONE + build-verified (2026-05-27; title + description editing; browser-verify owed).** User: nothing editable once set. Model `AObject.summary` → Canvas `summary` projection + round-trip (`IIIFCanvas.summary`). Store `ObjectMeta.summary` + `ExhibitMeta.summary`; `buildFullLibrary`/`replaceProjectFrom` map them. New `DetailsEditor.svelte` (title + description + embedded `RightsEditor`) replaces the bare RightsEditor at all 3 surfaces (Library drawer / Exhibit drawer / Object disclosure; object title stays the inline rail label). Setters `set{Library,Exhibit,Object}{Title,Summary}`. **Fixed a real bug:** the 11 `libraryMeta = { exhibits: … }` setters dropped the new library-level fields → spread-fixed. Viewer Reader shows object summary. Corpus +3 (object-summary round-trip) = 20 in `rights.test.ts`. 386 core tests; both apps build.

## ✅ ALL FOUR PHASES BUILT (2026-05-27). Rights/metadata + title/description editing complete end-to-end (model → projection → Studio editing → Viewer display), build-verified, browser-verify + comprehension gates owed. **Additive phase remains** (not started): `provider` / `metadata` repeatable pairs / contributors chip-list (derived `lastEditor` union) / the opt-in per-field inherit toggle + publish-time cascade resolution.

## First concrete move
**Phase 1, Task 1:** add `RightsFields` to `@render/core/model` + the optional IIIF type fields, then write the projection corpus (`iiif/rights.test.ts` or extend `manifest`/`collection` tests): a Library/Exhibit/Object meta carrying `rights` + `requiredStatement` → assert the exact `rights` string + `requiredStatement` langMap pair on the emitted Collection/Manifest/Canvas. Make it green. Everything else waits behind the frozen model shape.
