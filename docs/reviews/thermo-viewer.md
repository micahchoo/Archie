# Thermo-Nuclear Review — `apps/viewer`

**Reviewer scope:** `apps/viewer/src` (~2387 LOC). Prior art read: `subsystems.md` (Viewer §6); ADR-0005, 0007, 0008, 0010.

## 1. Verdict

**Pragmatic Partial.** The dual-mode shell is clean and correctly seamed exactly where ADR-0008/0010 say it should be — the architecture is sound and behavior should not change. But the *read layer* carries a documented, deferred duplication (three hand-rolled readers of one on-disk layout) plus a second independent cluster of re-implemented note-body accessors. Both are deletable without behavior change. No 1000-line files; no spaghetti branching. The findings are concentrated in two files of logic (`published.ts`) and four components, not spread thin.

## 2. The Domino

**Fold the Readings registry into core's canonical published-tree reader, then make all three read paths delegate to ONE traversal parameterized by its read-source.**

Today there are **three** readers of the identical published on-disk layout (`manifest.json`, `readings.json`, `canvas/<id>/annotations.json`, `canvas/<id>/annotations-<rid>.json`):

| Reader | Source | Readings? | Media |
|---|---|---|---|
| `render-core/publish/site.ts:329 readPublishedExhibit` | `Filesystem` | **no** | pass-through |
| `render-core/publish/portable.ts:134 loadPortableExhibit` | `Filesystem` (Zip) | yes | blob-rewrite + `revoke()` |
| `apps/viewer/src/published.ts:139 loadPublishedExhibit` (hosted) | `fetch` | yes | pass-through |

The hosted reader (`published.ts:150–169`) re-walks the same paths over `fetch` that `loadPortableExhibit` already walks over a `Filesystem` (`portable.ts:151–163`) — byte-for-byte the same traversal, including the `readings.length > 0 → per-reading page` loop.

**This is not a new regression — it is the deletion ADR-0010 explicitly deferred.** ADR-0010 §Consequences states: *"Core's `readPublishedExhibit` omits the Readings registry, so the portable reader re-implements the readings read (~30 LOC, mirroring `published.ts:50,60`)."* The duplication was accepted as a v1 expedient *because the canonical reader omitted readings*. Remove that premise and the duplication has no reason to exist.

**Why the hosted path hand-rolls at all (state honestly):** there is no HTTP `Filesystem` backend — Storage ships Memory/Zip/Fsa only (`subsystems.md` §3). So the unification needs a read-source abstraction, not a fourth backend.

**Remedy (deletion-tested):**
1. Lift the readings-aware traversal into core: extend `readPublishedExhibit` to read `readings.json` + the per-reading pages, returning the `PortableExhibit` shape. `loadPortableExhibit` then becomes *only* its media axis — `readPublishedExhibit` + blob-rewrite + `revoke()`.
2. Parameterize core's reader by a read-source: `type ReadSource = (path: string) => Promise<unknown | null>` (404/missing → `null`, unifying `fetchJsonOptional` and `readJsonOptional`). A fetch-backed source and the Zip `Filesystem` are **two real implementors** (passes the ≥2-implementor seam discriminator) — not hypothetical.
3. `published.ts` hosted path collapses to: build a fetch `ReadSource`, call the core reader. ~30 LOC of duplicated traversal deleted; the readings-read invariant lives in one place.

**Deletion test on the remedy itself:** this does NOT collapse the two readers into one — the media axis (blob-rewrite + revoke, real behavior per ADR-0010) is the one explicit varying axis and survives. Only the *traversal* unifies. This makes Findings F2 (readings-read drift risk) and the cross-subsystem note-accessor split cheaper to land, because the published-exhibit shape then has exactly one producer.

## 3. Findings

### BLOCKER — none.

### MAJOR

**M1 — Triplicated published-tree traversal.** `published.ts:150–169` vs `render-core/publish/portable.ts:151–163` vs `site.ts:337–341`. The hosted reader re-implements a traversal core already owns twice. *Remedy:* the Domino. *Prior art:* ADR-0010 accepted this as a deferred deletion; cite it — this is collecting that debt, not contradicting the ADR.

**M2 — Note-body accessors re-implemented per component (separate cluster, NOT subsumed by the Domino).** The same W3C-body destructuring is hand-written four times:
- `Reader.svelte:63–65` — `bodies` / `commentOf` / `tagsOf`
- `NarrativeReader.svelte:79–81` — identical `bodies` / `commentOf` / `tagsOf` (verbatim)
- `MediaPlayer.svelte:32–35` — `bodyText` (a fifth, lossier variant: takes `body[0]` only)
- `Reader.svelte:48–51` — `readingColourOf` casting `it["archie:reading"]` via `as unknown as Record<string, unknown>`

