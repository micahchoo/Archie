# Viewer preview + self-contained export — Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An author can see their library exactly as a reader will, without publishing — and can export
a folder that opens in any browser with no server and no hosted Archie.

**Architecture:** Both features are the same move made twice. Studio already builds the whole published
tree in memory (`publish-flows.svelte.ts:272` `buildZipFs` → a `ZipFilesystem`), and
`packages/archie-viewer` is a runtime-generic reader that opens any such tree. Preview hands that
in-memory tree straight to `<archie-viewer>` in-process (no serialize, no URL, no server). Export is
the same tree written to disk beside a **single-file** build of the same element. The Astro app
(`apps/viewer`) is not a vehicle for either: its routes are baked from `public/published/exhibits.json`
at build time (`src/pages/[slug].astro:13`), so it cannot travel with an arbitrary library.

**Tech stack:** TypeScript 5.9 (`svelte-check`) + `typescript-native` 7 (`typecheck`), Svelte 5 runes,
esbuild (`packages/archie-viewer/build.mjs`), vitest per-app, Playwright e2e (port 5198).

**Upstream artifact:** `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` §2, §3.

---

## Flow Map

Two flows sharing nodes 1–2.

**Flow A — Preview (no disk):**
`buildZipFs (studio)` → **`previewTree` (studio)** → **`openLibraryFs` (embed element)** →
`createReadOnlyMount` (existing) → author sees the reader

**Flow B — Self-contained export (disk):**
`buildZipFs (studio)` → **`buildSingleFileHtml` (studio)** ← **`--single-file` bundle (build.mjs)**
→ folder sink (`writeToFolder`, existing) → `index.html` opens from `file://`

**Flow C — Open in viewer (post-publish, independent):**
successful deploy → **`viewerDeepLink` (studio)** → hosted viewer at `archie.config.json` origin

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/archie-viewer/src/element.ts` (modify) | Gains ONE public method: open an already-built `Filesystem` in-process. No other surface change. |
| `packages/archie-viewer/build.mjs` (modify) | Gains a second target: IIFE, no splitting, single file — for `file://`. Keeps the existing ESM target and its `eagerGzKB` ratchet untouched. |
| `apps/studio/src/viewer-preview.ts` (create) | Pure: build the preview tree (reuse `buildZipFs`) + the marker check. No DOM. |
| `apps/studio/src/ViewerPreview.svelte` (create) | The panel. Lazy-imports the element, calls the new method, owns open/close + focus. |
| `apps/studio/src/single-file-export.ts` (create) | Pure: given bundle text + library bytes, produce the `index.html` string. Fully headless-testable. |
| `apps/studio/src/viewer-link.ts` (create) | Pure: mint `{origin}{viewerPath}#/<slug>…` from `archie.config.json` + the route grammar. |
| `apps/studio/src/publish-flows.svelte.ts` (modify) | Exposes `previewTree()` and `exportSelfContained()` beside the existing sinks. |
| `apps/studio/src/Publish.svelte` (modify) | Two buttons + the panel mount point. |

---

## Task 1: Preview — embed opens an in-process Filesystem [CHANGE SITE]

**Orient:** Studio must show the author the real reader without writing a file or minting a URL; the
element can already read a tree, it just has no public door for one it didn't fetch itself.
**Flow position:** Step 3 of 4 in Flow A (`previewTree` → **`openLibraryFs`** → `createReadOnlyMount`)
**Skill:** `tdd`
**Files:**
- Modify: `packages/archie-viewer/src/element.ts` (beside `openFile`, `:225`)
- Test: `packages/archie-viewer/src/element.test.ts`

<contracts>
**Upstream (studio → this node):**
- `openLibraryFs(fs: Filesystem): Promise<void>`
- Behavioral invariant: `fs` is a fully-built published tree (has `archie.json`, `exhibits.json`).
  It is NOT assumed trusted — the marker is validated here, so a malformed tree surfaces
  `NotAnArchieLibraryError` rather than a blank gallery.

**Downstream (this node → render):**
- Reuses the existing `LoadedLibrary` view state — same `#load` → gallery → reader path as `src=`.
- Behavioral invariant: no new eager import. `reader.ts` stays behind `await import()`.
</contracts>

