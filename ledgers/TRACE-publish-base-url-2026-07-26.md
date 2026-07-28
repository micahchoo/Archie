# Trace: why `https://archie.demo` shipped to micahchoo/test

**Ticket:** Trace the GitHub-push base URL (`Archie-d6ad`), map *Published tree as the product* (`Archie-c268`).
**Method:** static trace, four parallel readers over `packages/render-core/src/publish/`, `apps/studio/src/`,
`apps/viewer/src/`, `packages/archie-viewer/src/`, cross-checked against the live tree at
`https://micahchoo.github.io/test/`. Greps run with `-a` throughout (NUL-byte hazard). No app run, no suites run.
`.claude/worktrees/` holds ~35 stale checkouts — every line cited here is from the live tree.

## The cause, in one line

`apps/studio/src/App.svelte:1932` passes `baseUrl: BASE` into `createPublishFlows`; `BASE`
(`apps/studio/src/seed-data.ts:33`) re-exports `WORKING_IRI_BASE = "https://archie.demo/"`
(`packages/render-core/src/publish/working.ts:38`) — the **authoring identifier namespace**, handed to the
publisher as if it were a deploy origin.

render-core is innocent: `publishLibrary` defaults `baseUrl` to `""` (`site.ts:296`) and mints every id by raw
concatenation of whatever it receives. The constant's own docblock (`working.ts:29-37`) states the contract the
wiring breaks — *"an internal IDENTIFIER namespace only — never fetched, never published; the published tree uses
the real deploy origin"*.

All three Studio sinks pass it: memory projection `publish-flows.svelte.ts:240` (feeds the GitHub push **and** the
desktop deploy), zip `:254`, folder `:316`. So "publish to a folder and push it yourself" produces the same wrong
URLs as the button.

## The real URL was on screen before the push

Nothing is missing — the value exists, four steps too late.

- `publish-machine.svelte.ts:599-608` computes `sitePreview` → `pagesUrlFor(owner, repo)`
  (`packages/render-core/src/publish/ghpages.ts:137`), which returns exactly `https://micahchoo.github.io/test/`,
  and **shows it to the user** in the name-site step.
- `deploy-flows.svelte.ts:158` calls `source.projectSite()` — the tree is baked here, with `archie.demo`.
- `:168` pushes it.
- `:174` computes `const url = pagesUrlFor(target.owner, target.repo)` — used only for the success link and
  `rememberTarget`. Never fed back into the projection.

Worse for ordering: `publish-flows.svelte.ts:377-397` (`openPublish`) starts the projection the moment the user
enters the GitHub step — *before any repo name is typed* — and caches it in `cachedSiteFs` (`:385`);
`collectSiteFiles` (`:248-251`) reuses that cache. The tree is normally rendered strictly before owner/repo exist,
and nothing re-projects once they do.

Both push transports consume an already-rendered file map, so neither can repair it: the browser form uses the
git-trees API (`ghpages.ts:174-218`), the desktop path a Rust `gh_push_tree` command (`deploy-flows.svelte.ts:114-116`).

## The counter-example: how the bundled deploy gets it right

`scripts/build-gh-pages.sh:27` sets `PUBLISH_BASE` / `PUBLIC_CANONICAL_ORIGIN` from `archie.config.json` **before**
`pnpm build`, whose `prebuild` regenerates the published tree inside that env scope
(`apps/viewer/scripts/gen-published.mts:99`). `apps/viewer/src/published-base.ts:18-21` reads them, defaulting to the
real canonical origin — its header comment at `:9` says *"no more archie.demo"*. True for `pnpm gen`; never applied
to Studio's push. Studio consults `archie.config.json` only for `viewerBase` (`publish-flows.svelte.ts:23-25`),
never for `baseUrl`, and has no env or runtime override at all.

**Base resolved before projection vs. after projection is the whole difference.**

## The trap: `baseUrl` does double duty

A naive swap to the Pages URL trades wrong URLs for **missing annotations**.

`site.ts:575-578` groups heads into per-canvas pages by
`targetSource(h) === ${baseUrl}${slug}/canvas/${obj.id}`, and stored `target.source` values were minted at
*authoring* time against `WORKING_IRI_BASE` (`view-state.svelte.ts:67,112`) and are written through unchanged
(`serialize.ts:159`). Change `baseUrl` alone and every annotation silently drops from the published tree — a
healthy-looking publish with zero notes. That exact regression is pinned:
`packages/render-core/src/publish/site-geo.test.ts:1-3,41` — *"DROPS the annotations when baseUrl ≠ the target
base — the bug the live source hit"*. `static-pages.ts:232` repeats the equality.

Section targets are built from `baseUrl` at publish time (`manifest.ts:310`), so they do **not** have this problem.
That asymmetry is the hazard: a fix can look correct on a narrative exhibit and be empty on an object grid.

Two shapes for the fix: **(a)** a target-remap pass at projection time (working IRI → publish IRI), or **(b)** a
`publishBase` distinct from the grouping base — mint ids from `publishBase`, keep comparing against
`WORKING_IRI_BASE`. This is the substance of *Decide how publish learns its destination URL* (`Archie-3504`) and
*Separate the publish base from the annotation-target namespace* (`Archie-19c5`).

## The URL inventory: 51 emitters, three tiers