**Type-boundary nuance (load-bearing — "just call `filter.ts`" is WRONG):** core's `query/filter.ts` `tagsOf`/`readingOf` are typed for `AnnotationRecord` (flat `.reading`, spine shape). The viewer consumes the *published* `W3CAnnotation` (reading is the JSON-LD `archie:reading` key; bodies are W3C-shaped). They are different types; the existing helper does not apply. *Remedy:* add a **published-side accessor in render-core** — `commentOf`/`tagsOf`/`readingOf`/`bodiesOf` typed for `W3CAnnotation` — and delete all four inline copies. This also removes the `as unknown as` cast (a Standard-5 boundary smell) by giving `archie:reading` one typed reader. (Cross-subsystem hook — see §5.)

**M3 — Base+reading overlay logic duplicated, by the code's own admission.** `ExhibitView.annotationsOf` (`ExhibitView.svelte:77–82`) and `NarrativeReader.activeNotes` (`NarrativeReader.svelte:65–71`) implement the identical "base always visible; active reading overlaid on top" rule (ADR-0007/Q16). `NarrativeReader`'s comment literally says *"mirrors ExhibitView.annotationsOf / Reader semantics."* When the overlay rule changes (e.g. v1.1 multi-membership, ADR-0007), it must change in two places. *Remedy:* one published-side helper `overlay(base, readingNotes)` beside the M2 accessor in core — both call sites pass `(annotationsByObject[id], readingAnnotationsByObject[id]?.[activeReading])`. ~4 lines, used twice = a real seam.

### MINOR

**m1 — `readingColourById` lives in the orchestrator.** `ExhibitView.svelte:88–100` builds annotation-id→colour by walking `readingAnnotationsByObject` × `readings`. Reasonable where it is (it needs `data`), but it is pure and testless; once the M2 accessor exists, `readingOf(annotation)` + a colour lookup replaces the nested loop. Fold opportunistically with M2; not worth a standalone change.

## 4. What earns its keep (do not relitigate)

- **`modeFromProbe` + the `ModeProbe` union** (`published.ts:46–69`). Looks like a five-case enum for a boolean. It is NOT decoration: the "404-is-the-ONLY-portable-signal" rule is a genuine correctness invariant. Deletion test: collapse it to `try/catch → portable` and the complexity *reappears* as a silent bug — a transient 5xx or malformed body over a real hosted tree gets misread as "empty portable hall." Deep, keep. (ADR-0008's "data-presence is the honest signal" — this is what enforces it safely.)
- **The `if (portableFs)` branch in `published.ts`** (`:121–124`, `:142–147`). This is the dual-mode seam ADR-0008 endorses, and it is concentrated in *one file* with both consumers (`ViewerShell`/`ExhibitView`) source-agnostic. Not scattered conditionals — the clean single seam the ADR called for. Leave it.
- **`ViewerShell` boot/route/swap state machine** (`ViewerShell.svelte:45–89`). `boot → loadAndShow → probe` and `openAnother`/`handleFile` read as a small, legible mode machine. No spaghetti. The `?src=`-first ordering is ADR-0009-driven, not ad-hoc.
- **`buildVoynichLog` factory** (`sample-data.ts:27–63`). Demo fixture, not shipped logic. The "order is load-bearing" / per-slug-log discipline is correct given published IDs depend on append order. Fixture rule applies (don't refactor to fix a test).
- **`MediaPlayer` cue/timeline machinery** (`MediaPlayer.svelte:38–76`). Genuinely AV-specific (parseMediaFragment, activeNoteIndex, scrub geometry). Deep behavior behind a small surface. Only its `bodyText` is the M2 duplication; the rest stays.

## 5. Cross-subsystem hooks (for synthesis)

1. **`render-core` should grow a published-side annotation accessor** (`W3CAnnotation → comment / tags / reading / bodies`) — currently re-implemented in `apps/viewer` 4× (M2) and the overlay rule 2× (M3). Standard 6: this is read-side feature logic that belongs in the canonical layer. Core already has the *record*-typed equivalents (`query/filter.ts`); the published-annotation twins are missing and the viewer fills the gap with casts. **This accessor is the home for the M2/M3 deletions.**
2. **The Domino touches `render-core/publish`** (`site.ts readPublishedExhibit` + `portable.ts loadPortableExhibit`): the unification — readings folded into the canonical reader, traversal parameterized by a `ReadSource` — lands in core, not the viewer. ADR-0010 names this exact deferred deletion. Synthesis should route the Domino to a core-publish work item, with the viewer's hosted `loadPublishedExhibit` collapsing to a thin call site.
3. **`MediaPlayer.bodyText` is lossier than the others** (reads only `body[0]`, no purpose filtering) — when the M2 accessor lands, AV notes gain correct multi-body/tag handling for free. Flag so synthesis doesn't treat it as a behavior change: it is a latent bug the consolidation fixes.
