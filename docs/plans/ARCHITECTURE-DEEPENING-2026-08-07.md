# Architecture Deepening — whole-system phase plan

Date: 2026-08-07. Source: `improve-codebase-architecture` run on every subsystem
(8 subsystems, 35 candidates, report at `/tmp/architecture-review-20260807-002529.html`).

## Execution record (same date, all phases landed)

All nine phases were executed and gated. Final state: 126 files changed,
+3861/−5575 (net −1714). Every gate passed: render-core 1521 tests, render-mount
222, render-svelte 15, archie-viewer 218, viewer 281, studio 1293, cargo 38;
all 6 typechecks; embed eager-gz at baseline; verify-publish 26/26; scripts
checklist 6/6.

## Verification record (2026-08-08, independent re-run)

> **Committed state:** the whole plan is committed — the deepening landed as
> `8341381` (185 files, +9201/−4407) and HEAD is now `caa3736` (read-path
> hardening, +2292/−53 over 13 files). The three defects below were found on the
> working tree, fixed, and are part of `8341381`.

All gates re-run on the working tree and confirmed. Three defects in the
uncommitted work were found and fixed:

1. **P8 wiring regression (`apps/studio/src/Publish.svelte:243`)** —
   `get publishBlocked() { return blocksPublish(preflight); }` returned the
   boolean RESULT where publish-machine's contract declares a predicate
   (`publishBlocked?: () => boolean`, invoked `?.()` at publish-machine
   line 734). Latent runtime TypeError on the advanced-token form; caught by
   svelte-check (exit 1), invisible to tsc and to the suite (machine tests
   feed a function or undefined). Fixed: `return () => blocksPublish(preflight);`
   — the closure re-reads `preflight` at call time, which is also the
   intended fresh-check semantics. Studio: svelte-check 0 errors, 1293/1293,
   typecheck clean.
2. **Stale root `dist/`** — `packages/archie-viewer/dist` was regenerated
   (new chunk names: reader-VGSN4VKG.js, reading-layer-MHJCL5T4.js, …) but the
   committed root copy was never resynced; `sync-dist:check` exited 1.
   Fixed: `node scripts/sync-dist.mjs`; check now passes.
3. **Two unused imports** (astro-check ts(6133) hints in the work):
   `note-arrival.ts` `NoteTreeData`, `scroll-intent.test.ts` `ScrollIntent`.
   Removed; viewer astro check 0 errors (3 pre-existing baseline hints remain).

