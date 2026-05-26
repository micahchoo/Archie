# PLAN — Local-view Phase B (local bridge + template filter + N=1) & Phase C (in-Studio preview)

> **STATUS (2026-05-26): Phase B executed; Phase C — LV-C1 (in-memory projection reader) executed +
> tested, LV-C2 (visual panel) is the remaining human gate.**
> Source of truth = CONTEXT.md §"Local view loop". Derives from `LOCAL-VIEW-LOOP.md`. Phase A is
> EXECUTED (see `LOCAL-VIEW-PHASE-A.md`).

## Big finding that shrank Phase B

**The Chromium local-publish mechanism already exists.** `App.svelte:writeToFolder()` calls
`publishLibrary(new FsaFilesystem(handle), buildFullLibrary(), …)` — it writes the FULL published
site tree to a bound folder on every Save. So a folder-bound project pointed at
`apps/viewer/public/published/` IS the local loop, once Phase A's generic shell renders it. No new
Chromium adapter was needed — only the template filter (so it doesn't ship demos) and the
non-Chromium path.

## Phase B — EXECUTED (tests + builds green)

| Task | What shipped | Verification |
|---|---|---|
| **B1 template filter** | `buildFullLibrary({includeTemplates?})` excludes bundled examples by default via the existing `isTemplate` (App.svelte). | Studio `vite build` ✓ |
| **B2 non-Chromium loop** | `gen-published.mts --from <zip>` expands a published `.archie.zip` via `loadLibrary(ZipFilesystem.fromZip)` into the served tree; default (sample-data) path unchanged. | viewer `astro build` prebuild (default path) ✓; `--from` composes tested primitives (loadLibrary round-trip is covered by `interop.test`/`site.test`) |
| **B3 single-exhibit = N=1** | `singleExhibitLibrary(library, slug)` in `@render/core` (one-exhibit Library, drops title/summary so the Gallery collapses). | `model/library.test.ts` (3 tests) ✓ |
| **SNAG canvasId base-mismatch** | `canvasIdMap(manifest)` in `@render/core` (canvas IRIs from the manifest, not a fixed BASE); `published.ts` exposes `canvasIdByObject`; `ExhibitView` consumes it (falls back to `canvasIdFor`). **Additive — left `objectsFromManifest`'s round-trip contract intact** (site.test:133 asserts exact object equality). | `iiif/canvasid.test.ts` ✓; viewer build ✓; core suite 278/278 |

**Local-publish affordance — DONE (2026-05-26).** ONE `PublishDialog.svelte` (single modal, internal
steps — NOT two stacked modals): "Publish…" toolbar button → choose **Locally** or **GitHub Pages**.
Locally guides to the **one fixed target the Viewer always reads** (`apps/viewer/public/published/`):
Chromium = pick that folder → `writeToFolder`; non-Chromium = save `.archie.zip` + "unzip its contents
into `apps/viewer/public/published/`, then `pnpm --filter @archie/viewer dev`" — no `<path>` placeholder,
no `gen --from`. GitHub hands off to the existing `Publish.svelte`. Studio `vite build` ✓.
(Addressed user feedback across iterations: zip dead-end → fixed-target extract; "same menu" → one
chooser; "two modals / obscured by the filepicker" → a single modal with internal steps.
`gen --from` remains available as a CLI/build path but is no longer the user-facing instruction.)

**STILL OWED (not blocking):** wiring `includeTemplates` + `singleExhibitLibrary` to Studio UI
controls (the functions exist; the menu uses default template-exclude, whole-library); human visual
gate on the menu/dialog flow.

## Phase C — in-Studio Preview (D) — DECOMPOSED, browser-gated, NOT built

The authoring-experience surface: a read-only render of the current exhibit **inside Studio**, via
the shared `render-mount`/`render-svelte`, over the **published projection** (`publishLibrary`→memory
→read back→render) — so what you preview == what publishes. This is **inherently human-gated**
(OSD/Annotorious render in a real browser; no viewer-side test runner) and crosses into Studio's
editor-mount layer.

```
TASK LV-C1  published-projection reader  [DONE 2026-05-26 — tested green]
  shipped:       @render/core readPublishedExhibit(fs, slug) + PublishedExhibitData (publish/site.ts)
                 — mirrors the Viewer's HTTP loadPublishedExhibit over the Filesystem seam. Studio
                 runs publishLibrary into a MemoryFilesystem, then reads ONE exhibit back: objects +
                 per-object heads + canvasIdMap + sections. NO fetch, NO second app.
  acceptance:    RUN `pnpm --filter @render/core test preview` → in-memory publish→read round-trip
                 green (publish/preview.test.ts). ✓

TASK LV-C2  Preview panel (browser-gated)
  donor:         the Viewer's ExhibitView/Reader (render-svelte mount) — read-only variant
  write-targets: apps/studio/src/Preview.svelte + a toggle in the Exhibit workspace toolbar
  change:        a read-only mount (no draw tools/edit) of previewExhibit(current) via render-svelte;
                 toggled from the workspace; single exhibit (the one being authored).
  acceptance:    HUMAN — toggle Preview while authoring; the exhibit renders as a visitor sees it,
                 markers + media included; matches the real Viewer.
```

**Why C is not auto-completable:** its value (a faithful visual preview) can only be certified by a
human looking at a browser — the same gate Phase A's shell and Phase B's folder-write carry. The
testable slice (LV-C1, the in-memory projection reader) can be done mechanically; LV-C2 is the human gate.
