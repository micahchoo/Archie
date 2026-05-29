# HANDOFF — 2026-05-29 human-smoke fixes + grill decisions

Continuation point for the Archie smoke-test backlog. Reads with: `.interface-design/system.md`
(design source of truth — all grill decisions are recorded there in "Design Decisions Pending Build"),
the `Archie-*` seeds issues, and `THERMO-NUCLEAR-SYNTHESIS.md`. **Node: `eval "$(fnm env)"; fnm use 24`**
(system v20 breaks pnpm). Don't browser-verify (lightpanda wedges) — `build`/`test`/`astro check` are the
gates; runtime smoke is owed (noted below). Dev servers were left running: **studio :5174, viewer :4321**.

## ✅ DONE & verified green (the 7 "obvious" fixes — all landed by subagents)

Full workspace after: render-core 411 · render-mount 17 · render-svelte 17 · **studio 9 (new tests)** ·
viewer 13; studio + viewer build clean; viewer `astro check` 0/0/0.

| Seed | Fix | Files |
|---|---|---|
| `Archie-2cc1` | Breadcrumbs: "All objects"→"Back to Exhibit", "All notes"→"See all notes" | `viewer/Reader.svelte` |
| `Archie-1f0e` | "Exhibit layout · {name}" label + per-layout intent copy | `studio/ExhibitOverview.svelte` |
| `Archie-48ee` | Canvas viewport 80vh→92vh (min-height 36rem) | `studio/ExhibitOverview.svelte` |
| `Archie-1933` | Drag-reorder to pos 0 (START sentinel + `unshift` + leading drop zones, both modes) | `studio/ExhibitOverview.svelte` |
| `Archie-c833` | Download → "Save a copy" in PublishDialog (was a header whole-library button); "Publish…"→"Publish & Share…" | `studio/App.svelte`, `PublishDialog.svelte` |
| `Archie-455a` | `ReadingHelp.svelte` educational modal (localStorage-remembered), curator copy | `studio/App.svelte`, `ReadingHelp.svelte` |
| `Archie-0045` | Golden-amber `--accent-2` family in both `tokens.css`; ~30 green-on-grey chrome sites swapped (active/selection fills + paper green left as-is) | both `tokens.css` + ReadingLegend/Reader/ExhibitView/ExhibitOverview/App |

**Owed runtime smoke (no browser here):** reorder-to-pos-0 (no automated coverage); reading modal
first-use + autofocus; "Save a copy" picker; amber contrast visually; AV transcript cues still render
(the earlier `transcriptTextOf` change). studio's 9 tests are reducer/store only.

## 🔬 Bugs

- **`Archie-e5c0` (rename 0-object exhibit) — ✅ FIXED & verified (2026-05-29).** Was purely navigational:
  `openExhibit` routed a 0-object grid exhibit to `view="editor"`, but the title editor lives only in the
  overview Details drawer. Changed the "has-overview" predicate `> 1` → `!== 1` at BOTH `App.svelte:260`
  (routing) and `:623` (`hasOverview`) — a 0-object exhibit now lands at the overview; only a genuine
  single-object non-narrative exhibit skips to the editor. Comments cross-link the two sites (the
  duplicated predicate must stay in sync). studio build green, 9 tests pass. **Runtime smoke owed:** create
  an empty exhibit → land on overview → rename + add objects.
