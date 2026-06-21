# Reach + Reader + Moat Arc — Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Recommend a fresh branch (`feat/reach-reader-arc`) before Wave 1 — the working tree is currently dirty from a planning session.

**Goal:** Make Archie's published artifact *findable* (SEO), *searchable* (within-exhibit search), and *institution-ready* (a11y), then gate the in-browser tiling moat-bet behind a feasibility spike.

**Architecture:** Phase A (Waves 1–2) adds three independent reader/reach features on the existing publish + Viewer surface — no new runtime backend, all build-time or client-side static. Phase B (Waves 3–4) is the in-browser DZI tiling bet, deliberately fronted by a `[SPIKE]` and a human go/no-go gate so the 240 KB bundle budget and the zero-prior-art slicer are de-risked before any build commitment.

**Tech Stack:** TypeScript, Svelte (Viewer islands), Astro (Viewer shell), `packages/render-core` (publish emitter + geometry), `minisearch` (new dep, client-side), OffscreenCanvas (spike only).

**Prior-art basis:** `Prior Art/11-search-discovery.md` (axis 11), `Prior Art/12-accessibility.md` (axis 12), `Prior Art/16-performance-ux.md` (axis 16 — 240 KB budget unmeasured), `Prior Art/17-tile-generation.md` + `_GAPS.md` BLOCKER 4 (axis 17 — zero client-side prior art), `Prior Art/18-embedding-ecosystem.md` (axis 18). Seed ⑤ (SEO), seed ⑥-adjacent. ADR-0014 (self-describing pages), ADR-0016 (narrative emergent).

---

## File Structure

| File | Responsibility | Phase |
|---|---|---|
| `packages/render-core/src/publish/static-pages.ts` | **MODIFY** — `pageShell()`, `libraryPageHtml()`, `exhibitPageHtml()`, `sitemapTxt()`: inject og/JSON-LD/canonical, upgrade sitemap | A·SEO |
| `packages/render-core/src/publish/site.ts` | **MODIFY** — wire sitemap.xml emission (currently calls `sitemapTxt` ~L330) | A·SEO |
| `apps/viewer/src/og-image.ts` | **REUSE** — `ogImageFor()` URL minter, consumed by static-pages | A·SEO |
| `apps/viewer/src/lib/search-index.ts` | **CREATE** — headless builder: annotation tree → minisearch index doc array | A·Search |
| `apps/viewer/src/components/SearchOverlay.svelte` | **CREATE** — the finder overlay: text box + tag facets + result list; mode-independent (Q-4) | A·Search |
| `apps/viewer/src/components/ExhibitView.svelte` | **MODIFY** — owns the overlay + trigger affordance (chrome) + `Cmd/Ctrl-K`; result-select → existing `#/<slug>/a/<noteId>` arrival path (`:76`) | A·Search |
| `apps/viewer/src/components/Reader.svelte` | **MODIFY** — clickable tag chips (open overlay pre-scoped); cards = keyboard surface (Q-5); focus-visible | A·Search + A·A11y |
| `apps/viewer/src/components/NarrativeReader.svelte` | **MODIFY** — clickable tag chips (open overlay pre-scoped); section spine = keyboard surface (Q-5) | A·Search + A·A11y |
| `apps/viewer/src/components/ReadingLegend.svelte` | **MODIFY** — deepen existing radiogroup a11y | A·A11y |
| `apps/viewer/src/components/NoteLightbox.svelte` | **MODIFY** — focus trap + ESC + return-focus | A·A11y |
| `apps/viewer/src/atmosphere.css` | **MODIFY** — `:focus-visible` overrides | A·A11y |
| `apps/viewer/package.json` | **MODIFY** — add `minisearch` | A·Search |
| `packages/render-core/src/geometry/dzi-slicer.ts` | **CREATE (Wave 4, GO only)** — OffscreenCanvas DZI pyramid emitter | B·Tiling |
| `apps/studio/src/bake.ts` | **REFERENCE** — `bakeDisplayMaster()`, `downscaleIfNeeded()` (the path tiling would augment) | B·Tiling |
| `docs/spikes/2026-06-tiling-feasibility.md` | **CREATE (Wave 1)** — spike output: bundle measurement + slicer feasibility + go/no-go | B·Tiling |

---

## Tasks

