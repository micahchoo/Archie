# Republishing micahchoo/test as a self-contained working site (Archie-8d3d)

**Done, and verified against the live host.** `https://micahchoo.github.io/test/` now serves its own
interactive viewer of its own data: the gallery boots from `_viewer/` inside the tree, the object
deep-zooms from the tree's own DZI pyramid, `viewer.html#/documents-d` deep-links into the exhibit,
and **not one byte of script — nor any byte at all — comes from outside the tree.** Pushed as
`d710f64`; the fetch-back gate passes 9/9 against the served bytes and the browser drive 6/6.

The content is the user's own library, not a substitute. That is the one decision worth reading
before anything else.

---

## What the site held before

Fetched 2026-07-27 from the live host, before any change (`f971414`, "Publish via Archie",
2026-07-26T23:59:14Z):

| | |
| --- | --- |
| library | `demo` — "Archie Library" |
| exhibits | 1 — `documents-d`, "Documents (D)" |
| objects | 1 — `01KXZPYZYVTKDA25GTZC3AQMZ3`, a 5184×3456 JPG with a 412-tile DZI pyramid |
| annotations | 0 published heads; 1 logical note in the history sidecar (see [the tombstone](#the-four-strings-that-remain)) |
| generation | `36anb9` |
| `viewer.html` | **404** |
| `_viewer/` | **404** |
| `.nojekyll` | **404** |
| every absolute id | `https://archie.demo/…` |

So the tree was archival-only and its ids pointed at a host that does not exist — the failure
`ledgers/TRACE-publish-base-url-2026-07-26.md` traces to `baseUrl` being left at `WORKING_IRI_BASE`
(`publish/working.ts`, the Studio's internal IRI namespace). A reader landing there got a static page
whose canonical link, `og:url`, IIIF canvas ids and collection entries all named `archie.demo`, and
no way to open the image at all.

## No content was substituted — the tree round-trips

The brief expected the authoring library to be unreachable (it is: Studio's browser OPFS) and
authorised publishing the repo's seed content in its place. That substitution turned out to be
unnecessary, and skipping it is why the before/after below is a like-for-like comparison rather than
a demonstration.

**The published tree is itself a readable source.** `loadLibrary` (`publish/site.ts:857`) is the
documented inverse of `publishLibrary`, and `scripts/proto/self-replicating-publish.mts` already
drives it against a published tree on disk. So the fix reads the user's own live tree back, and
re-publishes it at the base it is actually served from. Nothing was invented, nothing was dropped:
one exhibit, one object, 412 tiles, four annotation revisions — in, and out.

Two things `loadLibrary` deliberately drops, and each had to be handed back:

- **`tileSource`** (`site.ts:846`). `recoverAssetSources` deletes it when inverting a published
  `{base}{slug}/assets/{name}` source back to the working `/assets/{name}` form — correct, because
  its `filesPath` names the old origin. Left dropped, the republish ships **no deep zoom**: OSD falls
  back to the single 5.4 MB master. `scripts/republish-tree.mts` therefore supplies a `tileObject`
  that **re-uses the pyramid already in the tree** — 412 tiles read off disk, descriptor recovered
  from the old manifest's `archie:tileSource` — rather than re-slicing, which would need
  OffscreenCanvas and is browser-only. publish re-stamps `filesPath` at the new base (`site.ts:536`).
- **`thumbnail`** (`site.ts:847`), same mechanism. Left dropped, `wantThumbs` (`site.ts:509`) never
  opens, `assets-thumb/` never ships — while `exhibits.json`'s `cover` round-trips independently and
  keeps naming a file in it. A dangling cover on the gallery card.

Neither would have failed a build, a typecheck, or `verify-publish`. Both are the shape this repo's
rules keep naming: the gate answers its own question correctly, and the artifact is still wrong.

## The gate, in order, before the push

**1 — bake.** `scripts/republish-tree.mts`, base `https://micahchoo.github.io/test/`:

```
reusing published pyramid documents-d/01KXZPYZYVTKDA25GTZC3AQMZ3-…JPG_files — 412 tiles
base        https://micahchoo.github.io/test/
exhibits    1 — documents-d(1 obj)
annotations 4 record(s) carried
pyramids    1 reused; viewer bundle 10 files
written     438 files / 8511272 bytes
generation  1dj4fhz
```

No missing assets, no broken links, no incomplete canvases.

**2 — fetch-back, against the baked directory.** `node scripts/verify-publish.mjs /tmp/…/baked
--generation 1dj4fhz` → **9/9, exit 0.**

**3 — browser drive.** `scripts/drive-published-tree.mjs` (new — see [why](#a-second-harness)) against
a bare static server, **10/10**:

```
PASS  viewer.html ships in the tree — present
PASS  _viewer/ carries the embed entry — present
PASS  .nojekyll ships beside _viewer (GitHub Pages runs Jekyll) — present
PASS  the exhibit page links to the TREE's viewer, relatively — ../viewer.html#/documents-d
PASS  the tree's own bundle boots and renders the gallery — 1 exhibit card(s)
PASS  a deep-zoom canvas mounts from the tree's own tiles — .openseadragon-canvas present (1 object(s) in the grid)
PASS  deep zoom is TILED — the tree SERVED DZI pyramid tiles, not one flat master — 32 tile(s) served 2xx, e.g. …_files/7/0_0.jpg
PASS  viewer.html#/documents-d deep-links into the exhibit — landed on documents-d's object grid
PASS  the archival page's relative link reaches the viewer — http://127.0.0.1:4492/viewer.html#/documents-d
PASS  NOT ONE BYTE of script comes from outside the tree — 0 external scripts
```

Red-greened in both directions, and **repeated 6/6 unchanged** — one green run is one sample
(`[[a-green-run-is-one-sample]]`):

| control | result |
| --- | --- |
| pyramid deleted from the tree | **FAIL 9/10** — "ZERO tiles served", 50 tile 404s named |
| `getViewerBundle` omitted (`--no-viewer`) | **FAIL 1/10** — the surviving PASS is vacuous (0 requests) |

**4 — `archie.demo` scan over all 438 files.** Not zero. Four occurrences, one file, and they are
the subject of the next section.

## The four strings that remain

`grep -ro archie.demo` over the baked tree returns **4**, all in
`documents-d/annotations/history/01KYFYYBSC9R42PBEK0HY0GQVP.json`, all the `target.source` of the
four revisions of one logical note. Read the record before judging it:

| rev | body | target |
| --- | --- | --- |
| v1 | — | `archie.demo/documents-d/canvas/01KXZPZ55DVMB2DNHCKFWKFS4A` |
| v2 | `"asdasdad"` | same |
| v3 | `"asdasdad"` | same |
| v4 | — · **`archie:deleted: true`** | same |

**The head revision is a tombstone: the user deleted this note.** Its target object
`01KXZPZ55DVMB2DNHCKFWKFS4A` appears nowhere else in the tree — not in the manifest, not in
`images.json`, no canvas directory, no asset bytes — in the live tree or the new one. So the string
denotes a canvas that does not exist at *any* origin.

`rebaseCanvasId` (`iiif/canvasid.ts`) leaves it alone on purpose. It rebases only IRIs that provably
denote one of this exhibit's own canvases; the tail here is not an object id in this library, so it is
returned untouched. That refusal is the documented contract — *"not a fuzzy match"* — and it is
correct: rewriting the origin would forge a live-looking pointer for a deleted note at a canvas that
still would not resolve. Deleting the record instead would destroy the tombstone the merge path reads.

So the gate's *intent* — no served surface names the dead host — is met, and its literal wording is
not. Stated plainly rather than quietly re-scoped: **0 occurrences on any rendered or fetched
surface; 4 in one deleted note's revision history, inert at any origin.** The published heads page
carries 0 items and the viewer draws 0 regions, measured both before and after.

## Live verification

Pushed `d710f64` to `main` (Pages source: `main`, path `/`, `build_type: legacy`). The tree that went
up was checked `diff -r` byte-identical to the tree that passed the gates — a correct action and an
unverified one feel the same from inside.

Pages served the new generation after **~20 s** (two polls). Against the live host:

```
$ node scripts/verify-publish.mjs https://micahchoo.github.io/test/ --generation 1dj4fhz
PASS  marker: archie.json is a valid current-schema Archie marker — generation=1dj4fhz
PASS  marker: generation matches the publish step's own report — expected=1dj4fhz
PASS  gallery: exhibits.json parses — library.title=Archie Library, 1 exhibit(s): documents-d
PASS  slug documents-d: manifest + annotation pages parse (readExhibitTree) — 1 object(s), 0 reading(s)
PASS  slug documents-d: annotation heads present — 0 base + 0 reading-scoped = 0 total
PASS  slug documents-d: index.html non-empty and carries the exhibit title — 3334 bytes
PASS  library: total annotation heads across all exhibits — 0
PASS  library: root index.html non-empty and carries the library title — 2361 bytes
PASS  archie.demo scan: no occurrences anywhere in the served tree — scanned 5 file(s), 0 occurrence(s)
9/9 checks passed
```

And the browser, against the real host — **6/6**, with the number that matters: **0 external requests
of any kind**, not merely 0 external scripts.

```
PASS  the tree's own bundle boots and renders the gallery — 1 exhibit card(s)
PASS  a deep-zoom canvas mounts from the tree's own tiles — .openseadragon-canvas present
PASS  deep zoom is TILED — the tree SERVED DZI pyramid tiles — 32 tile(s) served 2xx
PASS  viewer.html#/documents-d deep-links into the exhibit — landed on documents-d's object grid
PASS  the archival page's relative link reaches the viewer — https://micahchoo.github.io/test/viewer.html#/documents-d
PASS  NOT ONE BYTE of script comes from outside the tree — 0 external scripts (0 external request(s) total)
```

The only non-2xx on the live site is `documents-d/readings.json` → 404, three times: the optional
readings sidecar, absent because this exhibit has none. `loadLibrary` reads it with `getOptional`,
where 404 means *absent*, and the exhibit renders. Benign, and named here so the next reader does not
have to re-derive it from a bare "404" in the console.

## `.nojekyll`: half the question is now measured, and half is not

e09d shipped `.nojekyll` on documented Jekyll behaviour plus a 0-byte guard, and flagged that it had
never been tested on a live Pages deploy. **Measured now:** with `.nojekyll` present, GitHub Pages
serves `_viewer/` normally —

```
200  _viewer/archie-viewer.js     31059 bytes   application/javascript
200  _viewer/reader-LOZCY66W.js  822106 bytes   application/javascript
200  viewer.html                   1168 bytes   text/html
200  .nojekyll                        0 bytes
```

— and the embed boots from those bytes in a real browser, which is the deliverable.

**Not measured: whether removing it breaks anything.** That is the counterfactual e09d actually asked
for, and it needs a deploy that deliberately breaks the live site. The probe commit was written and
its push **denied by the permission system** — correctly, since "republish micahchoo/test" does not
grant "deliberately break micahchoo/test". The local clone was restored and re-checked byte-identical
to the verified bake; remote `main` never moved off `d710f64`.

So the honest statement is: *`.nojekyll` present ⇒ `_viewer/` serves, on legacy-build Pages, verified.*
Whether it is load-bearing or merely harmless is still open, and still cheap to close **with an
explicit go-ahead** — one commit removing it, one poll, one commit restoring it, ~2 minutes of
degraded site. Worth doing on a scratch repo rather than this one.

## A second harness

`scripts/drive-published-tree.mjs` is new. `scripts/proto/self-replicating-publish.mts` asserts nearly
the same things, but it **bakes its own fixture tree as step one**, so it cannot be aimed at the
artifact about to be pushed, nor at a live host. This one takes `--dir` or `--url` and asserts against
exactly those bytes. Two things it does that the prototype does not, both of which were forced by
being wrong first:

**It asserts deep zoom is TILED, off served responses.** A canvas element appears whether OSD is
deep-zooming a pyramid or showing one flat master, so `.openseadragon-canvas present` — the
prototype's assertion — cannot tell working deep zoom from the degraded fallback that a naive
round trip produces. The first version of the new assertion counted tile **requests** and scored
**50 tiles GREEN against a tree whose pyramid had been deleted**: OSD asks for whatever its descriptor
promises, so a request count measures the manifest, never the bytes. Counting 2xx **responses** fails
correctly. Found by red-greening the assertion rather than by reading it.

**It can rewrite the deploy origin to the local tree.** A published tree's `tileSource.filesPath` and
canvas image ids are absolute at the deploy base — that is what IIIF ids are for. Serving the baked
tree at `127.0.0.1` therefore leaves those pointers aimed at the *real* host, and the first local run
scored a green "TILED" off **32 tiles fetched from the live, still-broken site**. It measured
production. `--rewrite-origin` fulfils those requests from the local directory instead, so a file the
artifact lacks 404s rather than being quietly satisfied by the host. The 50 tile 404s in the red
control are what prove the interception is real.

Both are `[[viewer-e2e-shared-port]]`'s question — *did this run against my bytes?* — arriving in a
shape that rule does not name: not a stale server, but an **absolute URL inside the artifact** routing
the browser away from the thing under test. Worth carrying: when a fixture contains absolute
production URLs, serving it locally does not make it local.

## One thing to hand back to Archie-fde8

`verify-publish`'s check 7 is labelled *"archie.demo scan: no occurrences anywhere in the served tree"*
and its detail line says *"scanned 5 file(s)"*. Both were on screen together in every run above. The
scan is deliberately scoped — its comment names the marker, the gallery, each exhibit's manifest and
static page, and the landing page, i.e. the four fields Archie-3504 identified as carrying an absolute
URL — and that scope is a good one. But "anywhere in the served tree" is 438 files here, not 5, and
the history sidecar is served too. **The scan did not see the four occurrences the raw grep found.**

Nothing is wrong with the check; the label overclaims its subject, in the specific way
`[[post-review-fixes-are-unreviewed]]` §1 describes — a probe whose scope is implicit reports a narrow
answer with the confidence of a broad one. Suggested: say *"the four absolute-URL surfaces"* in the
label, keep the file count in the detail, and either extend the scan to the whole tree or state in the
comment that the annotation sidecars are out of scope and why.

## Reproduce

```sh
git clone https://github.com/micahchoo/test /tmp/live
cd apps/viewer && pnpm exec vite-node ../../scripts/republish-tree.mts -- \
  --src /tmp/live --out /tmp/baked --base https://micahchoo.github.io/test/
node scripts/verify-publish.mjs /tmp/baked
node scripts/drive-published-tree.mjs --dir /tmp/baked --port 4492 \
  --rewrite-origin https://micahchoo.github.io/test/
node scripts/drive-published-tree.mjs --url https://micahchoo.github.io/test/
```

Red controls: `--no-viewer` on the bake (1/10), or `rm -rf /tmp/baked/documents-d/*_files` (9/10).
A distinct `--port` per concurrent run; the harness binds its own and fails rather than reusing one.