- [ ] **Step 1: Write the failing test** in `element.test.ts` — build a `MemoryFilesystem` holding a
  minimal valid tree (`archie.json` + `exhibits.json`), call `el.openLibraryFs(fs)`, assert the gallery
  renders cards. Add a second test: a tree with `archie.json` removed/foreign asserts the element shows
  the error view, not an empty gallery.
- [ ] **Step 2: Run to verify it fails.**
  Run: `cd packages/archie-viewer && pnpm exec vitest run element` — Expected: FAIL, `openLibraryFs is not a function`.
- [ ] **Step 3: Implement.** Add to `element.ts` beside `openFile`:
  ```ts
  /** Open an ALREADY-BUILT published tree in-process (Studio preview). The marker is still validated —
   *  a first-party caller is not a reason to skip the ADR-0020 check, and preview catching a malformed
   *  publish is the point. Never mints a URL: `connect-src` forbids blob: on desktop (tauri-csp rule). */
  async openLibraryFs(fs: Filesystem): Promise<void> { … validateArchieMarker(fs); openFilesystem(fs) … }
  ```
  Route it through the same state transitions `openFile` uses (`load.ts:82` `openFilesystem`).
- [ ] **Step 4: Run tests.** Run: `cd packages/archie-viewer && pnpm exec vitest run` — Expected: PASS, no prior test regressed.
- [ ] **Step 5: Prove the eager closure did not grow.**
  Run: `cd packages/archie-viewer && node build.mjs --check` — Expected: exit 0, `eagerGzKB` within budget
  (`bundle-size.json` baseline 32.9). A rise here means a static edge to `reader.ts` leaked in — see
  `.claude/rules/archie-viewer-eager-closure.md`.
- [ ] **Step 6: Commit** — `feat(viewer): open an in-process Filesystem (Studio preview door)`

---

## Task 2: Preview — Studio builds the tree without saving it

**Orient:** Preview must reuse the exact bytes publish produces, or it stops being a preview.
**Flow position:** Step 2 of 4 in Flow A (`buildZipFs` → **`previewTree`** → `openLibraryFs`)
**Skill:** `tdd`
**Files:**
- Create: `apps/studio/src/viewer-preview.ts`
- Create: `apps/studio/src/viewer-preview.test.ts`
- Modify: `apps/studio/src/publish-flows.svelte.ts` (return block, `:325-345`)

<contracts>
**Upstream:** `buildZipFs(slugs?): Promise<{ fs: ZipFilesystem } & PublishResult>` — `publish-flows.svelte.ts:272`.
**Downstream:** `previewTree(slugs?): Promise<{ fs: Filesystem } & PublishResult>` — the SAME warnings
(`brokenLinks`, `incompleteCanvases`, `missingAssets`) the download path surfaces, so preview can show them.
**Behavioral invariant:** `fs.toZip()` is NEVER called on this path. `publish-flows.svelte.ts:72` records
that materializing the zip builds a second full copy (peak ≈2×) and OOMs a tab on large libraries; the
whole point of handing over the `Filesystem` is to skip that.
</contracts>

- [ ] **Step 1: Write the failing test** — over a `MemoryFilesystem`-backed stub, assert `previewTree`
  returns a tree containing `archie.json` and `exhibits.json`, and assert (with a spy) that `toZip` was
  never called.
- [ ] **Step 2: Run to verify it fails.** Run: `cd apps/studio && pnpm exec vitest run viewer-preview` — Expected: FAIL.
- [ ] **Step 3: Implement** `previewTree` in `viewer-preview.ts` (pure over injected deps), then expose it
  from `createPublishFlows`'s return block beside `writeToFolder` / `downloadProjectZip`.
- [ ] **Step 4: Run tests + typecheck.**
  Run: `cd apps/studio && pnpm exec vitest run && pnpm typecheck` — Expected: PASS, tsc 0 errors.
  (`pnpm typecheck` is the real gate for `.ts` here — `.claude/rules/studio-ts-typecheck-gate.md`.)