### Task 1: Tiling de-risk — bundle measure + DZI slicer probe `[SPIKE]`

**Orient:** Answer whether in-browser DZI tiling is feasible *before* the team commits to building it — this is the go/no-go input for Q-9, not deliverable code.
**Flow position:** Step 1 of 1 in the tiling-bet flow (spike → gate → build). Independent of Phase A; runs first/concurrently.
**Skill:** `hybrid-research`
**Files:**
- Create: `docs/spikes/2026-06-tiling-feasibility.md`
- Reference: `apps/studio/src/bake.ts` (`bakeDisplayMaster` L33, `downscaleIfNeeded` L83), `packages/render-core/src/geometry/downscale.ts` (`fitWithin`, `exceedsCap`), `packages/render-core/src/geometry/geo.ts` (tile math L38–42)

- [ ] **Step 1: Measure the real published Viewer bundle.** Build the viewer (`pnpm --filter viewer build`), record gzipped JS island size, compare against the 240 KB budget (axis 16). Note the OSD + Annotorious baseline.
- [ ] **Step 2: Prototype an OffscreenCanvas DZI slicer.** In a throwaway script, decode one ≥8000 px image, generate a DZI pyramid (tiles + `.dzi` descriptor) entirely in-browser via OffscreenCanvas. Confirm OSD can read the output.
- [ ] **Step 3: Write the feasibility memo.** Record: measured bundle vs budget, slicer wall-clock + memory on the test image, whether OSD renders the output, and a **GO / NO-GO recommendation** with the bundle-delta cap the build must stay under.

Run: review `docs/spikes/2026-06-tiling-feasibility.md`
Expected: file contains a measured bundle number, a slicer result, and an explicit GO or NO-GO line. (Spike verifies via written answer, not a test.)

---

### Task 2: SEO — og-tags, JSON-LD, canonical, sitemap.xml `[CHANGE SITE]`

**Orient:** Make every published exhibit crawlable and link-rich so search engines and social cards surface it — the distribution multiplier (Q-8, extends ADR-0014).
**Flow position:** Step 1 of 1 in the publish-emit reach flow (annotation tree → **static-pages.ts head** → static HTML/sitemap). Independent — only render-core, no Reader.svelte contention.
**Skill:** `test-driven-development`
**Files:**
- Modify: `packages/render-core/src/publish/static-pages.ts` (`pageShell()` L36–42, `libraryPageHtml()` L59, `exhibitPageHtml()` L79, `sitemapTxt()` L54)
- Modify: `packages/render-core/src/publish/site.ts` (sitemap call ~L330)
- Reuse: `apps/viewer/src/og-image.ts` (`ogImageFor()` L11–16)
- Test: `packages/render-core/src/publish/static-pages.test.ts`