Final gate matrix on the fixed tree: render-core 1544 (1521 at execution;
+23 from the read-path hardening), render-mount 222,
render-svelte 15, archie-viewer 218 (+ bundle at baseline, sync-dist clean),
viewer 281 (+ astro check clean), studio 1293 (+ svelte-check clean), cargo
38 pass / 1 intentional ignore; all 6 package typechecks clean; verify-publish
26/26 against the baked tree (`apps/viewer/public/published` — the earlier
run's 8/8 baked-tree count is superseded; fixity SKIP by absence); scripts
checklist 6/6.

- **P1 read seam** — `NodeFilesystem` (`@render/core/node` subpath — kept OFF the
  browser barrel after the esbuild gate caught the node:fs drag), `tryResolveFile`
  (one classified traversal), `httpJsonSource` + `fetchZipBytesIfAny` in core;
  5 script bridges collapsed; published.ts + embed load.ts compose core; viewer
  gained the SRC_MAX_BYTES cap on hosted reads (hardening). The gate caught the
  barrel issue; the embed build red until the subpath move.
- **P2 marker** — one `classifyArchieMarker` + typed verdicts; both gates became
  thin adapters; `requirePresent` strict option; verify-publish composes it.
- **P3 core twins** — `recordsToWorking` (session↔undo), segment-safety predicate
  to wadm/brand (parity test deleted), `FileContent`/`collectFiles` to
  publish/snapshot.ts, `loadLibrary` lossless-on-request (`preservePublishFields`);
  republish-tree collapsed to a thin composition.
- **P4 video** — `video-profiles.ts` (neutral contract), one `VideoCapabilities` +
  one `pickTarget`/`unavailableReason`, the desktop ffmpeg sidecar CONNECTED via
  `video-sidecar-bridge.ts` (temp-file, $APPDATA scope, no grant needed),
  TILE_MIN_EDGE single home, honest probe estimate + `videoTierTell` on the
  surface. Archie-e870 connected, ticket stays OPEN (needs one real Chromium
  encode).
- **P5 viewer surface** — `note-tree.ts` (one walk; V100 bug class has one home),
  `createNoteSurface()` (one open-note state machine, three hosts shrink ~100 ln
  each), `readingSession` (ExhibitView sheds ~15 locals; wall-text threshold
  headless-testable).
- **P6 mount** — `overlay-core.ts` (one lifecycle, one `OverlayViewerLike`,
  `makeClickable` V68 home), `osd-open.ts` (one OSD construction), one
  `clampViewportToRegion`. Gate caught a REAL regression: the merged
  `applyFitBounds` dropped the OSD Rect→Box conversion (NaN fits); fixed.
- **P7 embed** — per-annotation `styleFor` channel on the read overlay (P6 core),
  **reading-marks.ts deleted** (the package's only untested module — its
  DOM-pairing + 12-frame retry gone by construction), Reading layer collapsed to
  `reading-layer.ts`, AV player re-tokened, `openNote(id)` one contract, codec
  returns the resource IRI + one fragment parser in core.
- **P8 studio** — `editor-model.svelte.ts` (the ~450-line canvas derivation
  cluster leaves App.svelte; bboxIoU/co-location headless-tested), legacy
  advanced-token flow folded into publish-machine (drifted validator collapsed,
  five clipboard helpers → one `copyText`), `createGenerationGuard` shared by
  both stores. Gate caught the mount-barrel OSD drag into a headless test;
  `zoomBand` + `dotsVisibleForBand` moved to core as a consequence (third twin
  collapsed).
- **P9 tail** — dot solver into the controller seam (8 headless tests),
  MarginColumn deleted, index.ts fiction re-exports pruned, one tolerant
  `scripts/lib/checklist.mjs` (byte-identical tails), `scroll-intent.ts`
  headless (21 tests; harness bug found and fixed at the gate), github.rs split
  into 4 modules with a tested `PollIo` poll loop. Gate caught Tauri 2's
  `__cmd__` macro-path break (fixed via sibling re-exports) + a fixture type
  error.

Cross-cutting: `zoomBand` + `dotsVisibleForBand` now live in render-core
(mount re-exports) — the studio derives band + visibility without importing the
mount's OSD graph, and no second copy of either threshold exists.

## 1. Whole-system abstractive analysis

The subsystem report lists 35 candidates. Read as one system, they collapse into
a small number of structural facts about the seams — not about the subsystems.

### The load-bearing seams

| Seam | Location | Role | Health |
|---|---|---|---|
| Filesystem | `render-core/fs/seam.ts` | byte source, 8 backends, `isNotFound` | deep, but no node:fs backend |
| JsonSource read | `render-core/publish/read.ts` | **"THE DOMINO"** — one traversal, fs-walk vs HTTP | deep; tree-open half duplicated downstream |
| Open | `render-core/publish/open.ts` | untrusted zip decode + ADR-0020 validate | canonicalized (Issue 5) |
| Publish | `render-core/publish/site.ts` | `publishLibrary`, one deep writer | deep; inverse `loadLibrary` lossy |
| Marker gate | `publish/marker.ts` + `publish/read.ts` | ADR-0020 version policy | twin implementation + verifier 3rd copy |
| Session | `session/session.ts` + `undo.ts` | authoring loop + undo overlay | twin working projection |
| Mount | `render-mount/*` | OSD + overlay lifecycle | overlay lifecycle ×3, OSD construction ×2 |
| Video | `src-tauri/video.rs` ↔ `studio/video-transcode.ts` | ffmpeg sidecar | built on both sides, **never connected** |

### The duplication families

The 35 candidates are instances of four families:

1. **The read path is the true domino.** The code says so itself (`read.ts`
   header: "THE DOMINO"). The Filesystem/JsonSource seam is the byte source for
   every consumer — Studio preview, Viewer hosted, the embed, and the entire
   scripts toolbelt — yet it lacks the two things those consumers all re-derive:
   a node:fs directory backend (5+ hand-rolled disk bridges in scripts) and a
   classified path-resolve (4 hand-rolled absent-vs-failed walks in core). Fix
   the seam once; every consumer shrinks.

2. **Marker policy has three homes** (zip gate, tree gate, verifier strict
   check). This is the version contract of the whole publish system; a schema
   bump drifts it silently. Collapse onto one `classifyArchieMarker` + strict
   option.

3. **Surface layers duplicate state machines, not data.** The viewer's
   open-note surface (×3 readers), note-tree walk (×4 functions, V100 bug found
   twice), reading session (smeared across ExhibitView); the embed's Reading
   layer (×4 modules); render-mount's overlay lifecycle (×3). Same shape one
   level up: one concept, N copies of the state machine. Each is an independent
   vertical slice.

4. **Dead weight and untested logic mass.** MarginColumn (0 consumers),
   index.ts fiction re-exports, barrel half-seam, legacy token flow, 5 clipboard
   helpers, TILE_MIN_EDGE twin; plus logic outside the test gate (App.svelte
   view-model cluster ~450 ln, Canvas dot layer, scroll-intent machinery,
   github.rs poll loop).

### The domino ordering

The read seam is first because it is upstream of the most other fixes:
NodeFilesystem unblocks every script bridge AND the verifier's marker
composition; the tree-open half unblocks the viewer/embed drift. Everything
else (marker policy, core unifications, video contract, surface state machines)
composes on top. Surface slices are orthogonal to the seam work and to each
other — they are independent vertical cuts through different subsystems.

## 2. Phases

Each phase is an orthogonal vertical slice: a concept fixed end-to-end through
its seam and every consumer, verified before the next phase starts. Ordering is
leverage-first; within a phase, agents run in parallel on disjoint files.

### Phase 1 — The read seam deepens (THE DOMINO)

Two waves.

**Wave 1 (additive, low risk):**
- `NodeFilesystem` backend in render-core `fs/` — real node:fs directory
  backend behind the existing seam; ENOENT → canonical absent; passes the
  conformance suite (writable).
- `tryResolveFile(fs, path)` seam primitive — one classified absent-vs-failed
  traversal; collapse the 4 hand-rolled walks (read.ts `fsJsonSource`,
  portable.ts mint helpers, working.ts getAsset/getThumbnail, image-index).
- Re-point script bridges onto NodeFilesystem: verify-publish-run.mts (delete
  `readRaw`/`jsonSourceFromRaw`), republish-tree.mts (`loadDirInto`),
  deposit-fixture.mts (`dump()`), proto + prototypes.

**Wave 2 (behavioral, needs both apps' tests as gate):**
- Tree-open dispatch + HTTP classification into core: `classifyFetch` +
  `openTreeSource`-style composables over JsonSource (the `open.ts` precedent).
- published.ts re-points its hosted path onto `fsJsonSource(HttpFilesystem)`
  keeping `?g=` generation keying + `migratingJsonSource` + rebase on top.
- load.ts composes the same primitives; zip-fallback dispatch unifies
  (`fetchIfZipBytes` ↔ `openSrcAsZipIfBytesAreZip`).

**2nd/3rd-order watch:** generation cache keys must survive the re-point;
portable/live modes untouched; `fixture-reach` rule (no direct @render/mount in
viewer) unaffected.

**Gate:** render-core tests + viewer tests + embed tests + typecheck; run
`verify-publish-run.mts` against a baked tree.

### Phase 2 — Marker version policy collapses

- One pure `classifyArchieMarker(marker) → typed verdict` + shared message
  builder in core; `validateArchieMarker` and `assertArchieTreeMarker` become
  thin source adapters (keeping their absent-policies).
- Strict variant (`requirePresent`) for the tree gate; verify-publish-run
  composes core's field checks instead of re-deriving them.

**Gate:** core tests (marker/read), verify-publish-run against baked tree.

### Phase 3 — Core unifications (small twins)

Parallel agents, disjoint files:
- `recordsToWorking()` in spine/serialize.ts; session + undo compose (deletes
  the unguarded mirror).
- Path-segment safety predicate to one layer-zero home; fs/names + spine
  import it; parity test deleted.
- `FileContent`/`collectFiles` to neutral publish/snapshot.ts; ghpages
  re-exports; delta/push-delta import the pure shape.
- `loadLibrary` lossless-on-request (option to keep tileSource/thumbnail);
  republish-tree collapses to a thin composition.

**Gate:** core tests + typecheck; republish-tree run against a fixture tree.

### Phase 4 — Video contract + sidecar connection

- Neutral `video-profiles.ts` (profiles + error kinds); web path stops importing
  the desktop module (kills the tauri-fs leak).
- One normalized capability shape + one `pickTarget`/`unavailableReason`; two
  probes become thin adapters.
- Temp-file bridge + fs-scope grant + `isTauri()` branch in
  `resolveVideoEncoder` — the sidecar connects.
- TILE_MIN_EDGE single home; probe estimate threads the resolved target.

**Gate:** studio tests (video-transcode, publish-tier wiring) + typecheck;
cargo check in src-tauri.

### Phase 5 — Viewer reading surface

- `note-tree.ts` — one walk (flatten/ownerOf/locate); 4 consumers compose.
- `createNoteSurface()` — one open-note state machine; 3 readers shrink ~100 ln
  each.
- `readingSession` — one Reading concept; ExhibitView sheds 15 locals.

**Gate:** viewer tests + typecheck.

### Phase 6 — Mount consolidation

- One overlay core (`createOverlayLayer`) owning the OSD lifecycle; three
  controllers become content builders.
- Shared `openOsdViewer` + `awaitOpen` for both mounts.
- `clampViewportToRegion` — one clamp math, oracle + live settle.
- `makeClickable` — V68 capture workaround owned once.

**Gate:** render-mount tests + typecheck; render-svelte consumers still green.

### Phase 7 — archie-viewer surface

- Reading layer collapses to one module behind `setReading(id)`.
- Read-overlay gains `styleFor` (on the NEW Phase-6 core); reading-marks.ts and
  its DOM-pairing post-pass delete.
- AV player re-tokens (last literal palette); `openNote(id)` contract unifies
  image/AV surfaces; content-state codec returns resource IRI; barrel
  openObject demoted or unified.

**Gate:** archie-viewer tests + typecheck; embed smoke via fixture.

### Phase 8 — Studio

- `createEditorModel` — the canvas view-model leaves App.svelte (testable).
- Legacy advanced-token flow folds into publish-machine; one `copyText`.
- `createGenerationGuard` shared by binding-store + resident-store.

**Gate:** studio tests + typecheck.

### Phase 9 — Tail (deletions + speculative)

- render-svelte: dot-layer into controller seam; delete MarginColumn; prune
  index.ts fiction re-exports.
- scripts: one tolerant `checklist.mjs` for the four gates.
- scroll-intent.ts extraction (headless-testable).
- github.rs split + poll-loop timing tests (cargo test).

**Gate:** full `pnpm -r test` + `pnpm -r typecheck` + cargo test.

## 3. Cross-phase regression rules

- Verify each phase before starting the next (typecheck + the touched
  packages' tests + targeted script runs).
- Phase 6 lands before Phase 7 (the style channel targets the new overlay
  core).
- Phase 1 Wave 2 lands before Phase 2 (marker strict variant composes the
  re-pointed verifier).
- No phase changes the shape of a seam another in-flight phase consumes.