- [ ] **Step 5: Commit** — `feat(studio): previewTree — the published tree without serializing it`

---

## Task 3: Export — a single-file build target [parallel with Task 2]

**Orient:** A double-clickable export needs one file the browser will actually execute from `file://`;
the shipped bundle is split ESM, which browsers refuse from an opaque origin.
**Flow position:** Side input to Flow B (**`--single-file` bundle** → `buildSingleFileHtml`)
**Skill:** `none` (build script, no test framework)
**Files:**
- Modify: `packages/archie-viewer/build.mjs:45-61` (the `build()` fn) + the measure/report block
- Modify: `packages/archie-viewer/package.json` (a `build:single` script)
- Modify: `packages/archie-viewer/bundle-size.json` (a new measured field)

<contracts>
**Downstream:** a single UTF-8 JS string — `format: "iife"`, `splitting: false`, `bundle: true`,
`minify: true`, one output file, no `import()` of a sibling chunk.
**Behavioral invariant:** the EXISTING ESM target is untouched. `eagerGzKB` continues to measure the CDN
entry's static closure; the single-file target gets its own number (`singleFileGzKB`) and never relaxes
the existing one. `.claude/rules/archie-viewer-eager-closure.md` exists because that ratchet was the only
thing that caught a 225 KB leak — do not fold the two budgets together.
</contracts>

- [ ] **Step 1: Add the target.** Parameterize `build(outdir)` with a mode; the single-file mode sets
  `format: "iife"`, `splitting: false`, `outfile` instead of `outdir`. Code-splitting saves nothing
  offline (a reader-less export is pointless), so dropping it costs nothing here.
- [ ] **Step 2: Measure it.** Extend the report with `singleFileRawKB` / `singleFileGzKB` written into
  `bundle-size.json`. Run: `node build.mjs --check` — Expected: exit 0; the pre-existing
  `entryGzKB` / `eagerGzKB` / `totalGzKB` values are unchanged (the ESM target did not move).
- [ ] **Step 3: Prove it runs from `file://`.** Write the bundle plus a two-line HTML harness to a temp
  dir and open it with the repo's Playwright-from-`/tmp` recipe (`project_archie_browser_drive_recipe`).
  Run: `node scripts/perf/…` is NOT the tool here — drive it in a real browser.
  Expected: `customElements.get("archie-viewer")` is defined, zero console errors about module scripts.
  **This step is the whole justification for the task — if it fails, stop and report; do not proceed to Task 5.**
- [ ] **Step 4: Commit** — `build(viewer): single-file IIFE target for offline export`

---

## Task 4: Preview — the panel

**Orient:** The author needs a door to the preview inside the publish surface they already use.
**Flow position:** Step 1 and 4 of Flow A (author → **panel** → `previewTree` → `openLibraryFs`)
**Skill:** `frontend-design`
**Codebooks:** `focus-management-across-boundaries` (the element renders into an OPEN shadow root; a
dialog trapping focus across that boundary is the non-obvious part)
**Files:**
- Create: `apps/studio/src/ViewerPreview.svelte`
- Modify: `apps/studio/src/Publish.svelte` (a "Preview as reader" button + mount point)
- Modify: `apps/studio/package.json` (add `"@render/archie-viewer": "workspace:*"`)

- [ ] **Step 1: Add the workspace dep and install.**
  Run: `pnpm install` — Expected: `@render/archie-viewer` symlinked into `apps/studio/node_modules`.
  (Studio is plain Vite and crawls its entry, so it needs NO `optimizeDeps.include` —
  `.claude/rules/viewer-optimizedeps-bare-includes.md` is scoped to `apps/viewer`. Do not copy that list here.)
- [ ] **Step 2: Build the panel.** `ViewerPreview.svelte` **lazy**-imports the element
  (`await import("@render/archie-viewer")` inside `onMount`), calls `previewTree()`, then
  `el.openLibraryFs(fs)`. Set the `offline` attribute by default so preview never silently reaches the
  network for a remote tile the exported copy won't have.