**JSON-LD shape (Q-8 — honest mapping, map-what-exists):** Exhibit → `CreativeWork`: `name`←`title`, `description`←`summary`, `license`←`rights` (URI), `creditText`←`requiredStatement.value`, `image`←per-object `ImageObject` (real `width`/`height`/`source`), multi-object → `hasPart: ImageObject[]`. Library → `CollectionPage` with `hasPart`. **Omit `author`** (model has no structured author; credit≠author). **`datePublished`/`dateModified`** stamped from the publish step's clock (the artifact's true publication time). All URLs absolute via `canonicalOrigin`+`viewerPath` from `archie.config.json` (already threaded through `publishLibrary`'s `baseUrl`).

- [ ] **Step 1: Failing test** — assert `exhibitPageHtml(fixture)` contains `og:title`, `og:image` (absolute, from `ogImageFor`), `og:type`, `twitter:card`, `<link rel="canonical">` (absolute), and a `<script type="application/ld+json">` block whose parsed JSON is `CreativeWork` with `license`, `creditText`, a `datePublished`, and `image`/`hasPart` ImageObject carrying numeric `width`/`height` — and assert **no `author` key**. Assert `libraryPageHtml` emits `CollectionPage` with `hasPart`.
- [ ] **Step 2: Run, confirm FAIL.** `pnpm --filter @render/core test static-pages`
- [ ] **Step 3: Implement** — extend `pageShell()` to accept a `meta` arg (title, description, absolute ogImage, absolute canonical, jsonLd object) and render the head tags; populate from library/exhibit builders mapping the fields above. Thread the publish timestamp in for `datePublished`. Add `sitemapXml()` alongside `sitemapTxt()` (lastmod from same timestamp); wire it in `site.ts`.
- [ ] **Step 4: Run, confirm PASS.**
- [ ] **Step 5: Commit** — `feat(publish): og-tags + JSON-LD + sitemap.xml on published pages (Q-8)`

---

### Task 3: Search index builder — annotation tree → minisearch docs

**Orient:** Produce a client-side search index from the same notes the reader sees, so Task 4 can wire a search box with no server (Q-3).
**Flow position:** Step 1 of 2 in the search flow (**search-index.ts** → Reader.svelte search UI). Produces the index contract Task 4 consumes.
**Skill:** `test-driven-development`
**Files:**
- Create: `apps/viewer/src/lib/search-index.ts`
- Modify: `apps/viewer/package.json` (add `minisearch`)
- Test: `apps/viewer/src/lib/search-index.test.ts`

<contracts>
**Downstream (search-index → Reader.svelte):**
- `buildSearchIndex(annotations: Annotation[]): MiniSearch<SearchDoc>`
- `type SearchDoc = { id: string; body: string; tags: string[]; logicalId: string }`
- Behavioral invariant: one doc per annotation; `body` = plain-text of note (markdown stripped); `tags` from `tagsOfAnnotation()`; `id` stable across rebuilds.
</contracts>

- [ ] **Step 1: Failing test** — `buildSearchIndex([noteWithBody, noteWithTag])` returns a MiniSearch where `.search("term-in-body")` and `.search("#tag")` each return the right doc id.
- [ ] **Step 2: Run, confirm FAIL.** `pnpm --filter viewer exec vitest search-index`
- [ ] **Step 3: Implement** — `pnpm --filter viewer add minisearch`; build `SearchDoc[]` from annotations using `tagsOfAnnotation` from `@render/core` and a markdown-strip on body; configure MiniSearch fields (`body`, `tags`), `storeFields: ['id','logicalId','tags']`, prefix + fuzzy.
- [ ] **Step 4: Run, confirm PASS.**
- [ ] **Step 5: Commit** — `feat(viewer): client-side minisearch index builder (Q-3)`

---

### Task 4: Mode-independent finder overlay `[CHANGE SITE]`

**Orient:** Give the reader one discovery surface — search text + tag facets — that works in *both* grid and narrative exhibits, because narrative mode has no note list to filter (Q-4).
**Flow position:** Step 2 of 2 in the search flow (search-index.ts → **SearchOverlay.svelte** mounted in `ExhibitView`). Depends on Task 3. Touches `ExhibitView`/`Reader`/`NarrativeReader` — shares those last two with Task 5, so land Task 4 first, Task 5 rebases.
**Skill:** `frontend-design`
**Files:**
- Create: `apps/viewer/src/components/SearchOverlay.svelte`
- Modify: `apps/viewer/src/components/ExhibitView.svelte` (mount overlay; trigger affordance in chrome; `Cmd/Ctrl-K`; result-select → set `noteId` and run the existing arrival path `:64–89`, which sets `activeReading` `:76`)
- Modify: `apps/viewer/src/components/Reader.svelte` (`#{t}` chips `:185/:205` → clickable), `apps/viewer/src/components/NarrativeReader.svelte` (tag chips → clickable)
- Test: `apps/viewer/src/components/SearchOverlay.test.ts`

<contracts>
**Upstream (search-index → overlay):** `buildSearchIndex(annotations)` (Task 3 contract).
**Downstream (overlay → ExhibitView):** emits `select(noteId: string)` — ExhibitView feeds it to the arrival path (same entry point as a deep-link). Overlay does NOT mutate the canvas or reading directly (Q-4: pure finder).
</contracts>

**Locked behavior (Q-4):** overlay scope = **all readings** (a result in an inactive reading is findable; selecting it switches `activeReading` via arrival). Tags **OR** each other (additive), text query **ANDs** the union. Tag chips anywhere → open overlay pre-scoped to that tag. Pure finder: **canvas only changes on select**; **no URL state** (transient). Trigger lives in `ExhibitView` chrome (not duplicated per shell).

- [ ] **Step 1: Failing test** — overlay over a 3-note corpus (one note in a non-active reading, two tags): text query narrows; two tags show the union; query+tags compose (AND of query over OR of tags); selecting a result emits `select(noteId)`; a result in an inactive reading still appears. Assert the overlay does **not** mutate canvas/reading state itself.
- [ ] **Step 2: Run, confirm FAIL.** `pnpm --filter viewer exec vitest SearchOverlay`
- [ ] **Step 3: Implement** — `SearchOverlay.svelte` consumes `buildSearchIndex`; renders text box + tag facets + result list with empty-state; computes results (tags OR, query AND). Mount in `ExhibitView` with a visible trigger + `Cmd/Ctrl-K`; on `select`, route through the existing arrival handler. Wire clickable tag chips in `Reader`/`NarrativeReader` to open the overlay with that facet active.
- [ ] **Step 4: Run, confirm PASS.**
- [ ] **Step 5: Commit** — `feat(viewer): mode-independent finder overlay — search + tag facets (Q-3, Q-4, axis 11)`

---

### Task 5: A11y / keyboard-nav pass `[CHANGE SITE]`

**Orient:** Make notes and regions reachable and operable by keyboard and screen reader so institutional buyers aren't gated out (axis 12).
**Flow position:** Independent reader-quality node; touches `Reader`/`NarrativeReader` (rebase after Task 4), plus ReadingLegend, NoteLightbox, SearchOverlay, atmosphere.css.
**Skill:** `frontend-design`
**Codebooks:** `focus-management-across-boundaries`

**Locked model (Q-5):** the **index is the keyboard surface**, not the canvas markers. Note cards (grid) / section spine (narrative) are focusable and Enter-activates the existing `initialSelected`→`fitBounds` wiring, so the canvas *follows* focus. Markers are SVG DOM (`.a9s-annotation`, confirmed at `Reader.svelte:246`) — give them `role`/`aria-label` for SR but `tabindex=-1` (out of Tab order; no off-screen-marker tab traps). The SearchOverlay (Task 4) is a dialog and gets standard dialog a11y.

**Files:**
- Modify: `apps/viewer/src/components/Reader.svelte` (note cards focusable + activate; markers labeled, `tabindex=-1`), `apps/viewer/src/components/NarrativeReader.svelte` (section spine focusable), `apps/viewer/src/components/ReadingLegend.svelte` (radiogroup L27–35), `apps/viewer/src/components/NoteLightbox.svelte` (focus trap), `apps/viewer/src/components/SearchOverlay.svelte` (dialog a11y), `apps/viewer/src/atmosphere.css` (focus styles L38)
- Test: lightpanda keyboard-walk assertion (`reliable-test-loop`)

- [ ] **Step 1: Characterize current a11y** (`characterization-testing`) — record what exists today (ESC close L146, video `tabindex=-1`, legend radiogroup) so the pass deepens, not regresses.
- [ ] **Step 2: Failing assertion** — Tab moves through note cards / section beats (the index), Enter selects → canvas `fitBounds` follows; markers are **not** tab stops but expose `role`/`aria-label`; NoteLightbox AND SearchOverlay trap focus, close on `ESC`, and return focus to their trigger; `:focus-visible` ring visible.
- [ ] **Step 3: Implement** — make index entries focusable + keyboard-activatable (reuse `fitBounds` path); label markers + `tabindex=-1`; focus trap + return-focus in NoteLightbox and SearchOverlay; `:focus-visible` overrides in atmosphere.css; verify ReadingLegend `aria-checked` stays correct.
- [ ] **Step 4: Run keyboard-walk, confirm PASS.**
- [ ] **Step 5: Commit** — `feat(viewer): keyboard nav (index-driven) + dialog a11y + ARIA (Q-5, axis 12)`

---

### Task 6: GO / NO-GO Gate — tiling decision `[GATE]`

**Orient:** Decide, from the Task 1 memo, whether the **web OffscreenCanvas generator** is worth building — NOT whether tiling exists (Q-10: desktop-Rust and external-IIIF fill the same `tileSource` descriptor regardless). The gate prevents committing to a zero-prior-art web build that blows the bundle budget (Q-9).
**Flow position:** Gate between spike (Task 1) and build (Task 7). **Human decision**, not code.
**Skill:** `none`

- [ ] **Step 1:** Read `docs/spikes/2026-06-tiling-feasibility.md`. Apply Q-9 GO criteria: slicer produces OSD-readable DZI in-browser AND bundle delta within the memo's stated cap.
- [ ] **Step 2:** Record verdict (GO → proceed to Task 7; NO-GO → close Wave 4, park tiling at v1.2, leave `bake.ts` single-JPEG path unchanged). Append the verdict to the spike doc.

Run: `grep -E "VERDICT: (GO|NO-GO)" docs/spikes/2026-06-tiling-feasibility.md`
Expected: one explicit verdict line.

---

### Task 7: In-browser DZI tiling — slicer + wire `[CHANGE SITE]` *(Wave 4, GO only)*

**Orient:** Ship the "drop a 100 MB image, no server, get deep-zoom" moat feature (BLOCKER 4 / axis 17). **Only if Task 6 = GO.**
**Flow position:** Build node downstream of the gate. May itself warrant a dedicated sub-plan if the spike surfaces large scope.
**Skill:** `test-driven-development`
**Data model (Q-8):** `AObject` gains an **additive optional** `tileSource?: TileSourceDescriptor` (the model change can land independently of the generator — existing exhibits have no `tileSource`, so zero migration; viewer branches on presence). Define `TileSourceDescriptor` in `model.ts` first; the slicer and the viewer both target it.

**Files:**
- Create: `packages/render-core/src/geometry/dzi-slicer.ts` (validated shape from Task 1 prototype)
- Modify: `packages/render-core/src/model/model.ts` (add `tileSource?: TileSourceDescriptor` to `AObject` + the type), `apps/studio/src/bake.ts` (`bakeDisplayMaster` L33 — add tiled-master branch), viewer mount (branch on `tileSource` → OSD tiled mode)
- Test: `packages/render-core/src/geometry/dzi-slicer.test.ts`

- [ ] **Step 0 (model, can precede GO):** add optional `tileSource?: TileSourceDescriptor` to `AObject`; existing fixtures unchanged (assert no migration needed).
- [ ] **Step 1:** Promote the spike prototype into a tested module: `generateDzi(bitmap, opts): { descriptor, tiles }`; assert tile count + descriptor match expected for a known image size (headless dimension math via `downscale.ts`).
- [ ] **Step 2–4:** TDD the slicer; wire `bake.ts` to emit a `tileSource` for oversized imports; viewer reads it; publish tiles alongside the master.
- [ ] **Step 5:** Commit + verify against the 240 KB bundle cap from Task 1.

---

## Execution Waves

- **Wave 1: Tasks [1, 2, 3] (parallel)** — Task 1 `[SPIKE]` (independent), Task 2 SEO (render-core only), Task 3 search-index (new file). No shared files.
- **Wave 2: Task [4] then Task [5] (serial — shared `Reader.svelte` + `NarrativeReader.svelte` + `SearchOverlay.svelte`)** — depends on Wave 1 (Task 4 needs Task 3's index contract). Task 4 creates the overlay and makes index entries interactive; Task 5 rebases on Task 4 to add focus/ARIA to the same components (per edit-safety: no two unsynced writers on one file).
- **Wave 3: Task [6] `[GATE]`** — depends on Task 1 memo. Human go/no-go.
- **Wave 4: Task [7] (GO only)** — depends on Wave 3 = GO. Large; may spawn a sub-plan.

Phase A (Waves 1–2) is shippable on its own — it lands reach + reader value independent of the tiling outcome. The gate ensures Phase B never silently consumes effort.

---

## Open Questions

> Resolved by the 2026-06-20 grilling pass (see Shape Changes): og:image is absolute via `archie.config.json` canonical origin; JSON-LD = exhibit `CreativeWork` / library `CollectionPage` (Q-7/Q-8); filtered regions never dim — overlay is a pure finder (Q-4); Annotorious markers are SVG DOM, so a11y labeling is feasible (Q-5).

### Wave 1
- **Task 1 (Blocking for Wave 4 only):**
  - Q: Does OffscreenCanvas tile-encode stay within memory limits for a ≥8000 px image on a typical laptop? (the spike's core unknown)
  - Q: What is the *actual* current bundle vs the 240 KB budget? (axis 16 says unmeasured — Step 1 answers it)
- **Task 3 (Exploratory):**
  - Q: Is markdown-strip already available in render-core (snarkdown is render-only), or does the builder need a plain-text extractor? (assumed need a light strip util)

### Wave 2
- **Task 4 (Exploratory):**
  - Q: Build the minisearch index once at `ExhibitView` mount, or lazily on first overlay-open? (assumed once at mount from the full annotation tree; revisit only if mount cost shows on large exhibits)
  - Q (Blocking — verify at Gate 1): Is the deep-link arrival handler (`ExhibitView:64–89`) callable imperatively from a `select(noteId)`, or only on hash-change? Task 4's "overlay feeds the arrival path" depends on it being extractable.

---

<!-- PLAN_MANIFEST_START -->
| File | Action | Marker |
|------|--------|--------|
| `docs/spikes/2026-06-tiling-feasibility.md` | create | `VERDICT:` |
| `packages/render-core/src/publish/static-pages.ts` | patch | `application/ld+json` |
| `packages/render-core/src/publish/site.ts` | patch | `sitemapXml` |
| `apps/viewer/src/lib/search-index.ts` | create | `buildSearchIndex` |
| `apps/viewer/package.json` | patch | `minisearch` |
| `apps/viewer/src/components/SearchOverlay.svelte` | create | `role="dialog"` |
| `apps/viewer/src/components/ExhibitView.svelte` | patch | `SearchOverlay` |
| `apps/viewer/src/components/Reader.svelte` | patch | `tabindex` |
| `apps/viewer/src/components/NoteLightbox.svelte` | patch | `aria-modal` |
| `apps/viewer/src/atmosphere.css` | patch | `:focus-visible` |
<!-- PLAN_MANIFEST_END -->

## Q-Reference Summary

| Decision ID | Title (short) | Applied in |
|-------------|---------------|------------|
| Q-8 (archie) | Published pages emit og/JSON-LD/sitemap.xml | Task 2 (Wave 1) |
| Q-2 (archie) | Published artifact self-describing (mx-29f1df, ADR-0014) | Task 2 (Wave 1) — extended |
| Q-3 (archie-ux) | Within-exhibit search = client-side minisearch | Task 3, Task 4 (Waves 1–2) |
| Q-4 (archie-ux) | Discovery = mode-independent finder overlay, not list filter | Task 4 (Wave 2) |
| Q-5 (archie-ux) | Keyboard surface = linear index, markers SR-labeled out of tab order | Task 5 (Wave 2) |
| Q-7 (archie) | JSON-LD shape (honest CreativeWork mapping)¹ | Task 2 (Wave 1) |
| Q-9 (archie) | Tiling gated on bundle + DZI feasibility spike | Task 1, Task 6, Task 7 (Waves 1, 3, 4) |
| Q-10 (archie) | Tiling gate = web-generation only (additive `tileSource`) | Task 6, Task 7 (Waves 3, 4) |

¹ The JSON-LD field mapping was minted under the SEO decision lineage; honesty constraint (omit author, stamp publish-time) recorded in the grilling pass.

## Assumptions to verify at Gate 1

1. ~~`ogImageFor()` returns an absolute origin~~ — **resolved**: returns absolute via `archie.config.json` `canonicalOrigin` (`og-image.ts:7`).
2. `tagsOfAnnotation()` is importable into the viewer app from `@render/core`.
3. ~~Annotorious markers have addressable DOM~~ — **resolved**: SVG DOM (`.a9s-annotation`, `Reader.svelte:246`). Task 5 labels them directly.
4. `minisearch` adds < ~10 KB gzipped to the viewer island (consistent with axis 16 budget pressure).
5. **(new, blocking Task 4)** The deep-link arrival handler (`ExhibitView:64–89`) is callable imperatively from `select(noteId)`, not only on hash-change.

## shape-changes

<!-- SHAPE_CHANGES_START -->
| Date | Role | Finding | Summary |
|------|------|---------|---------|
| 2026-06-20 | author | grill-2026-06-20 | Grilling pass reshaped Tasks 2/4/5/6/7: search→mode-independent finder overlay (Q-4), keyboard surface=index not markers (Q-5), JSON-LD honest CreativeWork+publish-date (Q-7/Q-8), tiling gate=web-only + additive tileSource (Q-8/Q-10). Resolved 4 open questions. |
<!-- SHAPE_CHANGES_END -->