- **`Archie-9db6` (OSD `/assets` first-entry race) — ✅ FIXED & verified (2026-05-29):** moved
  `if (blobUrl) assetUrls = {...}` ABOVE the `await lib.appendObject(...)` in `App.svelte` `appendObject`,
  so the blob URL is registered before the persist-await's reactive flush mounts Canvas. studio build
  green, 9 tests pass. (Did NOT apply the optional `{#key currentSource}` re-key — the reorder is the
  real fix; re-key alone would only mask it and adds remount churn.) **Runtime smoke owed:** import an
  image into a fresh exhibit → OSD opens the blob on first entry (no `/assets` open-failed). Original
  diagnosis ↓.
  A statement-ordering
  race in the IMPORT path (not navigation): `appendObject` (`App.svelte:459-460`) does
  `await lib.appendObject(...)` (which sync-mutates `s.meta` then `await`s the OPFS persist — the
  suspension window) and only sets `assetUrls[obj.id] = blobUrl` AFTER. During the await, Svelte flushes
  with `current = o1` but `assetUrls[o1]` empty → the mount guard `{#if current && assetsReady}` (`:1415`)
  fires, `currentSource` (`:592`) falls back to the raw `/assets/...`, `createMount` (`mount.ts:49-70`)
  fails. Canvas reads `source` only in `onMount` (`Canvas.svelte:59-61`, no `source` $effect) so the late
  blob never reaches it. Re-entry works because `openExhibit` sets `assetUrls`+`assetsReady` atomically
  before mount. **NOT a STEP-5 regression** — the sync-mutate→await-persist→set-assetUrls ordering predates
  the library-meta refactor. **FIX:** move `if (blobUrl) assetUrls = {...}` ABOVE the `await
  lib.appendObject(...)` in `App.svelte:459-460` (closes the window for image `:537-540` + AV `:495`
  importers). Belt-and-suspenders: re-key Canvas `{#key canvasId}` → `{#key currentSource}` (`:1416`) so a
  late source flip remounts. ~1-2 lines + optional re-key.

## 🎨 Grill decisions (full detail in `.interface-design/system.md`)

1. **`Archie-1489` marker styling = A+C.** Colour is **reading-driven only** (ADR-0007; no per-note colour
   override — breaks the legend contract). Per-note styling = **emphasis only** (opacity/weight, never hue).
   Base notes get a neutral default. Curator picks reading colour (dovetails `455a`).
2. **`Archie-7e1f` >75% border = A+B.** **Automatic** coverage detection (from selector geometry) by
   default, **plus** an authored per-note "whole-object" override (small ADR-0006 hint). Border = the
   reading colour, amber only on contrast-fail. 4 corner hit-targets; ~75% tunable.
