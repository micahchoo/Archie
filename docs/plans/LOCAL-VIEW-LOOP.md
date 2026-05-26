# PLAN — Local view loop (Viewer genericity + local publish + in-Studio preview)

> **STATUS: DESIGN LOCKED (2026-05-26), not yet decomposed.** Source of truth = CONTEXT.md
> §"Local view loop". This is a *feature-scoped* strategy that **derives from** the meta-level
> `docs/IMPLEMENTATION-STRATEGY.md` and **reuses its mechanical system verbatim** (leaf-task schema,
> reducibility classifier, decomposer→wave→executor→verifier, per-phase skill rhythm). It does NOT
> restate them — read the meta doc for the machinery. Slots in **after Phase 2** (the adopted
> annotate→publish-to-GH tool). Governance follow-ups are QUEUED, see §8.

## Why this exists (the gap, in one line)

Today an authored Library can reach a Viewer **only via remote GitHub Pages**; the local Viewer
renders only hardcoded `sample-data.ts` through hand-written per-sample `.astro` pages. There is no
way to view authored work locally, and — the deeper finding — **the Viewer cannot render *any*
arbitrary Library, local or remote**, because routes + gallery are hardcoded. Closing the local loop
is the forcing function that makes the Viewer real.

## Ordering principles (derived from the design — not invented)

1. **Genericity before bridges.** The "one smart hall" (Viewer reads `exhibits.json` at runtime,
   hash-routes, fetches manifests) is the keystone both local-view *and* correct remote-publish
   depend on. A bridge to a Viewer that can't render arbitrary Libraries is rework. Build the shell
   first. *(Highest-assumption-load-first: the client-shell routing rewrite is the hardest to
   retrofit.)*
2. **Shared path before host specialization.** local-view ≡ GH-publish over the *same*
   `publishLibrary` tree; they differ only in *where bytes are written*. Confirm/keep the shared
   tree path, then add the thin local write-destination beside the existing GH one. **Adopted
   (GH publish exists) before invented (local adapter).**
3. **Faithful-by-construction before convenience.** Preview (D) renders the *published projection*
   via shared `render-mount` — never a working-state shortcut that could drift from what publishes.
   The faithful render path is the deliverable; the toggle UI is trivial on top.

## Phases (serial at phase level; C may parallelize A)