- [ ] **Step 3: Verify the startup bundle did not regress.**
  Run: `cd apps/studio && pnpm build` then compare the entry chunk size against the pre-change build.
  Expected: no increase beyond noise — a static import of the element would pull the reader graph in.
- [ ] **Step 4: Gates.**
  Run: `cd apps/studio && pnpm exec vitest run && pnpm typecheck && pnpm --filter @archie/studio run check`
  Expected: vitest PASS, tsc 0, svelte-check **0 errors / 0 warnings** (the standing baseline).
- [ ] **Step 5: Drive it.** Per `.claude/rules/svelte-no-typecheck-net.md`, a prop can be typed and not
  bound and nothing static complains. Use the `run-app` skill; open Studio, click "Preview as reader",
  assert `.openseadragon-canvas` appears inside the element's shadow root.
  Expected: the reader renders the current library. **Do not claim this task done on green gates alone.**
- [ ] **Step 6: Commit** — `feat(studio): preview the library as a reader sees it`

---

## Task 5: Export — write the self-contained folder

**Orient:** The author should be able to hand someone a folder that opens with no server and no Archie.
**Flow position:** Step 2–3 of Flow B (`buildZipFs` → **`buildSingleFileHtml`** → folder sink)
**Skill:** `tdd`
**Files:**
- Create: `apps/studio/src/single-file-export.ts`
- Create: `apps/studio/src/single-file-export.test.ts`
- Modify: `apps/studio/src/publish-flows.svelte.ts` (an `exportSelfContained(fs)` sink)
- Modify: `apps/studio/src/Publish.svelte` (the export option)

<contracts>
**Upstream:** the single-file bundle text (Task 3) + the published tree (Task 2).
**Downstream:** one `index.html` string: the bundle in one inline `<script>`, the library inlined as a
base64 data payload, and a boot script that decodes it and calls `openLibraryFs`.
**Behavioral invariant:** NOTHING is fetched at runtime. A `fetch()` of a sibling `.archie.zip` fails
from `file://` (opaque origin) — that failure is the reason the payload is inlined, not a nicety.
</contracts>

- [ ] **Step 1: Write the failing test** — `buildSingleFileHtml({ bundle, libraryBytes })` returns HTML
  containing the bundle text, containing no `fetch(` of a relative path, and carrying the payload inline.
- [ ] **Step 2: Run to verify it fails.** Run: `cd apps/studio && pnpm exec vitest run single-file-export` — Expected: FAIL.
- [ ] **Step 3: Implement** the builder (pure string work), then wire `exportSelfContained` into
  `publish-flows` using the EXISTING folder sink (`writeToFolder`'s `Filesystem`, so FSA and Tauri both
  work with no new capability) — do not add a second folder-picking path (`folder-backend.ts` owns that).
- [ ] **Step 4: Guard the size.** Reuse `zipSizeOk` before building: base64 inflates the payload ~33%, so
  a library that already warns on zip export must warn harder here. Expected: the existing warning copy
  fires at the existing threshold, adjusted for the inflation.
- [ ] **Step 5: Gates + a real open.**
  Run: `cd apps/studio && pnpm exec vitest run && pnpm typecheck && pnpm --filter @archie/studio run check`
  Then export a real library and open the resulting `index.html` from `file://` in a real browser.
  Expected: gallery renders, an object opens in the reader, zero network requests.
- [ ] **Step 6: Commit** — `feat(studio): export a self-contained viewer + library`

---

## Task 6: Open in viewer — the post-publish deep link

**Orient:** After a successful deploy the author should be able to see the live thing in one click.
**Flow position:** Flow C, standalone (deploy result → **`viewerDeepLink`** → hosted viewer)
**Skill:** `tdd`
**Files:**
- Create: `apps/studio/src/viewer-link.ts` + `viewer-link.test.ts`
- Modify: `apps/studio/src/Publish.svelte` (the done state)

