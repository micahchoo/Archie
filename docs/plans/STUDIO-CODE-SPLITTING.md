# Plan — Studio bundle code-splitting (POLISH P1–P3)

_Created 2026-05-27. The one polish item that warrants a plan (cross-subsystem, can break rendering if the
OSD lazy-load is mishandled). Goal: cut the Studio main chunk (1.15 MB / 349 KB gz; build warns >500 KB) by
deferring code that isn't needed on first paint. NOT started — this is the plan; execute in the ordered phases
below, lowest-risk first, verifying the chunk-size delta + a smoke of each surface between phases._

## What's in the chunk (from the perf scout)
- **OSD + Annotorious** — static `import` in `render-mount/src/mount.ts:13-16`; no `manualChunks` in `apps/studio/vite.config.ts`. Dominant weight.
- **All view components** static-imported in `App.svelte:8-18` (LibraryHome, ExhibitOverview, NarrativeEditor, MergeReview, Publish/PublishDialog, ShortcutsHelp). Mutually-exclusive surfaces, eagerly parsed.
- **AvEditor** shell static (WaveSurfer inside is already lazy).
- **voynich/bidar fixtures** static, only used on first run.

## Ordering principle
**Lowest-risk → highest-risk.** Splitting a leaf UI component (no other consumers, gated by `{#if}`) is safe and
reversible; splitting OSD (the rendering core, mid-session, with imperative lifecycle) is the risky keystone — do
it last, alone, with its own verify. Each phase must leave the app fully working.

## Phases (each: build → confirm chunk-size delta → smoke the touched surface → stop)

### Phase 1 — leaf view components (safest, biggest easy win)
Lazy-load the mutually-exclusive overlay/surface components via Svelte dynamic `import()` (an `{#await import()}`
or a small async-component helper), gated by their existing open/`{#if}` flags:
- `MergeReview`, `PublishDialog`/`Publish`, `ShortcutsHelp`, `NarrativeEditor`, `LayoutPicker` (already `{#if}`-gated).
- Acceptance: each opens correctly on first invocation; main chunk shrinks; no eager import of these in the entry graph (check the build's chunk list).
- Risk: low — these have no imperative cross-state; a load flash is acceptable (add a tiny "…" fallback).

### Phase 2 — `AvEditor` + fixtures
- Lazy `AvEditor` behind `{#if isAvCurrent}` (component-level dynamic import). WaveSurfer already lazy inside.
- Dynamic-import `voynich`/`bidar` fixtures only when seeding a fresh library (`exhibits.length===0`).
- Acceptance: opening an AV object loads AvEditor on demand; first-run seeding still works; image-only sessions never fetch AvEditor/fixtures.

### Phase 3 — `manualChunks` (vite config, no behavior change)
- Add `build.rollupOptions.output.manualChunks` to `apps/studio/vite.config.ts`: split `openseadragon`, `@annotorious/*` into a named vendor chunk. This alone improves caching + the warning without touching app code.
- Acceptance: a stable `osd`/`annotorious` vendor chunk appears; app behaves identically.

### Phase 4 — OSD/Annotorious dynamic load (the risky keystone — do LAST, alone)
- In `render-mount/src/mount.ts`, convert the top-level `import OpenSeadragon` / `createOSDAnnotator` to a dynamic
  `import()` inside `createMount()` (already async). The mount seam is already a Promise-returning factory, so the
  call site (`Canvas.svelte`) shouldn't need shape changes — VERIFY this.
- **Risk:** OSD has imperative lifecycle (viewer construction, handlers, `update-viewport`). A mis-timed lazy load
  could break draw-to-create, fitBounds, the popover re-anchor. **Mitigation:** keep `createMount` awaited exactly
  as today; only the import moves inside. Smoke ALL canvas paths after: draw-to-create, select+fitBounds, popover
  follow on pan/zoom, narrative region-zoom.
- Acceptance: every canvas interaction works; OSD lands in its own async chunk; main chunk no longer contains OSD.
- If anything regresses → revert Phase 4 only (Phases 1–3 stand); the manualChunks split (Phase 3) already
  captures much of the caching win without the lazy-load risk.

## Verification per phase
`node node_modules/vite/bin/vite.js build` (node22) → read the emitted chunk list + sizes; confirm the target code
left the main chunk; smoke the touched surface in the browser (browser-verify owed — OSD/canvas can't be headless).
Core/mount/svelte tests stay green throughout (no logic change).

## Out of scope
The `App.svelte` monolith refactor (POLISH Q10, L) — a separate, larger plan (extract `useBinding`/`useNoteEditor`
composables + finish the LibraryHome split per `.interface-design/system.md`). Do NOT fold it into code-splitting.
