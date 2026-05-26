# PLAN — Local-view Phase A: Viewer genericity ("one smart hall")

> **STATUS: EXECUTED to the agent-verifiable limit (2026-05-26), human gate owed.**
> SOURCE tier (LV-A1 route, LV-A2 collapse predicate, LV-A3 breadcrumb, LV-A6 canvasId decouple):
> code + corpus tests green — `@render/core` 274/274. PROJECTION tier (LV-A4 Gallery, LV-A5
> ViewerShell): code written; **`astro build` clean** (ViewerShell bundled, all routes generated).
> OWED: (1) HUMAN visual gate — `apps/viewer/node_modules/.bin/astro dev`, click gallery→exhibit→back,
> `#/<slug>/a/<id>` deep-link, single-exhibit collapse; (2) DELETE the 3 sample pages
> (`pages/{voynich,bidar,av}.astro`) — kept as fallback during verification (they now lose standalone
> `#/a/<id>` deep-linking since ExhibitView reads noteId from a prop, not location.hash — a
> transitional regression, fine since they're slated for removal); (3) [SNAG] canvasId base-mismatch
> → Phase B (see below). Notes: route parser landed in `url/route.ts` (beside deeplink.ts), not
> `link/route.ts`. Ambient Svelte `never`/`onclick` editor diagnostics are toolchain noise (build is clean).
>
> **BUG FIXED (2026-05-26): notes invisible in Narrative layout.** `NarrativeReader` had `bind:selected`
> but rendered NO note UI — no list, no drawer, no popup (unlike `Reader`, which has all three). So a
> sectioned exhibit surfaced no note content (data was fine — verified by `publish/preview.test.ts`
> narrative case: section.objectId + annotationsByObject + canvasIdByObject all correct). Fix: added
> the annomea popup on marker click (CONTEXT §123 "Both: popup/drawer on marker click") — the selected
> note's rendered body + tags, floating over the canvas, dismissable. Viewer `astro build` ✓.
>
> --- original decomposition below ---
>
> **DECOMPOSED (2026-05-26).** Decomposer pass (writing-plans + TDD) over
> Phase A of `docs/plans/LOCAL-VIEW-LOOP.md`. Source of truth = CONTEXT.md §"Local view loop".
> Reuses the leaf-task schema + SOURCE↔PROJECTION cut from `docs/IMPLEMENTATION-STRATEGY.md`.
> **Keystone phase:** until the shell renders an arbitrary published tree, neither the local bridge
> (Phase B) nor the in-Studio preview (Phase C) has anywhere to land.

## The cut: machine-verifiable SOURCE vs browser/human PROJECTION

`@render/core` has vitest (`pnpm --filter @render/core test <name>`); **`@archie/viewer` has NO test
script** (scripts = gen/dev/build/preview only). So the cut is forced by tooling: **pure routing /
gallery / breadcrumb LOGIC → `@render/core` (corpus-tested); the Astro shell + Svelte islands that
mount OSD → `@archie/viewer` (human browser gate).** This mirrors why `parseNoteDeepLink` and
`resolveLayout` already live in core, imported by `ExhibitView.svelte`.

### Machine-verifiable leaves (this session can do these — corpus-testable, small-model-mechanical)

```
TASK LV-A1  slug-qualified hash route parser
  implements:    CONTEXT §"Local view loop" (routing=hash); ADR-0006 (queued)
  blocked-by:    []
  donor:         @render/core parseNoteDeepLink (the existing `#/a/<id>` parser — EXTEND its grammar)
  write-targets: packages/render-core/src/link/route.ts + route.test.ts
  change:        parseRoute(hash) → { view:"gallery" } | { view:"exhibit", slug, noteId? }.
                 Grammar MOVES from `#/a/<id>` (page-local) to slug-qualified `#/<slug>` and
                 `#/<slug>/a/<noteId>` (single shell now owns all exhibits). routeToHash(route)
                 inverse for link-building. parseNoteDeepLink stays for the within-exhibit note id.
  acceptance:    RUN `pnpm --filter @render/core test route` → corpus green. Corpus MUST cover:
                 `#/` & "" → gallery; `#/voynich` → exhibit; `#/voynich/a/n7` → exhibit+note;
                 trailing slash; unknown/malformed slug → gallery fallback (no throw);
                 round-trip parseRoute(routeToHash(r)) === r.
  on-block:      STOP + escalate; do NOT invent a second routing scheme.

TASK LV-A2  gallery source + single-exhibit-collapse predicate
  implements:    CONTEXT §Gallery (collapse THRESHOLD); §"Local view loop"
  blocked-by:    []
  donor:         packages/render-core/src/iiif/exhibits.ts (toExhibitsJson, ExhibitsJson type)
  write-targets: packages/render-core/src/iiif/exhibits.ts (+ exhibits.test.ts) ;
                 apps/viewer/src/published.ts (loadGallery fetch wrapper only)
  change:        (core, pure+tested) shouldCollapseGallery(ex: ExhibitsJson): boolean — true iff
                 exactly one exhibit AND no library.title AND no library.summary/intro.
                 (app, thin) loadGallery(): fetch `${BASE_URL}published/exhibits.json` → ExhibitsJson
                 — mirror loadPublishedExhibit; respect import.meta.env.BASE_URL (GH project-site base).
  acceptance:    RUN `pnpm --filter @render/core test exhibits` → collapse predicate corpus green
                 (N=1 no-title → true; N=1 with-title → false; N>1 → false).
  on-block:      STOP; the collapse rule is CONTEXT-locked — do not re-decide it.

TASK LV-A3  breadcrumb model (exhibit↔library up-nav)
  implements:    CONTEXT deep-link decision (§125 Project›Exhibit›Section›Object, "always clickable")
  blocked-by:    [LV-A1]
  donor:         greenfield-per CONTEXT §125; route.ts (LV-A1) for the hash targets
  write-targets: packages/render-core/src/link/breadcrumb.ts + breadcrumb.test.ts
  change:        breadcrumbFor(route, ctx) → [{label, hash}] segments. `Project` → `#/` (the Gallery,
                 doubles as "what else is here"); `Exhibit` → `#/<slug>`; Section/Object optional.
                 Pure: takes resolved titles, emits segments + target hashes (uses routeToHash).
  acceptance:    RUN `pnpm --filter @render/core test breadcrumb` → segments + hashes correct for
                 gallery / exhibit / exhibit+section routes.
  on-block:      STOP + escalate.

TASK LV-A6  decouple canvasIdFor from sample-data (genericity prerequisite)
  implements:    CONTEXT §"Local view loop" (shell must not import demo code)
  blocked-by:    []
  donor:         apps/viewer/src/sample-data.ts canvasIdFor (the `${BASE}${slug}/canvas/${id}` form)
  write-targets: packages/render-core/src/iiif/manifest.ts (or a published-base helper) + test ;
                 apps/viewer/src/components/ExhibitView.svelte (swap the import)
  change:        Move canvasIdFor(slug, objId) to core as a pure published-path helper; ExhibitView
                 imports it from @render/core, NOT ../sample-data. (sample-data becomes demo-only.)
  acceptance:    RUN `pnpm --filter @render/core test manifest` → canvasId form green; typecheck clean.
  on-block:      STOP.
```

### Browser/human PROJECTION leaves (STOP for the user — an LLM cannot self-certify a visual render)

```
TASK LV-A4  Gallery island from exhibits.json
  implements:    CONTEXT §Gallery (auto-grid v1, invite-in styling)
  blocked-by:    [LV-A2]
  donor:         apps/viewer/src/pages/index.astro (PORT the existing card-grid markup + styles —
                 it is the hardcoded stand-in; replace its const array with loadGallery())
  write-targets: apps/viewer/src/components/Gallery.svelte (new)
  change:        Render the card grid from loadGallery(); each card links `#/<slug>`; library
                 title/intro framing. Same warm-wall styling as today's index.astro.
  acceptance:    HUMAN — RUN `pnpm --filter @archie/viewer dev` → gallery lists exhibits FROM
                 exhibits.json (verify by editing the tree, not the array), cards navigate.

TASK LV-A5  ViewerShell — the single client-routed shell
  implements:    CONTEXT §"Local view loop" (one smart hall); ADR-0006 (queued)
  blocked-by:    [LV-A1, LV-A3, LV-A4]
  donor:         apps/viewer/src/components/ExhibitView.svelte (already slug-driven) + LV-A1/A3/A4
  write-targets: apps/viewer/src/components/ViewerShell.svelte (new) ;
                 apps/viewer/src/pages/index.astro (REWRITE to host <ViewerShell client:only>) ;
                 DELETE apps/viewer/src/pages/{voynich,bidar,av}.astro
  change:        ViewerShell reads location.hash → parseRoute → renders <Gallery> (view:gallery,
                 honoring shouldCollapseGallery) or <ExhibitView slug> (view:exhibit); listens to
                 hashchange; renders <Breadcrumb> from breadcrumbFor. Collapse: N=1 no-title → render
                 the exhibit directly at `#/`.
  acceptance:    HUMAN — RUN `pnpm --filter @archie/viewer dev`: (a) `#/` shows gallery (or the lone
                 exhibit if collapsed); (b) `#/voynich` and back work; (c) `#/voynich/a/<id>` lands on
                 the note (cold-arrival chrome fires); (d) breadcrumb navigates up. Then drop a NEW
                 slug into public/published + add it to exhibits.json → it renders with NO code change.
```

## Sequence (waves — disjoint write-targets per CLAUDE.md delegation)

- **Wave 1 (parallel, core-only, no deps):** LV-A1 `route.ts` · LV-A2 `exhibits.ts`+`published.ts` ·
  LV-A6 `manifest.ts`+ExhibitView-import. Disjoint files; all corpus-tested in `@render/core`.
- **Wave 2 (depends on Wave 1):** LV-A3 `breadcrumb.ts` (needs route) · LV-A4 `Gallery.svelte`
  (needs gallery source). Disjoint.
- **Wave 3 (integration, browser gate):** LV-A5 `ViewerShell.svelte` + index.astro rewrite + delete
  the three sample pages. Single integrator; then the human acceptance run closes Phase A.

## What Phase A validates / does NOT (carried from LOCAL-VIEW-LOOP.md)

- **Validates:** an arbitrary published tree (any slugs) renders, lists, and navigates — fed by the
  *existing* `gen-published.mts` (still sample-data-sourced). Genericity proven independent of source.
- **Does NOT validate:** the authored/local bridge (Phase B) or in-Studio preview (Phase C). Phase-A
  green does NOT mean local publish works — only that the Viewer can render whatever tree it's given.