<contracts>
**Upstream:** `archie.config.json` (`canonicalOrigin`, `viewerPath`) + a slug, optional object/note id.
**Downstream:** an absolute URL matching the grammar `packages/render-core/src/url/route.ts:35-54`
already parses: `#/<slug>`, `#/<slug>/o/<objectId>`, `#/<slug>/a/<noteId>`, plus `?src=<zip-url>`.
**Behavioral invariant:** this button appears ONLY after a successful publish/deploy. Without a reachable
URL there is nothing to open — the local answer is Task 4's preview, not a broken link.
</contracts>

- [ ] **Step 1: Write the failing test** — assert the minted URL for a slug, for a slug+objectId, and
  that a `src` is percent-encoded such that `parseRoute` round-trips it.
- [ ] **Step 2: Run to verify it fails.** Run: `cd apps/studio && pnpm exec vitest run viewer-link` — Expected: FAIL.
- [ ] **Step 3: Implement** and wire into the publish done state.
- [ ] **Step 4: Gates.** Run: `cd apps/studio && pnpm exec vitest run && pnpm typecheck && pnpm --filter @archie/studio run check` — Expected: all green.
- [ ] **Step 5: Commit** — `feat(studio): open the published exhibit in the viewer`

---

## Task 7: End-to-end gate

**Orient:** Three new user-facing doors exist; none is proven by unit tests.
**Flow position:** Terminal gate over Flows A, B, C.
**Skill:** `shadow-walk`
**Files:**
- Modify: `apps/studio/e2e/` (one spec covering preview open/close)

- [ ] **Step 1: e2e for the preview panel.**
  Run: `cd apps/studio && pnpm exec playwright test --config e2e/playwright.config.ts` (port 5198)
  Expected: PASS. Never hardcode a seeded object id — ids are ULIDs.
- [ ] **Step 2: Full sweep.**
  Run, per package: `pnpm exec vitest run`; `pnpm typecheck`; `pnpm --filter @archie/studio run check`;
  `cd packages/archie-viewer && node build.mjs --check`.
  Expected: studio/render-core/viewer suites at or above their HEAD counts; svelte-check 0/0;
  `eagerGzKB` unchanged.
- [ ] **Step 3: Commit** — `test: e2e for preview, export, and the viewer link`

---

## Execution Waves

- **Wave 0:** Task 1 (contract every other task consumes) — serial.
- **Wave 1:** Tasks 2, 3 (parallel — different packages, no shared file) — depends on Wave 0.
- **Wave 2:** Tasks 4, 5 (parallel-ish; both touch `Publish.svelte`, so **serialize the `Publish.svelte`
  edit** — take Task 4 first) — depends on Wave 1.
- **Wave 3:** Task 6 (independent of 4/5 except the shared `Publish.svelte`) — then Task 7.

---

## Open Questions

### Blocking

- **Task 3** — Q: does esbuild's IIFE target handle `reader.ts`'s `await import()` by inlining it, or
  does it emit a runtime `import()` that still fails from `file://`? (Assumed: with `splitting: false`
  and a single `outfile` it inlines. **Step 3 of Task 3 is the check** — if it emits a live `import()`,
  the dynamic import must be flattened for this target.)
- **Task 5** — Q: what is the practical upper size for a base64-inlined library before the browser
  chokes parsing one HTML file? (Unknown. Measure with the Voynich seed; if it's low, the fallback is
  a sibling `.archie.zip` plus the element's existing drop zone — one extra user action, no `file://`
  fetch.)

### Exploratory

- **Task 1** — Q: does the element need to `revoke()` a previously-opened library when
  `openLibraryFs` is called twice? (`LoadedLibrary.revoke` is a no-op on the filesystem path —
  `load.ts:84` — so probably not, but check the blob-URL path in `portable.ts`.)
- **Task 4** — Q: does the shadow-root boundary interfere with Studio's existing focus trap? (Codebook
  annotation exists for exactly this; verify in Step 5's drive, not by reasoning.)
- **Task 6** — Q: should the link carry `?src=` at all, or rely on the deploy target already being the
  canonical viewer's published tree? (Depends on whether the user deployed to Pages or elsewhere.)

---

## Assumptions (verify at each gate)

1. `buildZipFs` returns a tree that `validateArchieMarker` accepts unchanged — i.e. `site.ts` writes
   `archie.json` into the same tree. (High confidence; `site.ts` writes it as the LAST file / commit point.)
