# Thermo-Nuclear Review — `apps/studio`

_Reviewer: structural code-quality audit. Scope: `apps/studio/src` (22 files, ~4561 lines). Prior art read: `STUDIO-CODE-SPLITTING.md`, `POLISH-AND-OPTIMIZATION.md` (Q10), `subsystems.md`, ADR-0005/0006/0008. Behavior-preserving recommendations only._

## 1. Verdict

**Pragmatic Partial.** The subsystem is competently built and its apparent complexity is overwhelmingly *justified* — `seededVoynich`, the `{#key}` remount, the single `noteForm` snippet + marker-anchored popover (ADR-0006), narrative framing-mode (ADR-0005), and the binding model all earn their keep against the deletion test. But `App.svelte` is **1694 lines (1138 of script)** — a presumptive blocker under Standard 1, and a genuine god-component conflating ~7 responsibilities. The split is already a *recognized, deliberately-deferred* decision (POLISH Q10), not an oversight — so the finding is "status + the next concrete cut," not "discover this." Two clean deletions and one canonical-layer leak are independently shippable now.

## 2. The Domino

**Extract a `library-meta` store module (the `libraryMeta` reducer) out of `App.svelte`.** This is cut one of Q10 and it *deletes* complexity rather than relocating it.

`App.svelte` mutates `libraryMeta` through **~14 hand-rolled copies of the same nested-map idiom**:
```
libraryMeta = { ...libraryMeta, exhibits: libraryMeta.exhibits.map((e) => (e.slug === currentSlug ? { ...e, <field> } : e)) }; void persistLibrary();
```
covering `setLayout`, `setReadings`, `setExhibitRights`, `setExhibitTitle`, `setExhibitSummary`, `reorderObjects`, `renameObject`, `setObjectRights`, `setObjectSummary`, `appendObject`, `setSections`, plus the object-level `objects.map` variants and the library-level setters. Eight of these are one-line near-duplicates differing only in which field is spread.

A `library-meta.ts` store exposing `patchLibrary(fields)`, `patchExhibit(slug, fields)`, `patchObject(slug, objId, fields)` (each persisting internally) **collapses all ~14 setters into ~6 thin call sites** and removes the `void persistLibrary()` repetition entirely. This makes the "setter sprawl" finding (3.3) disappear, removes ~120 lines from `App.svelte`, and isolates the persistence trigger to one owner (Pre-Ship invariant: *where does state live* — currently the answer is "smeared across 14 closures"). Severity of the domino: **major** (size symptom of a real responsibility conflation; not a correctness risk).

