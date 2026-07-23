# TEND EXPLORE — subsystem `apps/studio` — 2026-07-20

Scope: `apps/studio/**` (Svelte authoring app). Adjacent `packages/render-core`, `apps/viewer`
are context only; an issue must be rooted in apps/studio. Method: tend ladder (L1 Purpose,
L2 Behavior, L3 Structure, L4 Implementation) × {friction, surplus}, evidence per row.

Prior tend history is deep here (see `ledgers/`, DIVERGENCES.md). This pass mines PAST the
exclusion set (Issues 13/14/16/17/18/22/25; Directions 4/5/6/7; the "decided" do-not-resurrect
list; DIVERGENCES DZI/OG/CSV-WADM/geo). Two Explore subagents fanned out on structure and
surplus; findings below are all re-verified with `grep -a` (NUL bytes recur here).

---

## Observation ledger (rung × friction/surplus)

### L1 — Purpose (why it exists)

**Friction**
- `README.md:37-39` "Not yet built" lists features that ARE built and shipping: narrative
  section-authoring UI (`NarrativeEditor.svelte`), identity prompt (`IdentityPrompt.svelte`),
  styled A/V scrubber (`AvEditor.svelte`), publish-originals opt-in (`ZipExportFields.svelte` /
  `zip-export-opts.ts`). Also `README.md:33-35` "Key files" points at a `src/lib/` dir that does
  not exist (all components are flat in `src/`). This is the "docs drift" the exclusion set marks
  DECIDED — logged for completeness, not ticketed on its own.
