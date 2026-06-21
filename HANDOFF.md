# HANDOFF — Object-level Notes + Rich Citation Rendering (ADR-0018)

**Status: feature COMPLETE + verified.** Built across this session from a grilling design → strategy → execution → adversarial review → fixes. Not committed (no commit requested). Studio + viewer dev servers were running on **5173** (studio) / **4321** (viewer).

## Design source of truth
- `docs/adr/0018-object-level-notes-bare-iri.md` — keystone identity (whole-object Note = bare resource IRI, no selector).
- `.scratch/CONTEXT.md` → section **"Object-level Notes + rich citation rendering (2026-06-20 grilling)"** + its **"Implementation status + findings"** sub-section (the live status log — read this first).
- `docs/plans/CITATION-OBJECT-NOTES-STRATEGY.md` — the 5-phase strategy.

## What shipped (all verified)
- **P0 data model** (render-core): `wholeObject` field + `ARCHIE_WHOLE_OBJECT` const + serialize/deserialize round-trip + `isWholeObjectFor(selector,w,h,override)` (bare-IRI ⇒ whole-object). Tests: `spine/wholeobject.test.ts`, `geometry/coverage.test.ts`.
- **P1 viewer render**: `ExhibitView.frameFor` → `isWholeObjectFor` (frame border); **MediaPlayer whole-track band** for AV whole-object notes.
- **P2 studio authoring**: `▣ Whole image/map` toolbar button (pure CREATE) + AvEditor `▣ Whole recording` (`oncreatewhole` prop); **studio canvas frame** wired (`App.svelte frameMark/studioFrame` → `CanvasComp frame=`); **Scope control** in `NoteEditor` (convert: "▣ Make whole-object" / "▭ Redraw bounds" / "▭ Draw a region" via App `setNoteScope` + `retargetingNoteId` flag in `onCreate`).
- **P3 cite ladder**: `LinkTarget.objectId` + `#/{slug}/o/<id>` route + `classifyCite` + object-cite **arrival** (`ExhibitView` objectId prop; narrative→`indexObjectId`, grid→`selectedObjectId`).
- **P3-UI cite-picker merge**: `NoteEditor` one `¶ Cite` button → `CmdK` with **Search / Browse** tabs (Browse = thumbnail tiles); `CmdEntry` gained `kind:"object"`+`thumb`; `buildCmdEntries` emits object entries + thumbs.
- **P4 rich render**: type-driven `CiteCard`/`ExhibitCiteCard` dispatch in `ProseCites`; `iiif/image.ts` region/thumb URLs. **Fixed a pre-existing bug:** `splitProseCites` matched `<p><a>` but snarkdown emits `<br>` — rewrote against real `renderMarkdown` output (cite cards never formed in production before).
- **Dogfood**: Voynich fixture has whole-object notes (o1 image, o9 image, o12 AV) + object cites in narrative s1/s4 prose; baked + lightpanda-confirmed (cards render, navigate, frames/bands show).

## Verification
render-core **668** tests · viewer **39** · studio **130** — all green. Viewer + studio `vite build` green. Live render confirmed via lightpanda (cards + navigation + AV band; OSD frame is build-verified only — lightpanda can't render WebGL). To see in-app: **hard-refresh 5173** (Vite HMR misses large .svelte edits), open an image object → notes panel.

## Open items (none blocking)
1. **[SNAG] (recorded as a seed):** the 3 Voynich exhibits share one RNG seed → `voynich`/`voynich-reading` mint identical note logicalIds → `buildLinkIndex` (first-seen-wins) mis-attributes them → cites whose slug is `voynich-reading`/`voynich-rosettes` silently degrade at publish (affects an existing fixture cite too). **Preferred fix:** validate non-note cites against the exhibit-slug SET, not the note index (no published-anchor churn).
2. **Dead code:** App.svelte `requestVisualCite` + MediaPicker cite path now unused (one ★ warning) — optional removal (6 sites in the NUL-byte file: ~lines for `mediaPickerOpen`/`requestVisualCite`/`pickVisualCite`, the MediaPicker mount, the lazy-load effect, the Esc guard, the PickItem import).
3. **Deferred:** build-time OffscreenCanvas crops for *local* (non-IIIF) objects + a publish step emitting `data-crop` for `CiteCard`'s region preview (IIIF URL path covers the examples today).
4. **Pre-existing a11y warnings** on `CmdK.svelte:63` (drawer dialog click-away) — not introduced here.

## Notes
- LSP shows many false positives in this monorepo (mulch `mx-9c7c9d`): `@render/*` module resolution, `isWholeObjectFor`/`objectId` "not exported", rights/tileSource on meta types. **The build is the gate** (svelte-check isn't installed; Svelte's plugin strips types). Verify studio/viewer via `pnpm build`, render-core via `pnpm exec vitest run` (per-app; root vitest fails rune tests).
- `App.svelte` has NUL bytes → Bash grep unreliable; use `awk`/`sed`/Read.
