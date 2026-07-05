# SHOWROOM — showroom exhibit assembly walk (ISSUES.md Issue 9)

Walked 2026-07-05. The original diagnosis assumed the showroom needed building from scratch via
`docs/showroom/ASSEMBLE.md`'s human-in-Studio steps. Redirected mid-walk: the user pointed out
`apps/viewer/libraries/archie-library.archie.zip` already held a near-complete assembly (a `screenshots`
exhibit inside it) — evidently built by a prior session via the real Studio UI, then exported, but never
finished or wired into the live published tree. This walk verified what was already there, completed
what was missing, and found three real bugs the assembly exposed along the way.

## Step-by-step

| step | expected | actual | friction | fix commit | re-walk |
|---|---|---|---|---|---|
| Locate the showroom content | build from `docs/showroom/csv/` via Studio | already 95% assembled inside `apps/viewer/libraries/archie-library.archie.zip`'s `screenshots` exhibit: 20/21 objects, 84/87 notes, 65/84 region-anchored (rest correctly whole-object, matching the `power` reading's conceptual-commentary style) | 0 | n/a | pass |
| Add the missing object (`v3`, viewer-narrative) | ingest the screenshot, done | the SOURCE SCREENSHOT ITSELF was a captured error state ("Couldn't load this exhibit") — that's *why* v3 was never added; a prior session hit this and stopped | 2 | `f67e7a5` (re-captured the screenshot; confirmed live it's not a real bug) | pass |
| Assemble v3's 3 notes + regions | region-anchor per `csv/v3-narrative.csv`'s `_showoff` hints | done via a direct `@render/core` data-level script (no live browser automation available this session) — `AnnotationSession`/`appendNew` are the same APIs Studio itself uses, so this isn't a shortcut around the real ingest logic | 1 (no live Studio session to drive; documented as a scope deviation) | n/a | pass |
| Wire the 21-section narrative tour | per `docs/showroom/exhibit.md`'s spine | wrote all 21 sections + prose (the plan only specified titles/objects; prose text is this session's own writing, matching the established note voice) | 1 | n/a | pass |
| Set exhibit metadata | title "Archie, Annotated" per HANDOFF's suggestion | done | 0 | n/a | pass |
| Bake into the live published tree | drop the zip, run `gen`, done | **found 3 real bugs**, each blocking a piece of the assembly from actually reaching the browser (see below) | 3 | see below | pass, after fixes |

## Bugs found (not showroom-specific — pre-existing gaps this assembly was first to expose)

1. **The `v3` object's source screenshot was itself broken.** Confirmed the narrative reader works
   fine live; the capture was flaky. Fixed: re-captured `docs/screenshots/auto/viewer-narrative.desktop.png`
   (`f67e7a5`).
2. **`loadLibrary` (packages/render-core/src/publish/site.ts) silently dropped `sections` and
   `readings` on every round trip** — a real gap in the "publish↔load symmetry" its own doc comment
   claims. A narrative exhibit's Ranges vanished, and every reading-scoped note's per-reading page went
   with it. Never noticed because the app's only prior narrative exhibit (voynich-reading) is never
   round-tripped through a dropped-zip regen — this is the first second narrative exhibit the app has
   ever had. Fixed with a regression test (`6c61cf2`).
3. **`apps/viewer/scripts/gen-published.mts` never wired `getAsset`** — the drop-folder mechanism
   (`apps/viewer/libraries/*.archie.zip` → baked into `public/published/`) has *never* correctly
   published a zip with locally-authored (non-external-URL) images, silently dropping their bytes on
   every regen. Unnoticed because every bundled sample exhibit only references external URLs. Also
   fixed a related gap: a zip already baked against the real canonical `BASE` (the common case —
   dropping your own project's export) couldn't have its assets recovered on a second bake, since the
   source no longer matched the relative `/assets/{name}` shape the asset-copy step checks for. Fixed
   (`a025485`).

## One false alarm, logged for the record

Mid-walk, the individual-object view appeared to show a *different* exhibit's content (Voynich's
"Reading the Unreadable" narrative) instead of the showroom's own. Extensive investigation (multiple
Playwright sessions, network/console logging, cache-clearing, reading `ExhibitView.svelte`'s narrative-
index branching) before realizing: **the `v3-narrative` screenshot's pixel content is a picture of the
Viewer displaying its own narrative-reader feature** — using Voynich (the app's only narrative exhibit)
as the illustrative subject, exactly as the showroom concept intends ("Archie annotates Archie" —
screenshot the app doing its own thing). Not a bug. Recorded here as the lesson: a "wrong exhibit"
symptom can be a screenshot correctly depicting a different exhibit, not a data leak — check what the
image is *supposed* to show before assuming the data pipeline is broken.

## Open item not resolved here

The `assets` exhibit (the OTHER exhibit inside the same `archie-library.archie.zip`, holding an
unrelated mp3/mov test fixture pair) is a generic, untitled exhibit that will also appear in the live
public gallery once this zip is committed — it looks out of place next to the curated exhibits. Not
touched in this walk (product decision, not mine to make unilaterally) — flagged for the user.

## Done

**Done 2026-07-05**: showroom exhibit published — 21/21 objects, 87/87 notes, 21-section narrative,
title "Archie, Annotated" — baked into `apps/viewer/public/published/screenshots/` and committed via
`apps/viewer/libraries/archie-library.archie.zip` (the repo's documented drop-folder mechanism). All
six app test suites green throughout (714+116+7+154+63+98 tests), typecheck clean.