- `deploy/types.ts:78-83` documents a `persisted` field with a promised consequence ("false = the
  scholar will have to sign in again next time"). That purpose-level promise is never realized in
  code (see L4 surplus / Issue 2) — a stated behavior with no implementation.

**Surplus**
- The section **rev-log** is a first-class domain concept — sections as merge-DAG records with
  history, un-delete, hide-by-ancestry, order keys — modeled in ~1,400 lines (studio 530 +
  render-core spine 873) but the README/purpose never mentions "section history" as a capability.
  A whole domain the stated purpose omits. (Issue 1.)

### L2 — Behavior (what it does)

**Friction**
- **Export/import asymmetry on structure history.** The publish/export leg is UNCONDITIONAL —
  `publish-flows.svelte.ts:112` `makeGetStructure`, wired at `:225`, explicitly "driven by log
  EXISTENCE, deliberately NOT by the archie.structureRevlog flag" (`:93-95`) — every sink emits
  `{slug}/structure/history/` when the dir exists. The matching import is FLAG-GATED:
  `ingest-flows.ts:1180` `if (STRUCTURE_REVLOG && srcFs)` → `mergeImportedStructure`
  (`structure-import.ts:91`). A library authored+published with the flag on carries history pages;
  re-opened in a default (flag-off) session those pages are silently ignored (receiver seeds from
  the `sections` array). Latent today only because the flag is never on (below). (folds into Issue 1.)

**Surplus**
- **A full write→project→serialize→persist→publish→import capability is invocable only in tests.**
  `createStructureSession` (`structure-session.svelte.ts`) is always constructed
  (`App.svelte:293`) but `ensureLoaded`/`apply` are called only behind the flag (`App.svelte:302`,
  `:314`). Every `true` for the flag lives in test files (`structure-export-roundtrip.test.ts:106,133`;
  `replace-structure.test.ts:91…124`; `structure-session.svelte.test.ts:32`). No prod/seed path.
- `bakeDisplayMaster`'s documented "preserve source format" branch (`bake.ts:22-24`) is reachable
  by no importer — every image import flattens to a PNG master (`ingest-flows.ts:497,499`), TIFF
  routes through `transcodeTiff` instead. An operation the code offers that the app never selects.

### L3 — Structure (how organized)

**Friction**
- **The localStorage `try{…}catch{}` persistence idiom is hand-rolled in ≥6 NON-App modules with
  no shared helper.** Three structurally-different shapes: (A) inline module functions —
  `canvas-first-use.ts:18-21`, `feature-flags.ts:18`, `import-freshness.ts:58-69`; (B) rune
  `$state` singleton getters/setters — `view-prefs.svelte.ts:48-127`; (C) JSON-blob-by-id —
  `deploy/deploy-flows.svelte.ts:122-132`, `binding.ts:145-196`. Comments themselves admit the
  copy ("Same localStorage try/catch idiom as App.svelte's FIRST_ADD_KEY" — `canvas-first-use.ts:6`,
  `import-freshness.ts:51`, `feature-flags.ts:1`). Distinct from Issue 18, which covers only
  App.svelte's inline copies. (Issue 3.)
- **`store.ts` (516 lines) mixes 4 concerns:** id-scheme migration (`:64`, `:95`), dir openers
  (`:108-141`), library+pending-note meta (`:180-261`), and asset-blob I/O (`saveAssetFile`/
  `saveOriginalFile`/`saveThumbFile` `:284-297`, `readPeaks`/`savePeaks` `:318-329`,
  `AssetReadFailedError` `:349`, `assetSize`/`readAssetUrl` `:395-407`, `readAssetBlob`/
  `readOriginalBytes`/`readThumbBytes`/`readThumbUrl` `:483-513`, `ASSET_PREFIX`/`isAsset`
  `:261-263`). The asset-blob group is a cohesive ~12-function seam extractable to `asset-store.ts`.
  (Issue 4.)
- **Interaction state machines trapped in god-components, untested.** `ExhibitOverview.svelte`
  (1267 lines) carries the marquee rectangle-select geometry (`onBgPointerDown/Move/Up` +
  `commitMarquee`, `:346-397`) and the keyboard move-mode WAI-ARIA reorder machine
  (`refocusGrip`/`dropMove`/`cancelMove`/`applyMove`/`onGripKeyDown`/`onGridFocusOut`, `:478-535`).
  `CreateExhibitDialog.svelte` (82KB) embeds a full slippy-map locator sub-widget
  (`PROVIDERS`/`REGIONS`/`MAP_DEFAULTS` `:260-271`; projection/drag/zoom cluster `llToWorld`…
  `applyRegion` `~:285-411`; `submitMap` `:413`). All are pure enough to extract to tested
  `.svelte.ts` — mirroring how `roving.ts` already extracted the arrow-nav ExhibitOverview uses.
  (Issue 5.)

**Surplus**
- `feature-flags.ts` is a generic "feature flags" module housing exactly one flag
  (`structureRevlogEnabled`, `:18`) — a one-flag registry dressed as a flag system. (folds into Issue 1.)
- Test-only DI seams with zero prod overrides: `WriterLockOptions` (`writer-lock.svelte.ts:31-38`;
  sole prod caller `App.svelte:328` passes none), `createLibraryStore(initial, opts)`
  (`library-meta.svelte.ts:34`; one prod caller `App.svelte:150`). Intentional testability seams —
  noted, not ticketed (fog).
- `place.ts:64` `placesEqual` — exported, fully tested (`place.test.ts:71-79`), zero production
  callers. Dead export kept alive only by its own test. (fog.)

### L4 — Implementation (how built)

**Friction**
- Core ingest transcode logic (`bake.ts` 103 lines, `tiff-transcode.ts` 75 lines) has NO co-located
  unit test; exercised only indirectly via `ingest-flows.test.ts`. Pairs with the structure
  extraction friction (untested pure logic buried below the integration layer). Modest — logged.

**Surplus**
- **`DeploySession.persisted` is dark data.** Written at 3 sites — `deploy-flows.svelte.ts:297`
  (`false`), `:325` (`true`), `publish-machine.svelte.ts:351` (`persisted: ok`) — and read as a
  condition by ZERO code. `grep -a "\.persisted"` outside writes/type/test returns nothing; the
  machine exposes it via `get session()` (`publish-machine.svelte.ts:480`) but no consumer branches
  on it. The documented "sign in again next time" behavior (`deploy/types.ts:81-82`) is unbuilt.
  (Issue 2.)
- `bake.ts` `BakeOptions.mime`/`quality` (`:24-26`) receive only defaults in the single prod caller
  (`ingest-flows.ts:497` passes `{maxDim}` only) → speculative generality; the "preserve format"
  path is both unconsumed and (as of the just-landed honest storage chip, 393691e) user-visible as
  storage inflation. (Direction 1.)
- The rev-logged section history is persisted (spine/structure-persist) but never projected/restored
  in any shipped config — "kept history with no restore path" is the L4 face of the always-off flag.
  (folds into Issue 1.)

**Coverage note (checked, cleared):** view-prefs / exhibit-session / view-state / library-meta
fields all have live readers (subagent verified); `RemovedObject.objId` consumed at
render-core `publish/site.ts:336-337`; `DeployProgress`/`buildingPages` consumed
(`publish-machine.svelte.ts:525,533`, `Publish.svelte:701`). Import ops all have prod callers
(`traverseCollection`/`planWadmImport`/`planCsvImport`/`manifestToExhibit`/`buildCsvTemplate`).

---

## Cross-check against exclusion set
- Structure rev-log dark capability is **NOT** the excluded "version-history dark data" — that
  DECIDED item (`DARKDATA.md:20`) is the annotation `annotations/history/*.json` pages + a PROV
  external consumer. Structure-revlog is a separate, PROBE-approved (`PROBE-structure-revlog.md`,
  verdict PURSUE) build that was half-enacted then parked behind an always-off flag. In-bounds.
- Persistence-idiom finding is scoped to the 6 non-App modules; Issue 18 owns App.svelte's copies.
- Spinner (393691e) and dialog scrim (`modality.svelte.ts` `use:scrimmed`, 12+ consumers) are
  already unified — confirmed non-issues.

---

## Issues (see final JSON for paste-ready loops)

1. [grilling, Strong] Section rev-log shipped dark behind an always-off flag — enact or park+cut.
2. [task, Strong] `DeploySession.persisted` dark field — implement the promised re-auth UX or delete it.
3. [task, Strong] localStorage persistence idiom hand-rolled in 6 non-App modules — extract a primitive.
4. [task, Worth exploring] `store.ts` 4-concern module — extract the asset-blob I/O seam.
5. [prototype, Worth exploring] Extract untested interaction machines from `ExhibitOverview` /
   `CreateExhibitDialog` into tested `.svelte.ts`.

## Directions
1. [Worth exploring] `bake.ts` source-format-preservation capability, unexposed by any import path.

## Fog
- README "Not yet built"/"Key files `src/lib/`" drift (DECIDED bucket — logged not ticketed).
- `placesEqual` dead-but-tested export (`place.ts:64`).
- Test-only DI seams with no prod override (`WriterLockOptions`, `createLibraryStore` opts).
- Proliferation of single-consumer tested micro-modules (roving/snippet/canvas-first-use/note-heads/
  mid-ellipsis/geo-notes/narrative-cue-reducer) — deliberate testability pattern; navigation cost only.
- `bake.ts`/`tiff-transcode.ts` no co-located unit test (integration-covered only).

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "Section rev-log capability is half-enacted and ships dark behind an always-off flag" — confirmed (Strong) → seeds Archie-a7a7.
- issues[1] "DeploySession.persisted is dark data — the 're-auth next time' behavior it documents is never implemented" — corrected (Worth exploring) → seeds Archie-b53d. Corrections: The title's central claim is wrong: the documented "you'll have to sign in again next time" UX IS implemented — not via `persisted`, but via the parallel flag `persistFailed` set from the same `ok` at publish-machine.svelte.ts:352, exposed at :495, and rendered in Publish.svelte:722-724 ("We couldn't keep you signed in on this computer — you'll sign in again next time."), with test coverage in Publish.test.ts:243. Also, the re-auth consequence is mechanically real independent of any flag (restoreSession finds no keyring token → null). What survives: the `persisted` field itself has zero readers (verified — only the 3 cited writes, the type decl, and test literals), making it a redundant duplicate of `!persistFailed`; the only sensible resolution is option B (delete the field), not option A.
- issues[2] "The localStorage try/catch persistence idiom is re-hand-rolled in 6 non-App modules with no shared primitive" — confirmed (Strong) → seeds Archie-3148. Corrections: Minor: feature-flags.ts:1's comment says "the same metadata idiom as IDENTITY_KEY / archie.lastPlace.v1 (App.svelte)" rather than literally naming the try/catch idiom — substance identical. Also the finding undercounts: writer-lock.svelte.ts:61 has an eighth hand-rolled try/catch localStorage read not listed among the six.
- issues[3] "store.ts is a 4-concern module; the ~12-function asset-blob I/O group is a cohesive extractable seam" — corrected (Worth exploring) → seeds Archie-cf93. Corrections: 1) "the asset-blob math has no direct test; it's exercised only via .svelte.test.ts integration" is false: apps/studio/src/asset-read-failure.test.ts is a plain .test.ts unit test importing readThumbBytes/readThumbUrl/AssetReadFailedError directly from ./store.js and covering absent-vs-failed, round-trip, the AssetReadFailedError propagate branch, AND the display-degrade branch — the finding's own "loop" even names this file, contradicting its "no direct test" claim. The remaining untested surface is narrower (peaks/original/master round-trips, saveAssetFile/saveOriginalFile writers). 2) Metadata group is :180-254, not :180-261 (:261 is ASSET_PREFIX, part of the asset group). 3) Exported asset functions number 11 (plus ASSET_PREFIX/isAsset and 5-6 private helpers), so "~12" is fair but includes non-exports.
- issues[4] "Interaction state-machines are trapped untested inside ExhibitOverview and CreateExhibitDialog" — DROPPED (refuted). refuted — marquee/move-mode/projection math already extracted and unit-tested (overview-selection.ts, overview-move-mode.ts, render-core geo.ts). Full refutation: The pure logic the finding claims is "trapped untested" is already extracted and unit-tested. (1) Marquee intersection math: `marqueeHits` lives in apps/studio/src/overview-selection.ts with overview-selection.test.ts (129 lines); ExhibitOverview.svelte:364 `commitMarquee` explicitly delegates to it — its own comment says "the pure geometry is marqueeHits; the DOM read stays here". What remains at :346-397 is pointer-capture/DOM-rect glue, not math. (2) Move-mode machine: the state transitions (`liftRow/moveRow/moveRowTo/indexOfMoving`) and all ARIA announcements live in overview-move-mode.ts with overview-move-mode.test.ts; the :478-535 block is focus management and key-to-transition dispatch only. (3) Map projection: `lngLatToPixel`/`pixelToLngLat` are in packages/render-core/src/geometry/geo.ts with geo.test.ts — the "ll<->world projection round-trip" test the loop proposes already exists. Residual kernel of truth: CreateExhibitDialog's map-locator glue (drag, zoom-anchor arithmetic ~:385-397, fitToBox ~:400-409, PROVIDERS/REGIONS constants) is component-local and untested, but it is thin state wiring around already-tested projections, not a trapped state machine. File-size and cited line numbers were accurate (1267 lines, 82KB, functions where claimed); roving.ts + roving.test.ts exist as claimed.
- directions[0] "bake.ts can preserve a source image's format on downscale, but no import path ever asks it to" — DROPPED (refuted). refuted — the common no-rotation ingest path already preserves source mime via downscaleIfNeeded (ingest-flows.ts:506-513, bake.ts:83-103). Full refutation: The central claim "Every non-TIFF import is therefore flattened to a PNG display master" is false. The finding cites only the EXIF-rotation branch (ingest-flows.ts:497-499) and ignores the third branch it sits next to: the no-rotation path (ingest-flows.ts:506-513, the common case) calls downscaleIfNeeded(file, MAX_MASTER_DIM, file.type || "image/jpeg") — bake.ts:83-103, added as POLISH P6 — which preserves the source mime on downscale ("a big JPEG stays JPEG", comment at :507-509) and returns the raw bytes untouched when under the cap. So format-preserving downscale IS wired into production ingest; a photographic JPEG/WebP without EXIF rotation is never re-encoded to PNG, and the claimed user-visible quota inflation does not occur in the typical case. What remains true is narrow: (1) bakeDisplayMaster's mime/quality BakeOptions are default-only in production (its single prod caller at :497 passes only maxDim) — but that PNG output is deliberate for the upright-EXIF master (lossless bake; original preserved separately, provenance recorded), and the options look vestigial now that downscaleIfNeeded owns the preserve-format case; (2) an EXIF-rotated JPEG does get a PNG master. That is a much smaller residue than "no import path ever asks it to". Also note maybeDownscale does not exist; the cited bake.ts:79-80 is downscaleIfNeeded's doc block.