### Phase A — Viewer genericity ("one smart hall") — THE KEYSTONE
- **Builds:** one pre-built shell replacing `pages/{index,voynich,bidar,av}.astro`; hash router
  (`#/<slug>`, `#/<slug>/a/<noteId>`); Gallery projected from `exhibits.json` at runtime (incl. the
  single-exhibit-collapse threshold, CONTEXT §Gallery); `ExhibitView` driven by route slug (already
  fetches via `published.ts loadPublishedExhibit` — adopt); exhibit↔Library **breadcrumb**
  (`Project›Exhibit›…`, spec'd in the deep-link decision, never built).
- **Validates:** an arbitrary published tree (any slugs) placed in `public/published/` renders,
  lists in the Gallery, and navigates — fed by the *existing* `gen-published.mts`.
- **Does NOT validate:** any authored/local bridge (still sample-data-fed); visual OSD fidelity
  beyond Phase-1's owed browser gate.
- **Boundary:** Viewer renders an arbitrary tree regardless of who wrote it.

### Phase B — Local publish bridge + template filter (closes the C loop; depends on A)
- **Builds:** (1) template exclusion — route `buildFullLibrary()` (App.svelte) through the existing
  `isTemplate`/`templateSlugs`/`userExhibits` (App.svelte:69-70,187), opt-in to include; (2) a
  **"Publish locally" host adapter** sibling to `publishToGitHub`: Chromium `FsaFilesystem` writes
  the `publishLibrary` tree to a folder picked once (e.g. `apps/viewer/public/published/`);
  non-Chromium = Save `.archie.zip` + `gen-published.mts` **generalized to read a zip** via
  `loadLibrary(ZipFilesystem.fromZip(...))` instead of `sample-data.ts`. (3) **single-exhibit
  export = a Library with N=1** (NOT a new artifact): a `buildSingleExhibitLibrary(slug)` wrapping
  the chosen exhibit in a one-exhibit Library envelope, fed through the *same* publish path; the
  Gallery single-exhibit-collapse threshold (CONTEXT §Gallery) renders it as just-the-exhibit. Trivial
  scoping of `buildFullLibrary`; no new adapter. (Caveat: scoping a multi-exhibit Library down to one
  orphans any links FROM the kept exhibit TO dropped siblings — they degrade to plain text via
  `publishLibrary`'s `brokenLinks`, as with any partial publish.)
- **[SNAG carried from Phase A — canvasId base mismatch].** The Viewer reconstructs an object's canvas
  IRI via `canvasIdFor(slug,id)` from a FIXED `BASE` (`apps/viewer/src/published-base.ts`). That matches
  the demo (published with the same BASE) but NOT a real publish (a different origin is baked into the
  manifest) → annotation targets won't match → notes don't render. **Phase B must read the canvas IRI
  from the manifest** (`objectsFromManifest` currently recovers only the objId, discarding the full
  canvas `id`) so non-demo published Libraries render their annotations.
- **Validates:** the full author→local-view loop closes; an authored (non-template) Library renders
  in the real Viewer with no GitHub.
- **Does NOT validate:** in-Studio preview (separate surface, Phase C).
- **Boundary:** the data tree reaches the Viewer's served path from authored OPFS, two ways.

### Phase C — In-Studio Preview (D) — authoring experience (independent; may run parallel to A)
- **Builds:** a read-only **Preview** toggle in the Exhibit workspace that renders the *published
  projection* of the current exhibit — `publishLibrary`→`MemoryFilesystem`→shared `render-mount`.
  Single exhibit (the one in the editor).
- **Validates:** instant author-time feedback faithful to what publishes (shared `render-core`).
- **Does NOT validate:** Gallery/breadcrumb chrome (only the real Viewer, Phase A, exercises those).
- **Boundary:** Studio can show "what a visitor sees" for one exhibit without leaving Studio.

## Reducibility classification (the meta-strategy's SOURCE↔PROJECTION cut, applied)

| Work | Kind | Terminus |
|---|---|---|
| Template filter at publish boundary | Adopted (machinery exists) | small-model mechanical |
| `publishLibrary` tree (local == GH) | Adopted (exists, tested) | reuse; no new work |
| `gen-published` generalized to read a zip | Greenfield-specifiable | corpus-first → mechanical |
| Hash-route resolution (URL → {view,slug,noteId}) | Greenfield-specifiable | **corpus-first** → mechanical |
| Gallery projection from `exhibits.json` + collapse threshold | Greenfield-specifiable | corpus-first → mechanical |
| Breadcrumb up-nav model | Greenfield-specifiable | corpus-first → mechanical |
| OSD/Annotorious visual render in the shell | **Invented/projection** | **human browser gate** |
| FSA folder-pick + dev-server hot-reload loop | **Invented/projection** | **human browser gate** (FSA is browser-only, interactive) |
| Preview visual fidelity vs published artifact | **Invented/projection** | **human browser gate** |

The SOURCE rows are enumerable now (corpus = enumeration). The PROJECTION rows are `STOP for the
user` — an LLM cannot self-certify a visual/interactive result.

## Deceptively-simple items (write the test corpus FIRST — happy-path is a trap)

- **Hash routing with deep-links.** Corpus must cover: Gallery root, exhibit, exhibit+note
  (`#/<slug>/a/<id>`), cold cross-arrival (referrer-aware chrome), single-exhibit-collapse, and
  malformed/stale slug → graceful fallback. Mode transition, not one case.
- **Local FSA write idempotence.** Writing into a folder with stale files must clean like
  `gen-published.mts` does (`rmSync` recursive) — and tolerate the folder being a git repo. Cross-
  environment divergence (Chromium FSA vs zip path) is the hidden axis.
- **Template filter × cross-exhibit links.** A non-template exhibit linking to an *excluded* template
  exhibit → broken link. Already handled by `publishLibrary`'s `brokenLinks` degradation, but the
  corpus must assert it degrades (not crashes) when templates are filtered.

## Enumeration strategy (just-in-time, per the meta-strategy)

- **Enumerable now** (this plan's decomposer pass can write leaf tasks + corpora): the entire SOURCE
  column above. Each greenfield row's test corpus *is* its task enumeration.
- **Discovered later** (at a named boundary): the PROJECTION rows surface their real tasks only after
  a browser-verify gate reports what's wrong; the FSA loop's UX may spawn a follow-up after the
  human first runs it.

## First concrete move

**Not "write a plan."** The single keystone everything else waits behind:

> Write the **hash-route resolution test corpus** (`URL → {view, slug, noteId}`, including the
> deceptively-simple cases above) and the **`exhibits.json`→Gallery render** corpus; *then* replace
> `pages/{index,voynich,bidar,av}.astro` with one shell + a client-router island that consumes
> `published.ts`. This is Phase A's leaf-1. Until the shell renders an arbitrary tree, neither bridge
> nor preview has anywhere to land.

## Queued governance (user defers ADRs to end)

- **ADR-0002 amendment** (2 sentences): `client:only` + arbitrary authored slugs → runtime-data
  shell, not SSG-per-page; Astro demotes to shell-builder + island bundler.
- **Candidate ADR-0006a** — "Viewer is a runtime-data client shell (hash-routed), not SSG" (0006 is taken by edit-at-locus): this is
  hard-to-reverse, surprising without context, and a real trade-off (gave up SSG/SEO/pretty URLs).
  Meets the ADR bar; decide at ADR-writing time whether it's an ADR-0002 amendment or its own ADR.
- **Q-N minting** for the CONTEXT §"Local view loop" decisions (one-smart-hall, hash, multi-library=no,
  local-adapter, template-exclude) via `decision-record.sh`, so leaf tasks cite Q-N not prose.
