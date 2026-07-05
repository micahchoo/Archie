# Scale & Gallery plan — Studio/Viewer beyond 20 images

**Origin:** grill session 2026-07-05 (user-gated; shared understanding confirmed). Both apps
degrade past ~20 images — in performance AND interaction design. Confirmed scale reality: 20+
Objects inside a single Exhibit AND 50+ Objects total across the Library; both levels crowd.
Pain ranking (all confirmed real): (1) finding an image in Studio, (2) organizing is
one-at-a-time, (3) sluggishness, (4) Viewer audience can't survey/jump a large set.

## Decisions (each grilled, each user-confirmed)

- **No new grouping domain concept.** Named object-groups/tags were challenged and dropped —
  at 20–50 items, search + sort + a better grid suffice. If real chapters emerge later, the
  documented path is IIIF Ranges (`structures`) — Exhibit = Manifest, Object = Canvas, so a
  group of Objects is a standard Range, not an invention.
- **"Gallery" =** photo-app-grade organizing on the within-Exhibit overview (**Grid**) PLUS a
  true Library-level **Gallery** (glossary's reserved term): Exhibit cards + all-images wall +
  search, with **Studio/Viewer parity** (user: "parity is needed").
- **Organizing kit:** multi-select (click / ctrl-toggle / shift-range / marquee / select-all),
  bulk delete, multi-drag reorder, density control. Bulk move-between-Exhibits **deferred but
  design-compatible** (multi-select is its foundation; don't paint it out). Ratings/flags: no.
- **Sorting is a view, never a silent reorder** — reading order stays canonical; sort options:
  reading order (default), name, recently-annotated.
- **Viewer in-exhibit navigation:** filmstrip/jump surface (available in narrative mode too,
  collapsed by default), position indicator ("14 of 32"), richer grid landing. No audience
  search inside an exhibit.
- **Library-level Gallery shape:** one surface, two views (Exhibit cards / all-images wall),
  one search box filtering the active view. Wall click-through: Studio → that Exhibit's editor
  at that Object; Viewer → that Object in its published Exhibit.
- **Publish format grows a library-level image index** (object titles + thumbnail refs +
  exhibit slug/object id) baked at publish time, so the Viewer wall never eager-fetches every
  manifest. This is the one hard-to-reverse decision → **ADR-0023** (proposed).

## Phases (ordered; perf first because it de-clunks everything downstream)

### Phase 1 — Perf slate (no UI redesign, pure de-clunking)
User runs ALL modes (browser OPFS, folder-bound, Tauri) and feels stutter at exhibit open,
overview scroll, and after saves — so all three fixes are live:
1. **Incremental folder autosave.** (Spike: `docs/spikes/spike-0002-incremental-folder-autosave.md`
   — the implementation spec; follow it.) Today `autosaveToFolder` (`binding-store.svelte.ts:176`)
   reruns `publishLibrary` (`site.ts:205`) over the whole Library per debounced note save; the
   dominant cost is unconditional DZI re-tiling + byte-copying every master; nothing is hashed or
   skippable, and full republish never removes orphans (pre-existing bug the increment must fix).
   Design: `PublishOptions` gains optional `incremental?: IncrementalScope` (`exhibits` slugs to
   rewrite, `reassets` subset needing byte passes, `removedExhibits`/`removedObjects` cleanup) —
   absent = today's behavior, zip/GH/preview paths untouched. When byte passes are skipped,
   recover projected objects (source/tileSource/thumbnail) from the EXISTING published
   `manifest.json` via `objectsFromManifest` (`manifest.ts:145`), re-embed fresh heads, write.
   Dirty-set lives in the binding store, fed by `exhibit-session.save()` (note edits → that slug)
   and the `library-meta` reducers (structure ops → `reassets`/removals). NOTE (implementation
   deviation, deliberate): `loadAllLogs` is NOT narrowed to dirty slugs — publishLibrary builds a
   whole-library `archie:` link index from every log, and a partial map would wrongly degrade
   valid cross-exhibit cites; log JSON is cheap, byte passes were the cost. Test oracle:
   full-publish tree ≡ incremental publish of the same mutation; `tileObject` spy asserts 0 calls
   on a note-edit save.
2. **Lazy master minting.** (Spike: `docs/spikes/2026-07-open-cost-and-lazy-assets.md`.)
   Minting is handle-lookup + blob-URL registration, no byte read — the waste is N never-viewed
   master URLs pinning OPFS Files plus N handle lookups on the open critical path. Only
   `currentSource` (`App.svelte:627` → Canvas/AvEditor) ever needs a master. Design: drop the
   master wave from `resolveAssets` (:138), keep thumbs eager; mint the current master on
   `current` change into a single-slot cache (id-guard against rapid-switch races,
   revoke-on-switch); gate the Canvas `{#key}` on `masterReady` mirroring the existing
   `assetsReady` contract (:1739). Preserve the thumb-less legacy fallback (`thumbSrc` :634)
   by minting masters only for the no-`thumbnail` subset into a small `railFallbackUrls` map
   (empty for modern libraries — ingest always bakes, `ingest-flows.ts:218-227`).
3. **Virtualize the Studio overview list mode — directly, no measurement needed:** fixed-height
   rows, copy Viewer's `content-visibility: auto` + `contain-intrinsic-size` (`ObjectGrid.svelte:69-73`)
   onto `.list li` (~3.5rem). **Canvas mode: measure first, likely leave alone** — capture DOM
   node count and pan/zoom paint time at 30/70 plates; hypothesis is it's fine once masters are
   lazy (a prove-it pass, not a build task).

### Phase 2 — Studio overview toolkit (find + organize)
One persistent toolbar on `ExhibitOverview`: search box (Object titles), sort control
(reading order default / name / recently-annotated — views only), density slider, select-mode
toggle. Selection model: click single, ctrl/cmd toggle, shift range, background-drag marquee,
select-all. **Conflict to resolve:** background-drag currently pans the canvas mode
(`ExhibitOverview.svelte:111-124`) — select-mode toggle (or a modifier) disambiguates in canvas;
list mode gets marquee for free. Bulk delete + multi-drag reorder ride the existing single-item
DnD primitive (`:128-163` — its comment already anticipates extension).

### Phase 3 — Library-level Gallery (Studio + publish format + Viewer parity)
1. Studio `LibraryHome.svelte` (text-only cards today, `:222-235`): visual Exhibit cards
   (cover thumb, object count, last-edited) + all-images wall (virtualized, lazy thumbs) +
   one search box.
2. Publish pipeline emits the library-level image index alongside `exhibits.json` (ADR-0023).
3. Viewer library landing (`published.ts:200-213` reads `exhibits.json` only today) gains the
   same two views + search, fed by the baked index.

### Phase 4 — Viewer in-exhibit navigation
Filmstrip/jump overlay reachable from Reader and NarrativeReader (collapsed by default in
narrative — authored path stays primary); position indicator; richer grid landing (density
toggle). Note `.scratch/CONTEXT.md` §146 already prescribes a Narrative position indicator
("Section 3 of 7") for deep-link arrival — extend, don't duplicate.

## Deferred (explicitly out of this round)
Bulk move/copy between Exhibits (annotations/readings/assets must travel — own design branch);
object tags; IIIF Ranges grouping; audience search inside an exhibit; library image wall
revisit for many-hundreds scale.

## Verification
Fixture (spike-verified): seed exhibits use remote IIIF and bypass the OPFS `/assets` path, so a
real OPFS library is required. Build `scripts/seed-fixture.mjs` by cloning the existing Playwright
harness `scripts/capture-screenshots.mjs` (boots dev servers, drives Studio by text anchors):
generate placeholder PNGs in-page via `OffscreenCanvas.toBlob` (numbered, no disk files), feed
through real ingest (`setInputFiles` → `newExhibitFromFolder`) for 2×30 + 1×10 = 70 objects.
OPFS is per-profile — use `launchPersistentContext(userDataDir)` and reuse the profile across
runs. Folder-bound copy needs one manual FSA directory-pick gesture (native picker isn't
scriptable); do that once interactively, or verify folder-writes via the Tauri path.

Checks: exhibit open < previous baseline; folder autosave after a one-note edit touches only that
exhibit's files (watch folder mtimes); overview scroll stays smooth at 30 objects;
search/sort/multi-select flows per Phase 2; published wall loads without fetching all manifests
(network tab).
