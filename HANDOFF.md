# HANDOFF — `<archie-viewer>` embeddable read-only viewer

**Updated:** 2026-06-21. **Branch:** `feat/archie-viewer-embed` (off `main`).
**Active goal:** plan → execute → review this work, plus examples in a `recipes/` folder.
(Supersedes the prior Object-level-Notes handoff — that shipped in `5d501a8`.)

## ⟢ PARALLEL WORKSTREAM — Showroom exhibit ("Archie annotates Archie") — IN PROGRESS 2026-06-22
Self-documenting exhibit: 21 screenshots of Archie's own UI, annotated to demo all 42 user-story
features (Studio + Viewer + Embed). Doubles as feature list / tutorial / showroom.
- **DONE (verified):** `docs/showroom/` — `exhibit.md` (manifest: 4 readings as feature tracks
  studio/viewer/embed/power; object→source→CSV map; 21-section tour spine) · `csv/*.csv` (21 CSVs,
  schema `object,comment,x,y,w,h,tags,reading,_showoff`; ALL coordinate-free → pending notes; the
  `_showoff` column = inline extra-feature hints, ignored by importer) · `SHOWROOM-NOTES.md` · `verify.mjs`.
  **Verified:** `node --experimental-strip-types docs/showroom/verify.mjs` → 87 rows → 87 pending, 0 skipped,
  all object/reading resolve. Plan+coverage: `docs/plans/SHOWROOM-EXHIBIT-PLAN.md`.
- **Decisions:** coordinate-free (curator draws boxes via "Set area", dogfoods CSV import + placement);
  exhaustive scope (21 screens, all 42 stories). CSV import path = `apps/studio/src/csv-import.ts`.
- **HARNESS EXTENDED + RUN (2026-06-22):** `scripts/capture-screenshots.mjs` extended additively (new
  `captureViewerStates`/`captureStudioStates`/`captureEmbed` + helpers; EXHIBITS regexes retargeted to exact
  seed TITLES `^The Whole Manuscript$`/`^Reading the Unreadable$` — `/voynich/` matched the slug-subtitle
  span, wrong card). Studio mounts at `/studio/` (pass `STUDIO_URL=…/studio/`); run servers standalone via
  per-app `.bin/{astro,vite}` under nvm Node 22 after `vite-node apps/viewer/scripts/gen-published.mts`.
  **21/21 valid PNGs in `docs/screenshots/auto/`** (1440×900, all >16KB; verified). The final 3 were
  unblocked by ADDITIVE seed fixtures (no shared-fixture mutation, all tests green — viewer 63, studio 148):
  - **NEW `apps/viewer/fixtures/sampler.ts`** — "Showroom Sampler" exhibit `ex-sampler`: `sv1` video (Big Buck
    Bunny, CC BY 3.0, 1MB MP4), `sa1` audio (Kryptogramm master) + 3 transcript `t=` notes, `si1` image with a
    media-bearing note (NoteMedia tile). Wired into `apps/viewer/fixtures/sample-data.ts` (buildSamplerLog rng=4,
    logsById), `apps/viewer/src/pages/[slug].astro` (sampler route), `apps/studio/src/seed-data.ts` (seededSampler,
    DEFAULT_EXHIBITS). Re-baked published tree (309 files, `sampler/` live).
  - Harness: `viewer-av` retargeted to the sampler audio object (MediaPlayer+transcript); new `viewer-lightbox`
    flow (si1 image note → tile → NoteLightbox — tiles render in grid Reader, NOT MediaPlayer); new
    `studio-editor-video` flow (sv1 plate → AvEditor video mode). `viewer-bidar` still a pre-existing /bidar 404
    (no bidar exhibit; not a showroom source).
- **NEXT — ASSEMBLE (recipe in `docs/showroom/ASSEMBLE.md`):** build the showroom exhibit from the 21 PNGs (21
  objects), create the 4 readings (studio/viewer/embed/power + colours from exhibit.md), import the 21 CSVs via
  Studio CSV import (each → pending notes), draw the pending regions with "Set area", wire the 21-section
  narrative tour, set metadata, publish. Largely a human-in-Studio session (coordinate-free was chosen so the
  curator draws boxes). Open question for that phase: does the showroom live as a permanent seed fixture or a
  hand-built exhibit ingested from the PNGs.

