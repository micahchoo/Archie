# Prototype: the published tree carries its own viewer (Archie-e09d)

**Verdict: it works, and it is cheap.** A tree published with the embed bundle inside it opens its
own deep-zoom reader in Chromium off a bare `python3 -m http.server`-class static server — no CDN, no
hosted Archie instance, no origin the tree does not control. Measured 10/10 on the drive, 5/10 with
the bundle removed. It costs **950 KB raw / 276 KB gz** in the tree and **39 KB gz on page load**,
because the canvas engine stays behind the embed's existing lazy boundary.

The one thing it does **not** buy is `file://`. That is a hard no, on two independent grounds, both
measured rather than inferred. See [file:// is a dead end](#file-is-a-dead-end).

Branch `proto/self-replicating-publish`, off `d15b928`. Commits `c6214e0` (emission + 11 tests),
`81ad0fb` (the browser drive).

---

## What was built

`publishLibrary` grew one injected option, in the same shape as `getAsset` / `tileObject` / `tileRemote`
— core cannot read `packages/archie-viewer/dist` (no filesystem in a browser, no dependency on the
embed package), so the app supplies the bytes and core decides the layout:

```ts
getViewerBundle?: () => Promise<ReadonlyMap<string, string | ArrayBuffer | Blob> | null>;
```

Given it, the tree gains three things:

| path | what |
| --- | --- |
| `_viewer/archie-viewer.js` + 8 sibling chunks | the embed bundle, flat, exactly as esbuild emits it |
| `viewer.html` | a shell hosting `<archie-viewer>` over the tree it sits in |
| `.nojekyll` | see below — it is not decoration |

and every static page's viewer link is re-pointed at that shell, **tree-relatively**: `viewer.html`
from the library landing, `../viewer.html#/{slug}` from an exhibit page.

Absent the callback — which is every existing caller: the zip export, the GH-Pages adapter,
`gen-published`, the folder sink — the output is byte-identical to before. That is the first test in
the file, and `git status` after the whole prototype shows the committed `apps/viewer/public/published/`
tree untouched.

### Candidate A, decided; Candidate B not built

The ticket offered two shapes. **A** — ship the `<archie-viewer>` Web Component bundle and a shell —
is what was built and what works. **B** — make the Astro viewer app base-configurable and copy it in —
was not built, and the prototype produced the argument against it rather than merely a preference:

- B ships a *second* renderer into the tree. The embed already exists as a committed, CDN-published,
  size-ratcheted artifact (`bundle-size.json`, `sync-dist:check`); A consumes it with zero new build
  coupling. B would put `apps/viewer`'s build on the publish path.
- B's page-load cost is the one the repo already ratchets at 138–148 KB per route
  (`scripts/perf/reader-budget.json`) *plus* Astro's own shell. A's is **39 KB gz**, because
  `element.ts` defers the OSD reader and `eagerGzKB` enforces it
  (`.claude/rules/archie-viewer-eager-closure.md`).
- B has no story for "the tree moved". The Astro app resolves routes against a configured base; A's
  shell computes its base from `location.href` at runtime and therefore has nothing to configure.

### Prior art: quire already does the bundle-in-the-tree half, and takes the OTHER side of the link trade

The first draft of this ledger claimed *"no corpus system ships a viewer into the data tree."* That is
**false**, and it died on contact with the file. `quire/packages/11ty/_includes/components/head.js:62`
emits

```html
<script src="/_assets/javascript/application/canvas-panel-web-components-1.0.68.js" type="module"></script>
```

and the bundle it names is **vendored into the repo** at
`quire/packages/11ty/content/_assets/javascript/application/canvas-panel-web-components-1.0.68.js`.
So quire is direct precedent for Candidate A's core move — ship a self-contained viewer Web Component
bundle inside the published output — and the citation is worth more for where it *diverges*:

- **quire's script path is ROOT-ABSOLUTE** (`/_assets/…`), which pins the built site to a deploy root.
  That is precisely the coupling this prototype's tree-relative design removes. quire supports the
  *bundle-in-the-tree* decision and **not** the *tree-relative* one; it demonstrates the trade Archie
  is taking the other side of.
- quire's viewer is emitted by a static-site **generator** running on the author's machine, so a
  bundler resolves the asset. Archie's publish runs **in a browser with no build step**, which is why
  the bytes have to be injected through a callback rather than imported.
- quire **vendors a pinned upstream** viewer (canvas-panel 1.0.68). Archie ships its own, which is why
  the size ratchet already exists and why the lazy boundary is enforceable.

One more thing that fell out of opening it: **quire ships no `.nojekyll`** — `find … -name .nojekyll`
and `grep -rn nojekyll` over the checkout are both empty — while emitting an `_assets/` directory.
Same underscore shape, no guard. Read as a caution about the trap below, not as a claim that quire is
broken; its docs point at Netlify, where Jekyll never runs.

The closest thing in *this* repo is `apps/studio/src/single-file-export.ts`, which solves the adjacent
(`file://`, one document) problem by inlining everything. Its header is where the `file://` constraints
were first written down; this prototype re-measured them rather than citing them, and both held.

Not checked, and named rather than implied: **clover-iiif and universalviewer were not opened for this
question.** An absence there is unestablished either way.

---

## The drive, and what it proves

`scripts/proto/self-replicating-publish.mts` bakes the committed fixture tree through
`loadLibrary` → `publishLibrary` with the real `dist` wired in, writes it to a temp dir, serves it
with a **bare** static server (path → file, `/` → `index.html`, 404 otherwise — no SPA rewrite, no
history fallback, no directory listing), and drives Chromium against it. Own port, bound fresh, refused
if taken, killed on exit; never reused (`.claude/rules/viewer-e2e-shared-port.md`).

```
PASS  viewer.html presence tracks the bundle — viewer.html present
PASS  _viewer/ carries the embed entry — present
PASS  .nojekyll ships beside _viewer (GitHub Pages runs Jekyll) — present
PASS  the exhibit page links to the TREE's viewer, relatively — ../viewer.html#/screenshots
PASS  the tree's own bundle boots and renders the gallery — 6 exhibit cards
PASS  a deep-zoom canvas mounts from the tree's own tiles — .openseadragon-canvas present
PASS  a real click on a region opens ITS note — 1 region overlays; clicked (473, 355);
      card = "×A note authored by the self-replicating publish drive."
PASS  viewer.html#/{slug} deep-links into the exhibit — landed on screenshots's object grid
PASS  the archival page's relative link reaches the viewer — http://127.0.0.1:4473/viewer.html#/screenshots
PASS  NOT ONE BYTE of script comes from outside the tree — 0 external scripts

RESULT: PASS  (10/10)
```

The click is a real `page.mouse.click()` at the region's centre, not a synthetic `click()` and not
keyboard Enter — both of those succeed against code where a real pointer does nothing
(`.claude/rules/osd-overlay-wrapper.md`).

**Red-green.** `--no-viewer` bakes the same tree with `getViewerBundle` omitted:

```
RESULT: FAIL  (5/10)
```

The gallery, the canvas, the note-click, the hash deep link and the archival page's link all go dark;
`viewer.html` 404s. Green run repeated 4/4 (ports 4472, 4473, 4476, 4478). Unit suites 5/5 at 84 tests
across the two touched files.

### Two harness bugs worth recording, because both are rule-shaped

**The subject was empty and the probe still printed a verdict.** The only offline-capable exhibit in
the committed fixture tree is `screenshots`, and it carries **zero** annotations — measured across all
20 canvases, while `voynich` has 21 and `language-atlas` 8, all of them remote-sourced. The first run
reported `FAIL — no note card` against entirely correct code. The harness now authors one note through
the real spine (`appendNew` → `publishLibrary` → the published annotation page — the path under test,
not a fixture cheat) and **prints the region count beside the verdict**, so an empty subject can never
again read as a broken feature. Exactly `[[post-review-fixes-are-unreviewed]]` §1a.

**A `waitForFunction` predicate that throws is not retried, it rejects.** Mid-navigation the old
document is still current, and `document.querySelector("archie-viewer")` is `null` there. That read as
*"the archival page's relative link never reached the viewer"* — while `page.url()`, printed on the
very same failure line, showed `viewer.html#/screenshots`. The two halves of one line disagreed and
the line was nearly believed. Optional chaining turns the throw into a `false` the poller waits
through.

### One assertion deliberately narrowed

"No external origin is contacted" **failed**, correctly, for a reason that has nothing to do with this
feature: the fixture library's gallery thumbnails point at Yale and archive.org because those
exhibits' *sources* are remote. That is the library's **data**, chosen by its author; no publish
mechanism makes a remote image local without baking tiles (`tileRemote`, already an option).

So the assertion is now **"not one byte of script comes from outside the tree"** — the self-replication
claim, and the hard one — with the image requests reported as a finding. Conflating them would let a
data choice fail a code claim, and would have parked a permanently-red check that everyone learns to
ignore. An all-local library contacts nothing at all: measured, one of the four green runs recorded
**0** external requests total (the count varies because thumbnails load lazily; the script assertion
does not vary).

---

## file:// is a dead end

Both blockers measured in the same run, because stopping at the first one would have left a reader
with a plausible and wrong fix ("rebuild it as the IIFE bundle").

```
file:// FINDING — shadowRoot never created (element did not upgrade)
  Access to script at 'file:///…/_viewer/archie-viewer.js' from origin 'null' has been
  blocked by CORS policy: Cross origin requests are only supported for protocol schemes: …

file:// DATA FETCH — a classic script fetching ./exhibits.json → ERR:TypeError: Failed to fetch
  Fetch API cannot load file:///…/exhibits.json. URL scheme "file" is not supported.
```

1. A `file://` page has an **opaque origin**, so an ES **module** script is CORS-fetched and refused.
   The bundle never parses; the element never upgrades.
2. Switching to the IIFE build (`dist-single`, which exists precisely for this) fixes (1) and **does
   not help**, because a published tree is inherently multi-file: `exhibits.json`, per-exhibit
   `manifest.json`, per-canvas `annotations.json`. `fetch` of a sibling file is refused at `file://`
   whatever the script's format.

**A self-replicating tree therefore requires an HTTP origin, and always will.** That is not a gap to
close — it is the boundary between two artifacts the project already has. The `file://` case belongs
to the single-file export (`apps/studio/src/single-file-export.ts`), which inlines the whole library
as base64 in one document for exactly this reason. The two should be described to users as what they
are: *a site you can host anywhere* and *a file you can email*.

The one avoidable footgun is `_viewer/`'s leading underscore, and it is already handled — see below.

---

## Numbers

Exact bytes, from the harness's own output, green vs `--no-viewer` on the same fixture:

| | files | bytes |
| --- | --- | --- |
| tree without the viewer | 544 | 21,112,539 |
| tree with the viewer | 555 | 22,094,510 |
| **delta** | **+11** | **+981,971** (+959 KB) |

Of that delta, **950,118 bytes (96.8%) is `_viewer/` itself**. `viewer.html` is 1,168 bytes and
`.nojekyll` is 0. The remaining ~31 KB is *not* viewer machinery: the `--no-viewer` baseline is
published with no `viewerBase` at all, so it emits no per-note "View on the image" and no per-section
"Read this part" links either — 275 such links across the eight pages in the green tree. Against a
tree published with a **hosted** `viewerBase` (the status quo), the real cost is the 950 KB plus 1 KB.

Wire cost, from `packages/archie-viewer/bundle-size.json` and a gz pass over `dist/`:

| | raw | gz |
| --- | --- | --- |
| `_viewer/` total (9 files) | 927.8 KB | 275.5 KB |
| **page load** (entry + static closure) | 30.1 KB | **38.9 KB** |
| the lazy reader chunk (OSD + pixi) | 802.8 KB | 228.4 KB |

**A reader who lands on the gallery and never opens an object pays ~39 KB gz.** The canvas engine
arrives only on an object open, because `element.ts` dynamic-imports `reader.ts` and `eagerGzKB`
enforces that boundary. This is the single strongest argument for Candidate A: the tree carries a
megabyte, and almost none of it is on the arrival path.

### Gate check

- **CI reader-payload budget** (`scripts/perf/readerrun.mjs --check`, `reader-budget.json`) measures
  arrival payload for `apps/viewer/dist` routes. **Unaffected, structurally**: the emission is opt-in
  and nothing in the repo passes `getViewerBundle` yet, so `apps/viewer/public/published/` is
  byte-unchanged (`git status` clean through the whole prototype), and nothing in the Astro routes
  references `_viewer/`. No tension to report, and nothing was loosened.
- **Embed ratchet** `node build.mjs --check`: `ok eager 38.9 → 39.4KB`, `ok total 274.9 → 275.5KB`,
  `ok single-file 274.5 → 275.1KB`. The prototype consumes `dist`, it does not change the embed; the
  ±0.5 KB is pre-existing drift on `main` since the baseline was recorded.
- `pnpm -r run typecheck` → `Scope: 6 of 7 workspace projects`, all Done, 0 errors.
- `packages/render-core` vitest: 98 files, **1271** tests (1260 before; +11 added, reconciled).

---

## Decisions this prototype makes, and the one it defers

**`viewerBase` for a self-contained tree: tree-relative, computed per page, and it OVERRIDES a hosted
`viewerBase` when both are given.** A self-contained tree that still links out is not self-contained.
Relative rather than absolute because the tree is relative-first (Archie-d6ad): it must keep working
moved, mirrored, renamed, or served from a subpath. The shell computes its library base as
`new URL(".", location.href)` and its route from `location.hash` for the same reason — nothing is
baked, so there is nothing to configure and nothing to get wrong at deploy time. Verified by
following the archival page's `../viewer.html#/{slug}` with a real click and letting the browser
resolve it.

**`.nojekyll` ships with `_viewer/`.** GitHub Pages runs Jekyll by default and Jekyll treats
`_`-prefixed top-level directories as its own (`_layouts`, `_includes`, `_data`, `_site`) and does not
copy them to the output. Without that file the bundle would 404 on precisely the host this feature is
aimed at, while working perfectly on every other host and in every local test — the worst available
failure shape. The repo wrote no `.nojekyll` before this (`grep -rn nojekyll` over the tree: empty),
and neither does quire. The underscore is kept because it is what guarantees `_viewer/` cannot collide
with an exhibit slug; `.nojekyll` is the price of that guarantee, and it is 0 bytes.

**Honestly unclosed: this was NOT tested on a live GitHub Pages deploy.** The ticket asked for local
*and* a scratch Pages repo; only local was done. So the Jekyll reasoning above is the documented
platform behaviour plus a 0-byte guard, not a measurement — and it is the one claim in this ledger a
reader should not take on my authority. It is cheap to close: push the baked tree to a scratch repo,
enable Pages, and load `viewer.html`. Worth doing **with `.nojekyll` deliberately removed first**, so
the trap is observed rather than assumed.

**An incremental republish does not rewrite the bundle.** The folder-autosave path republishes on
every save, and a ~1 MB rewrite per save is pure cost against bytes that cannot have changed. The
shell and `.nojekyll` are rewritten always (a few hundred bytes); a full republish is what refreshes
the bundle, so a viewer upgrade still lands. Pinned by a test in both directions.

**Deferred, deliberately: in-prose cites still resolve to the hosted `viewerBase`.** This is the one
place the design does not reach, and the reason is structural rather than an oversight. A cite is
rewritten **once**, into the note body, and that same body is then served to two documents at
different depths — the exhibit page at `{slug}/index.html` *and* the viewer itself at `viewer.html`,
which reads the rewritten body out of `annotations.json`. **No single relative string is correct for
both.** The page-level links do not have this problem because each page emits its own. Closing it
needs a root-absolute path derived from `baseUrl`'s pathname, which reintroduces exactly the base
coupling the tree-relative design removes. Stated at the call site in `site.ts`, not silently skipped.

---

## Recommendation

**Ship Candidate A, and make it the default for the GitHub-push sink.** The prototype is real code on
a branch with unit gates and a browser gate; the remaining work is wiring, not discovery.

Next steps, smallest first:

0. **Close the GitHub Pages hole** (above): one scratch repo, `.nojekyll` removed then restored. It is
   the only environment claim in this ledger that was reasoned rather than measured, and it is the
   environment the whole feature is aimed at.
1. **Wire `getViewerBundle` in Studio's publish flow.** Studio already dynamic-imports the embed for
   the single-file export (`import("@render/archie-viewer/single?raw")`,
   `publish-flows.svelte.ts:418`), so the ESM `dist` needs the same treatment — a lazy import of the
   9 files, kept off the startup path. That import shape is the one thing worth checking against the
   root bundle ratchet before it lands.
2. **Decide the default per sink.** GitHub push and folder export want it on. The `.archie.zip`
   probably does not — it is opened *by* a viewer, so carrying one is a megabyte of redundancy.
3. **Then, and only then, revisit the cite tension** (above). It is a real gap in "the tree is
   self-contained", but it is a gap in *one link class*, and it is the hard one; the deep links that
   readers actually follow from a citation — `#note-<logicalId>` on the archival page — are durable
   and unaffected.

Do **not** pursue `file://` for this artifact. It cannot work, the reason is the web platform's, and
the project already ships the right answer for that case.

---

## Reproduce

```sh
cd apps/viewer
pnpm exec vite-node ../../scripts/proto/self-replicating-publish.mts -- --port 4471
pnpm exec vite-node ../../scripts/proto/self-replicating-publish.mts -- --port 4471 --no-viewer   # RED
```

`--keep` leaves the baked tree in `/tmp` for inspection. Use a distinct `--port` per concurrent run;
the harness binds its own and fails rather than reusing one.