3. **`Archie-6d65` tools-in-notes = B, made canonical.** **Retires the persistent Select|Rect|Polygon
   palette.** Selection is ambient (always on). Drawing is **only** initiated by an explicit CREATE act via
   a universal **choose-shape → draw** gesture. Two create acts use it: **note creation** AND **narrative
   camera framing** (same primitive, different product). **→ Write ADR-0011 (below).** Build caveats:
   AV creation is a separate gesture (waveform/frame, not rect/polygon — keep AvEditor's surface); remove
   the `R`/`P` shortcuts (`App.svelte:860-1`); verify reshape survives via Annotorious select-mode handles.
4. **`Archie-ea50` cite/picker = A (two complementary, not a merge).** Keep the **⌘K text-cite**
   (`CmdK.svelte` — fuzzy search over notes+exhibits, inserts `[label](ref)`; do NOT collapse into a grid)
   **and add a visual picker** scoped to {exhibit objects, a note's media}; the two **share one result
   shape**. ("from a note" = the narrative `<select>`, `NarrativeEditor.svelte:157`.)
5. **`Archie-dba2` viewer top bar = A.** One thin three-zone bar in `ViewerShell`: left breadcrumb /
   "Back to Exhibit", center object carousel, right "Open another library". The carousel **moves out of
   the canvas overlay** (`Reader.svelte`) into the bar.
6. **`Archie-3f4c` remove buttons (NEW finding).** Scoped `DetailsEditor` + `onremove`: exhibit → "Remove
   from library", object → "Remove from exhibit". **Inline two-step** vermillion (`--error`) confirm (not
   `window.confirm`). Object removal **tombstones** its notes (`session.deleteNote`, ADR-0003); exhibit
   removal = `clearExhibitAnnotations` + drop from `exhibits[]`. Last exhibit → **truly-empty library**
   (no `DEFAULT_EXHIBITS` reseed); last object → empty exhibit (valid post-`e5c0`).

## 📐 ADR-0011 to write (decided, not yet filed)

**"Annotation creation is gesture-initiated; no persistent draw-tool mode."** Hard-to-reverse + surprising
(retires the anvil-adopted Select|Rect|Polygon toolbar + `tool`/`mode` state) + real trade-off (sticky
mode vs create-driven). Content = decision 3 above. File as `docs/adr/0011-*.md`.

## Build-readiness — ✅ ALL SIX BUILT + GREEN (2026-05-29)

All six decided features + ADR-0011 are implemented and gate-verified. Built via package-disjoint waves
(contracts locked first in `docs/reviews/plans/CONTRACTS-smoke-build.md`):

| Feature | What shipped | Where |
|---|---|---|
| **`6d65`** create-gesture | Retired Select\|Rect\|Polygon palette + `mode`/`tool` state + R/P/V; ambient selection; "New note" choose-shape→draw in the notes pane; framing shares the gesture; `creating` transient state. **ADR-0011 filed.** | `App.svelte`, `shortcuts.ts` |
| **`3f4c`** remove buttons | `DetailsEditor` inline two-step vermillion confirm + `onremove`; object → tombstone notes (ADR-0003) + drop; exhibit → `clearExhibitAnnotations` + drop; last-exhibit truly-empty (no reseed). +2 reducers, +4 tests. | `DetailsEditor`, `library-meta*`, `ExhibitOverview`, `App.svelte` |
| **`dba2`** viewer top bar | One three-zone persistent bar in `ViewerShell`; carousel lifted out of `Reader` overlay. | viewer `ViewerShell`/`ExhibitView`/`Reader` |
| **`1489`** marker styling | Per-note **emphasis** (muted/normal/strong) plumbed through the spine → `archie:emphasis` (byte-stable); control in the note popover; live `markerStyleOf` in studio + `readingStyleOf` in viewer (emphasis modulates opacity/weight, never hue; base notes neutral forest-green); reading-colour **swatch picker** at creation. | render-core spine, `App.svelte`, viewer `ExhibitView` |
| **`7e1f`** coverage border | render-core `geometry/coverage.ts` (+18 tests) + render-mount `setFrame` overlay (4 corner targets) + Canvas `frame` prop; viewer frames whole-object marks (auto `spatialCoverage` ≥0.75 or authored `archie:wholeObject`), suppresses double-draw. | render-core/mount/svelte, viewer |
| **`ea50`** visual picker | `MediaPicker.svelte` tile grid sharing ⌘K's insert path ("▦ Browse" beside ¶ Cite); ⌘K kept. | `MediaPicker`, `App.svelte` |

**Gates (fnm Node 24):** studio build clean + 13 tests · viewer build (4 pages) + `astro check` 0/0/0 +
13 tests · render-core 435 · render-mount 17 · render-svelte 17. Nothing committed.

**Carried-forward TODOs (scoped deferrals, NOT regressions — full list in `.interface-design/system.md`):**
7e1f surface-aware amber contrast rescue (frame currently keeps reading colour over the near-black
canvas — correct default); 7e1f AV frame render (image/OSD only); ea50 object-level cite + NarrativeEditor
tile re-skin; 1489 edit-reading-colour-after-creation surface. **Runtime smoke still owed (no browser
here):** the new-note gesture, remove two-step, emphasis modulation, coverage-frame corners, MediaPicker
thumbnails, reading-colour swatch, viewer top bar.

## Environment / state notes

- **Git:** working tree is dirty (`+~870/-4525`); the large deletions are **pre-existing** `published/`
  regen, NOT this work. My changes are **uncommitted**. If committing: branch off `main`, stage only
  touched files by name (don't `git add -A`).
- **Pre-existing, not introduced here:** studio has no tsconfig/svelte-check in its pipeline — the LSP
  floods `onclick does not exist in HTMLProps` / `no default export` errors on studio `.svelte` files;
  these are config noise, `vite build` is the real gate. Also stale `tsc` errors in
  `render-core/fs/binding.test.ts` + `render-svelte/controller.test.ts` (vitest passes).
- All grill decisions live in `.interface-design/system.md` → "Design Decisions Pending Build"; seeds
  `Archie-*` carry the work items (the `sd` CLI has no comment subcommand — this file is the record).