Full table in the ticket's workflow output; the actionable shape is the tiering, because "just relativise it" is
wrong for tier 1.

**Tier 1 — must be a correct absolute; relative is not an option.**
Citation ids `{base}{slug}/annotations/{logicalId}/v{n}` (`serialize.ts:147`) — a relative citation id is not a
citation, and this is the single strongest argument for fixing the base rather than relativising. Also `og:url` /
`og:image` (spec-absolute, scrapers don't resolve), `sitemap.txt` / `sitemap.xml` locs (protocol-absolute,
cross-host locs are rejected), `collection.json items[].id` (also parsed for slug by `merge.ts:13`), Range
`supplementary.id` → `narrative.json`, `prov:wasRevisionOf`, `archie:hasHistory` + `history/index.json` values.

**Tier 2 — could be relative, at the cost of IIIF interop only.**
Manifest / Canvas / AnnotationPage / Range ids. Archie never dereferences them: `HttpFilesystem` fetches by path
under a runtime base (`fs/http.ts:69`), `read.ts:174` builds sidecar paths itself, `objIdFromCanvasId` reads only
the last segment. IIIF P3 says these SHOULD be HTTP(S) URIs, so relativising buys nothing but hides the bug.

**Tier 3 — should probably be relative; the codebase already says so.**
The refs actually *loaded as URLs*: `object.source` (`site.ts:416`), `tileSource.filesPath` (`:425/:459`),
`canvas.thumbnail` (`:438`), `images.json thumbnail` (`image-index.ts:61`). Three working relative precedents already
exist in the tree — `exhibits.json` cover (`exhibits.ts:50-55`, explicitly "takes no baseUrl"), the structure sidecar
(`structure-serialize.ts:207`), and every `<a href>` in the static pages (`static-pages.ts:136,198`). And
`iiif/resolve.ts:54-56` documents `filesPath` as *"Published relative within the exhibit tree"* — the absolute base
overrides its own stated design.

## What the live tree confirmed

Fetched index.html, sitemap.txt/.xml, exhibits.json, collection.json, images.json, archie.json,
`documents-d/{manifest.json,index.html}`, a canvas annotations page, and `annotations/history/{index.json,…}`.
Every id / loc / canonical / og carries `https://archie.demo/`. **The bytes are all correctly published** at the real
host: asset 200 (5.4 MB), thumbnail 200 (26 KB), DZI tiles at levels 0/1/8 all 200 `image/jpeg`. Nothing is missing
from the tree; only the URLs pointing at it are wrong.

## Four defects found that are independent of the base

1. **Studio's `?src=` share links have never worked.** `Publish.svelte:198` mints
   `${CANONICAL_VIEWER}?src=…` — a real query param — but the viewer parses the **hash** query only
   (`ViewerShell.svelte:55` → `route.ts:28-33`); `location.search` is read nowhere in `apps/viewer/src`. ADR-0009 and
   `route.ts:8-11` both specify `#/?src=…`. Pure drift at the single minting site; `route.test.ts` covers the parser
   (correct) and nothing covers the minted string. The iframe snippet at `:216` embeds the same dead link.
   → `Archie-4f7c`.
2. **The hosted viewer has no tree-base door.** `apps/viewer` `?src=` accepts only zip bytes
   (`published.ts:282-284` → `open.ts:109-113`); its hosted-tree read is pinned to its own deploy
   (`published.ts:22`). The embed already implements the dispatch (`packages/archie-viewer/src/load.ts:120-128`,
   tested). Consequence: **no URL exists today** that opens `https://micahchoo.github.io/test/` in the hosted viewer.
   The only thing that opens that tree is `<archie-viewer src="https://micahchoo.github.io/test/">` on a page the
   author hosts. → `Archie-6d85`.
3. **JSON-LD `contentUrl` is the raw working path.** Live: `"/assets/01KX….JPG"`. `site.ts:616` hands
   `exhibitPageHtml` the pre-rewrite `exhibit` while `:485` builds the manifest from `manifestExhibit`. One
   identifier. → `Archie-5a15`.
4. **`og-card.png` is advertised but never written.** `grep -rn og-card packages/` hits only `static-pages.ts:47,160`;
   verified 404 on the live tree. Both static pages carry an `og:image` that cannot exist at any base. → `Archie-5a15`.

Also noted, out of scope: `annotations/history/01KYFYYBSC….json` targets canvas `01KXZPZ55DVMB2DNHCKFWKFS4A`, which
has no canvas in the published manifest — an orphaned history page.

## Consequences for the map

- The static pages' viewer links (`static-pages.ts:133` library, `:202` exhibit, `:217` section, `:192` note) emit a
  bare `viewerBase` with no back-reference — and `:202`'s `{viewerBase}#/{slug}` resolves against the **canonical
  library's** slugs, not the pushed tree's. Under the chosen self-replicating publish, these should point at the
  tree's own viewer; that is now a constraint on *Prototype self-replicating publish* (`Archie-e09d`).
- The cheapest correct seam for the base: give `PublishDeps` a `baseUrl` getter (or `projectSiteFs` an optional
  override) fed by `pagesUrlFor(owner, repo)` — already computed at `publish-machine.svelte.ts:604` — **and**
  invalidate `cachedSiteFs` on target change. Folder and zip targets have no URL at publish time, which is why the
  destination question is a decision, not a patch.