## What this is
The "Recipes for institutional buy-in" ask resolved (via grill-with-docs) to ONE artifact: a
single **read-only `<archie-viewer>` Web Component** that drops an Archie exhibit into any page.
NOT per-CMS plugins (server-side → breaks the no-server lock; anvil ADR-0006 says iframe+WC only).

## Locked design (audit-ready, all written)
- **ADR-0019** — read-only embed; drop Annotorious/PixiJS → DOM-SVG region overlay → no `unsafe-eval`;
  ~half bundle (~110–150 KB gz vs 282.9); two-bundle lazy; jsDelivr `/gh/` + SRI distribution.
- **ADR-0020** — `.archie.zip` L1 self-ID marker (`archie.json {format,version,generator,derivedFrom?}`),
  validation-not-authentication, NEVER crypto-sealed (hand-editable); fingerprint ≠ security boundary.
- **ADR-0021** — target contract: `src` (zip-URL | tree-URL | absent→drop) · `target` (native-route
  full cite ladder, Section `/s/<id>` NEW) · `offline`; target-not-found DEGRADES UPWARD.
- **CONTEXT.md** — glossary "Embeddable viewer" + section "Embeddable read-only viewer" + RESOLVED contract.
- **docs/plans/EMBED-VIEWER-IMPLEMENTATION-STRATEGY.md** — ordering principles, 5 phases (0–4) with
  validates/does-not-validate, reducibility classification, mechanical execution system, first move.

## Free vs new (verified 2026-06-21, deeplink-verify workflow)
- **FREE (reuse):** reading-auto-activation on note deep-link, narrative-landing-at-target,
  target-before-zip on `src=`, 4-of-5 route rungs parse, remote-zip via `openLibraryFromSrc`, DOMPurify.
- **Security verified:** SVG-selector XSS + prototype-pollution closed-by-construction (geometry-only
  `parsePolygonPoints`; typed JSON reads). The ONE live High = decompression bomb (uncapped drop path).
- **NEW (10-category build list in the strategy doc):** read-only SVG-overlay mount (keystone) · element +
  Shadow DOM · hosted-tree-from-arbitrary-base · Section grammar + widen the route→reader seam (drops
  xywh/t=/section) · slug-level degrade-upward (missing exhibit THROWS today) · region clamp · AV `t=`
  seek-PAUSED (never reuse play-coupled `seekTo`) · decompression cap · L1 marker · instance-scoped load
  refactor (`published.ts` module-globals → per-element — biggest hidden scope) · §258 dup-logicalId fix.