2. `apps/studio` needs no `optimizeDeps.include` entry for the new workspace dep (plain Vite crawls its
   entry). If the dev server 504s on `@render/archie-viewer`, this assumption is wrong and the
   `viewer-optimizedeps-bare-includes` rule's remedy applies.
3. ~~The single-file bundle is ≤ ~700 KB raw.~~ **INVALIDATED, measured 2026-07-26: 897.7 KB raw /
   263.9 KB gz.** Accepted, not acted on — it is a local file, gz-equivalent to the existing
   `totalGzKB` (261.8), and the reader is always needed offline so deferring it would only add a
   fetch `file://` refuses. The number is now ratcheted as `singleFileGzKB`.
4. `zipSizeOk`'s existing threshold is the right basis for the export warning (adjusted for base64).

---

<!-- PLAN_MANIFEST_START -->
| File | Action | Marker |
|------|--------|--------|
| `packages/archie-viewer/src/element.ts` | patch | `openLibraryFs` |
| `packages/archie-viewer/src/element.test.ts` | patch | `openLibraryFs` |
| `packages/archie-viewer/build.mjs` | patch | `buildSingleFile` |
| `packages/archie-viewer/bundle-size.json` | patch | `singleFileGzKB` |
| `packages/archie-viewer/dist-single/archie-viewer.single.js` | create | `archie-viewer` |
| `apps/studio/src/viewer-preview.ts` | create | `previewTree` |
| `apps/studio/src/viewer-preview.test.ts` | create | `previewTree` |
| `apps/studio/src/ViewerPreview.svelte` | create | `openLibraryFs` |
| `apps/studio/src/single-file-export.ts` | create | `buildSingleFileHtml` |
| `apps/studio/src/single-file-export.test.ts` | create | `buildSingleFileHtml` |
| `apps/studio/src/viewer-link.ts` | create | `viewerDeepLink` |
| `apps/studio/src/viewer-link.test.ts` | create | `viewerDeepLink` |
| `apps/studio/src/publish-flows.svelte.ts` | patch | `exportSelfContained` |
| `apps/studio/src/Publish.svelte` | patch | `ViewerPreview` |
| `apps/studio/package.json` | wire | `@render/archie-viewer` |
<!-- PLAN_MANIFEST_END -->

---

## Q-Reference Summary

| Decision ID | Title (short) | Applied in |
|-------------|---------------|------------|
| archie-linkability Q-3 | Self-contained export ships `<archie-viewer>`, not the Astro viewer app | Task 3, Task 5 (Waves 1–2) |
| archie-ux Q-6 | Preview hands bytes in-process; the hosted deep-link is the post-publish button | Task 1, Task 2, Task 4, Task 6 |
| archie Q-2 | 3-layer headless core + thin adapters | Task 2, Task 5 (pure modules, no DOM) |
| archie-linkability Q-2 | Published artifact is self-describing (static pages + anchors) | Task 5 (the export carries it unchanged) |

Both new IDs are **proposed, not user-gated** — recorded 2026-07-26 from the exploration ledger. They
need a gate before Wave 1 lands.

---

## Shape Changes

| Date | Role | Finding | Summary |
|---|---|---|---|
| 2026-07-26 | author | — | Initial plan from `ledgers/EXPLORE-studio-folder-export-settings-2026-07-26.md` §2–§3. |
| 2026-07-26 | author | Task 3 exec | Dropped the planned `build:single` npm script — `node build.mjs` emits BOTH targets, so a second entry point would be a redundant code path. Manifest updated. |
| 2026-07-26 | author | Task 3 exec | Blocking OQ resolved: esbuild with `splitting:false` + `outfile` INLINES the dynamic `import()` (0 remaining in output). Proven red-green from `file://` — IIFE boots (`defined:true`, 0 errors), ESM is CORS-blocked (`origin 'null' … blocked by CORS policy`). |
| 2026-07-26 | author | Task 3 exec | Assumption 3 (≤700 KB raw) invalidated by measurement — 897.7 KB. Accepted with rationale, not acted on. |