State the conflation, not the line count: `App.svelte` is simultaneously (a) the library-meta store, (b) persistence/publish/binding orchestrator (~280 lines), and (c) the editor shell + WADM form. Cut (a) first (this domino), then (b) into `useBinding` (Q10's blessed name), leaving (c) as the legitimate shell.

## 3. Findings

### 3.1 — BLOCKER (deferred-by-decision): `App.svelte` is a 1694-line god-component
`apps/studio/src/App.svelte` — 1138 lines of script over ~7 responsibilities: library-meta reducer · OPFS persistence/autosave · binding model (save/open/recents/folder/zip) · publish/projection (`buildFullLibrary`/`projectSite`/`loadAllLogs`) · note CRUD + WADM form · narrative framing · keyboard registry · 3 view states.

**Status (prior art):** This is **POLISH Q10** (`docs/plans/POLISH-AND-OPTIMIZATION.md:73`) — explicitly classed `L`/med and given its own deferred plan. `STUDIO-CODE-SPLITTING.md:55` scopes it OUT of the bundle-splitting work on purpose. So it has not stalled by neglect; it was **correctly triaged as too large to fold into the chunk-splitting plan and never started.** The blessed decomposition is "extract `useBinding` (save/autosave/binding) + `useNoteEditor` (onCreate/applyForm/…) + finish the LibraryHome split."

**Next concrete cut:** the domino (§2) — the `library-meta` store — *before* `useBinding`/`useNoteEditor`, because it removes the most duplication for the least lifecycle risk (pure data, no OSD/Annotorious imperative coupling). Then `useBinding` (the ~280-line persistence/publish/binding cluster, which is the part touching capability seams). `useNoteEditor` last (it's entangled with `selected`/`editing`/`rev` Svelte runes — highest extraction friction).

### 3.2 — MAJOR (Standard 6, canonical-layer leak): hand-rolled note-body + reading-filter logic that `@render/core` already exports
`App.svelte:696-706, 754-756`. App defines its own `bodies()`, `commentOf()`, `tagsOf()` and then hand-codes the reading filter as nested ternaries:
```
readingFilter === "all" ? objNotes : readingFilter === "base" ? objNotes.filter((r) => !r.reading) : objNotes.filter((r) => r.reading === readingFilter)
```
`@render/core` **already exports** (`packages/render-core/src/query/filter.ts`, re-exported from the index): `tagsOf`, `readingOf`, `filterByReading`, `baseNotes`, `allReadings`, `filterByTag`. App's `tagsOf` is a near-identical re-implementation; the reading-filter ternary is a bespoke duplicate of `baseNotes`/`filterByReading`. **Remedy:** import `tagsOf`/`baseNotes`/`filterByReading` from core; keep only `commentOf`/`bodies` locally if core lacks a comment extractor (it does — see §5 hook). This is the canonical-layer standard squarely: the query layer is `render-core`, and a near-duplicate filter in the app is exactly the leak Standard 6 targets. Low risk (same semantics), high signal.

### 3.3 — MAJOR (folds into the domino): `libraryMeta` setter sprawl
`App.svelte` — ~14 `libraryMeta = {...exhibits.map(...)}; persistLibrary()` setters (enumerated in §2). Each is correct; collectively they're the spaghetti-by-repetition smell of Standard 2 (the same write idiom bolted in 14 places, with the persist side-effect manually re-appended each time). **Remedy:** resolved by the domino's `patch*` store. Listed separately so synthesis sees it is *one* move, not two.

### 3.4 — MINOR (Standard 0, clean deletion): dead components `MergeReview.svelte` + `IdentityPrompt.svelte`
`apps/studio/src/MergeReview.svelte` (80 lines), `apps/studio/src/IdentityPrompt.svelte` (68 lines) — **zero importers** anywhere in `apps/` or `packages/` (verified by grep). `App.svelte` derives identity inline (`loadIdentity`/`saveIdentity`/`asClientId`) and never mounts an `IdentityPrompt`; nothing references `MergeReview`. **Remedy:** delete both (148 lines). Deletion test: complexity vanishes with no reappearance — pure dead weight.

### 3.5 — MINOR (Standard 3, plan drift = a finding): `STUDIO-CODE-SPLITTING.md` misstates App's imports
`STUDIO-CODE-SPLITTING.md:10-12` lists `MergeReview` (and `ShortcutsHelp`, which *is* present) among "all view components static-imported in App.svelte:8-18." `App.svelte` does **not** import `MergeReview` (it's dead — §3.4). The plan's chunk inventory has drifted from the code. **Remedy:** when §3.4 lands, correct the plan's component list (and it removes a phantom from the Phase-1 lazy-load list). Per the brief, code/plan divergence is itself a finding.

## 4. What earns its keep (do not re-litigate)

- **`store.ts` (232 lines)** — deep module. Hides OPFS quirks (legacy `sample` slug path, MIME-restore-on-read for AV `EXT_MIME`, lazy `readAssetBlob` vs eager `readOriginalBytes` for the memory ceiling). Small interface, real behavior. Keep.
- **`binding.ts` (135 lines)** — deep module. Isolates the capability seam (folder vs file-stream vs download) per its own header contract; pure model lives in core. Keep.
- **`seededVoynich` + `seededFor`** — per-slug parameterized seeding of the three-layout exercise off the ONE shared `voynich.ts` (single source of truth, cited §A). Not duplication — one function, three slugs. Keep.
- **The single `{#snippet noteForm()}` + marker-anchored popover** — ADR-0006 mandates one editing-form definition that anchors to the marker; the drag/re-anchor (`notePopoverPos`, `noteManualPos`) is the documented locus behavior, not incidental complexity. Keep.
- **Narrative framing mode** (`startFraming`/`setSectionStart`/`onCreate` framing branch) — ADR-0005: a Section's camera is *framed on the canvas* (same gesture as a note), explicitly not a typed fragment. The mode flag is the ADR's design, not an ad-hoc branch. Keep.
- **`{#key canvasId}` remount of Canvas/AvEditor** — Canvas reads `source` only in `onMount`; remount-on-switch is the correct, commented mechanism. Keep.
- **`isAvCurrent` image-vs-AV branching** — ADR-0006 §3 selector-dimensionality-matches-medium; the two surfaces are genuinely different (OSD vs WaveSurfer/`<video>`). Real, not spaghetti.

## 5. Cross-subsystem hooks (synthesis reconciles)

1. **`m:ss` time formatter reimplemented 3× across studio** — `App.svelte:775` (`fmtMMSS`), `AvEditor.svelte:45` (`fmt`), `NarrativeEditor.svelte:67` (`fmtMMSS`) are byte-identical; `parseMMSS` lives only in `App.svelte:776`. render-core owns the *selector grammar* (`timeFragmentValue`/`parseTimeFragment`/`parseMediaFragment`) but has **no display formatter**. Candidate: a small `formatMMSS`/`parseMMSS` time-display util beside the fragment grammar in `render-core` (or a studio-local `time.ts` if synthesis judges it presentation-only). **Minor, presentation** — not asserting it must live in core; flagging the 3× dup so synthesis decides the home.

2. **Note-body / reading-filter query helpers (the §3.2 leak)** — `@render/core/query/filter.ts` already exports `tagsOf`/`baseNotes`/`filterByReading`/`readingOf`/`allReadings`; the Viewer presumably consumes them. Studio reimplements the same query surface inline. render-core *lacks* a `commentOf`/`bodyValue` extractor (App, AvEditor, and the core test files all hand-roll the `purpose === "commenting"` pluck) — that is the one genuinely missing canonical helper. **Hook:** add `commentOf`/`bodyValue` to `render-core/query/filter.ts` and route both apps through it; synthesis should check the Viewer for the same inline body-pluck.