## First concrete move (keystone)
Phase 0: build the read-only **DOM-SVG overlay mount** in `render-mount` (replace `createOSDAnnotator`;
reuse `frame-overlay.ts` donor; keep OSD), TEST-CORPUS-FIRST (selectors→geometry + "selector value never
reaches innerHTML" assertion), then measure bundle + confirm no `unsafe-eval` in a strict-CSP harness.
If a DOM-SVG overlay can't replace Annotorious, ADR-0019's whole premise is wrong — cheapest place to learn it.

## Executed this session (branch `feat/archie-viewer-embed`, UNCOMMITTED)
- **Plan:** `docs/plans/EMBED-VIEWER-PHASE-0-PLAN.md` — 10-leaf DAG (P0-1..P0-10), test-first,
  non-regression-by-SEPARATION (new `read-overlay.ts` / `read-mount.ts` siblings; editor path untouched +
  a git-diff-empty gate P0-9). OSD tested via a fake `OverlayViewerLike` (no browser in Phase 0).
- **Recipes:** `recipes/` — README + 01..08 (github-pages, self-host-zip, local-drop, deep-link, offline,
  wordpress, ghost, multiple-on-one-page). Verbatim ADR-0021 contract; honest "element not built yet"
  banner; iframe fallback (anvil ADR-0006); double as integration fixtures. Reviewer: matches ADR-0021 exactly.
- **Code (GREEN, TDD red-first):** Section route rung `#/{slug}/s/<id>` (route.ts + test; render-core 676
  tests green, additive) · decompression cap in `fromZip` (`ZIP_LIMITS` 512MB / 50k entries / 100x ratio via
  fflate `UnzipFileFilter` — rejects by DECLARED size pre-inflate; zip.test.ts 9 green).
- **Review:** SHIP-WITH-FIXES. Both slices test-first / in-lane / no-regression (reviewer re-ran green).

## Wave 1 — DONE (verdict SHIP, no must-fix)
- **Phase 0 keystone GREEN** — `packages/render-mount/src/read-overlay.ts` (DOM-SVG, geometry-only via
  `createElementNS`+`setAttribute`, security test genuine — spies on `innerHTML` setter) + `read-mount.ts`
  (`createReadOnlyMount`: OSD kept, NO `createOSDAnnotator`/Annotorious/pixi). render-mount **90 tests green**.
  **Bundle 79.3 KB gz vs 223.7 KB OSD+Annotorious (~144 KB drop) → ADR-0019 premise PROVEN.** Non-regression
  gate PASSED (editor path untouched). P0-1..P0-10 all done. (Live strict-CSP browser verify + two-bundle
  split = Phase 1, deferred by design.)
- **L1 marker (ADR-0020) GREEN** — `archie.json` write (`publish/site.ts`) + `validateArchieMarker` (NEW
  `packages/render-core/src/publish/marker.ts`) asserted in `published.ts` before open; viewer try/catch
  follow-up done (`openZipBytes` re-throws friendly Error). render-core **682** + viewer **44** green.
- **§258 dup-id GREEN** — per-slug RNG seed; the 3 voynich exhibits' logicalIds now disjoint.

## Remaining waves (dependency-ordered)
- **Wave 2 — DONE (SHIP):** `packages/archie-viewer/` element (customElements.define, open Shadow DOM,
  src/target/offline reactive, drop-zone, gallery grid via donor markup [no Svelte runtime], lazy reader via
  dynamic import → createReadOnlyMount; **gallery entry 3.5 KB gz, OSD only in the async chunk**; INSTANCE-SCOPED
  state on private fields). Route `t=` extraction + region clamp (`clampToContentBounds`, optional `content` param)
  + image-decode guard (`render-mount/image-cap.ts`, built+tested). All green. **Phase 4 (multi-instance) is now
  MOSTLY MOOT** — the element has its own instance-scoped `load.ts`, so multiple embeds are already independent;
  the apps/viewer `published.ts` module-global refactor is NOT needed for the embed. (Tech debt: `load.ts`
  duplicates `published.ts` load logic — not blocking.)
- **Wave 3 — DONE (green) but left a regression:** apps/viewer Phase 3 (route→reader seam, slug-degrade-to-gallery,
  MediaPlayer seek-PAUSED via `landSeek` NOT `seekTo`, object/section/narrative edges; 3 new pure helpers
  av-/section-/narrative-landing.ts, 62 viewer tests) ‖ element full target ladder (`target-resolve.ts`, 44
  archie-viewer tests incl. two-instance) ‖ image-cap wired into read-mount + read-mount.ts:149 tsc fixed (111
  render-mount tests). **HARNESS CAUGHT** (the verify agent false-claimed clean): the seam PASSES props the child
  components don't DECLARE → 6 svelte-check errors (initialRegion/initialSeek/initialSection on Reader/MediaPlayer/
  NarrativeReader; sectionId on ExhibitView) + Reader:110 undefined — being fixed in wave 4.
- **Wave 4 — DONE (SHIP):** the 6 prop errors resolved (children declare+consume the props; `astro check` = 0) ‖
  element `src` now loads a published-TREE base URL too (zip-vs-tree dispatch + PK byte-sniff; 50 archie-viewer
  tests) ‖ Studio `PublishDialog` emits a `<archie-viewer>` WC snippet + iframe fallback (148 studio tests); the
  plan-doc nit is fixed. (The `PublishDialog` syntax error mid-wave was a literal `</script>` in a template string —
  the agent split the tag and rebuilt green.)
- **Final check — DONE: full-monorepo GREEN.** 1163/1163 tests (render-core 685, render-mount 111, render-svelte 7,
  archie-viewer 50, viewer 62, studio 148), `astro check` 0/0/0, embed eager entry 4.6 KB gz (OSD in lazy chunk),
  eval-free read graph confirmed. NO new failures.
- **⚠ UNCOMMITTED:** `git diff main...HEAD` is EMPTY — the whole feature lives in the working tree only
  (`packages/archie-viewer/` UNTRACKED; ADRs 0019–0021 + EMBED plans + recipes/ UNTRACKED; render-*/viewer/studio = `M`).
  A `git add -A` + commit is required to make this a real branch (commit only when the user asks).
- **BUILD LIST COMPLETE except:**
  - **PRE-COMMIT (owed artifact):** regen the static bake — `vite-node apps/viewer/scripts/gen-published.mts` — for the
    re-minted voynich ids (the §258 fix; committed `apps/viewer/public/published/` is stale). NOT auto-run (huge
    deterministic generated diff; best at commit time).
  - **IIIF interop — DONE (SHIP):** `iiif-content` attribute on the element (decode via `@render/core` deeplink.ts;
    `content-state.ts` resolver matches Canvas-IRI→object / Manifest-IRI→slug → existing target path → degrade-upward;
    native `target` wins precedence). 76 archie-viewer tests green. Snippet `recipes/EMBED.md` + `recipes/example.html`
    ready (verified accurate to ADR-0021). **NOW:** running `/github-readme` to add the EMBED.md section to the README.
  - **README — DONE:** `## Embed an exhibit` section added to README.md (after *Publishing*, before *Architecture*;
    TOC entry; skill audit NORMAL+STRICT pass). Links `recipes/EMBED.md` + `recipes/example.html`.
  - **CLEANUP:** ViewerRoute type already had `sectionId?`/`t?` (astro check 0 errors; render-core 685 green) — clean.
    PROVENANCE — DONE: **ADR-0022 (IIIF Content State interop)** written (`docs/adr/0022-iiif-content-state-interop.md`);
    `element.ts:17` + the 5 sibling refs (deeplink.ts/content-state.ts/element.ts) now resolve to it; realizes ADR-0021's
    deferred note. So the embed feature is FULLY COMPLETE + clean on the branch.
  - **RELEASE STEPS THE USER OWNS (for the embed to resolve LIVE):** commit the branch; tag `v1`; build + publish
    `dist/archie-viewer.js` so jsDelivr `/gh/micahchoo/Archie@v1` serves it; add the SRI `sha384` hash to the snippet.
  - **STILL DEFERRED (named):** cross-library affordance (blocked on Studio authoring), live strict-CSP
    packaged-app browser smoke.
  - **INTEGRATION-VERIFY-OWED (headless-untestable — needs a packaged-app/browser pass):** live OSD camera-fit to a
    `xywh` region; paused-seek firing on a real `<audio>/<video>` at `t=`; the live boot-throw→degrade path.
  - **PRE-EXISTING (not ours):** studio svelte-check noise (`PublishDialog` `onclick`×13+ / `archie.config.json`×2 —
    studio builds via vite, doesn't gate svelte-check); `render-mount/mount.ts:238` TS2345.
  - Nothing committed (commit only when asked) — offer to commit the branch.
- **Integration verify-owed (headless-untestable, needs a packaged-app/browser pass):** live OSD camera-fit to a
  `xywh` region; the paused-seek firing on a real `<audio>/<video>` at `t=`; the live boot-throw→degrade path.
- **Cleanup:** regen the static bake (`vite-node apps/viewer/scripts/gen-published.mts`) for the re-minted voynich
  ids (dup-id consequence — committed `apps/viewer/public/published/` is stale); fix the plan-doc nit
  (`controller.ts` lives in render-svelte, not render-mount).
- **Deferred (named):** cross-library affordance (blocked on Studio authoring), `iiif-content` interop (additive).
- Nothing committed (commit only when asked).

## Key files
`packages/render-mount/src/{mount.ts,frame-overlay.ts}` · `packages/render-core/src/{url/route.ts,
fs/zip.ts,geometry/selector.ts,publish/{site.ts,portable.ts,migrate.ts},url/deeplink.ts}` ·
`apps/viewer/src/{published.ts,components/{ViewerShell,ExhibitView,Reader,NarrativeReader,EmptyHall,
MediaPlayer,ReadingLegend}.svelte}` · `apps/studio/src/PublishDialog.svelte` (embed-snippet generator).
Tests: per-app `pnpm exec vitest` (root binary fails rune tests). Node 22.
