# Thumbnail-gap mitigations

A completed audit (HEAD `f90afb3`) found eight ways an object can end up without a
usable thumbnail. The outright bugs are fixed and merged (`84f4740` viewer
map-motif conflation, `755252b` studio master-fallback / honest glyphs /
absent≠failed reads, `bc569f0` embed fallback-chain parity); this doc
covers only the **by-design** gaps — the ones where the current behavior is
intentional but leaves a visible hole, so closing it is a design choice, not a
patch. Each entry is a decision aid: what happens now, who it hurts, the options,
the pick, and the repo prior art the pick follows.

Gaps keep the audit's numbering for traceability, not priority.

> **Sequencing constraint.** Mitigations **3, 4, and 8** touch files that carry
> uncommitted WIP from another session — `apps/studio/src/ingest-flows.ts`,
> `packages/render-core/src/publish/site.ts`, `apps/studio/src/App.svelte`, and
> `apps/studio/src/publish-flows.svelte.ts` (the last two behind #8's publish
> plumbing). Do not start those three until that WIP lands and is committed;
> starting on the same lines guarantees a merge collision. The other five touch
> files that are clean at HEAD.

**Two audit citations were wrong and are corrected below.** Gap 5's viewer-cover
site is `packages/render-core/src/iiif/exhibits.ts:44`, not `apps/viewer/src/exhibits.ts:44`.
Gap 8's studio plates live in `apps/studio/src/ExhibitOverview.svelte` (no
`components/` segment) and `apps/studio/src/App.svelte:2099` (not `~1052` — line 1052
is the `thumbSrc` *deriver*; the CSS-background plate that lacks `onerror` is 2099).
Everything else verified as cited.

---

## The one pattern most of these share

Six of the eight gaps are the same shape: a thumbnail is a *pure optimization*, so
a missing one is treated as "nothing to show" and the code moves on silently. The
repo already has a name for why that is wrong — **corrupt ≠ empty; a failure must
never map to "absent" without a trace** (`.claude/rules/render-core-data-integrity.md`
§2). The read-side already honors it (`readAnnotations` skips-and-reports;
`getOptional` distinguishes 404 from torn). The thumbnail *write* and *derive*
paths do not yet, and that is the through-line of gaps 2, 3, 4, and 8. The
recommended fixes below pull those paths onto the same rule the read side follows:
**surface the miss, don't swallow it.**

---

## 1 — AV objects never get a raster thumbnail

**Now.** Ingest stores an audio/video file as an OPFS asset and returns
(`apps/studio/src/ingest-flows.ts:380-389`) — no poster or first-frame extraction,
unlike the image path just below it (which bakes a thumb at `:433-441`). At view
time `MediaThumbnail.svelte:29-35` leans on `<video src preload="metadata">` to
paint its own first frame; audio has no frame and renders a drawn-waveform motif
(`:37-39`) forever.

**Impact.** Video plates often paint solid black: `preload="metadata"` fetches
enough to know duration but frequently no keyframe, and it fires no `onerror`, so
the `failed` fallback never trips — a black rectangle, not the honest "couldn't
load" card. Audio is motif-only by design (acceptable). The published viewer is
worse than studio: the wall (gap 6) and any baked tree have no live `<video>` to
lean on at all.

**Options.**
- **A. Extract a poster frame at ingest** — decode the video in an offscreen
  `<video>` + `canvas.drawImage` at t≈0.1s, bake that JPEG through the existing
  `bakeThumbnail`/`saveThumbFile` path (`:434-441`), stamp `object.thumbnail`.
  Audio stays motif.
- **B. Keep runtime-only, harden the `<video>` path** — seek to a small offset and
  detect a black/empty frame, tripping `failed`. Fragile (black-frame heuristics),
  and does nothing for the baked tree.
- **C. Let the curator pick a poster** — a frame-scrubber in `AvEditor`. Best
  result, largest build.

**Recommended: A.** It reuses the image path's exact bake-and-persist plumbing, so
the poster flows through publish (gap 4) and the wall (gap 6) for free — a runtime
hack (B) helps neither. `MediaThumbnail`'s `imgSrc = object.thumbnail ?? …`
(`:13`) already prefers a baked thumb, so the view side needs no change. C is a
good follow-up once A exists.

**Effort.** M. **Files.** `ingest-flows.ts` (behind #3's WIP, since it edits the
same AV branch). **Prior art.** The image bake at `ingest-flows.ts:433-441`
(`bakeThumbnail` → `saveThumbFile` → `thumbnail` ref) is the template to copy;
`MediaThumbnail.svelte`'s `failed`-state `<img>` (`:24-28`) is the honest-error
idiom to keep as the fallback when extraction yields nothing.

---

## 2 — Remote / IIIF objects are never baked

**Now.** A remote or IIIF object carries no `object.thumbnail`; the grid derives
one at render time via `thumbnailUrl()`
(`packages/render-core/src/iiif/resolve.ts:120-137`), which appends
`/full/{w}/0/default.jpg` to a IIIF base. That URL 404s on IIIF **level-0** hosts
(static tiles, reachable now that Collection import brings arbitrary hosts) and on
non-IIIF extensionless URLs that don't classify as a service.

**Impact.** A broken `<img>` in every grid, rail, and overview plate for those
objects — and because the studio plates use CSS `background-image` (gap 8), no
`onerror`, so it is a silent blank, not the honest card.

**Options.**
- **A. Probe-and-fall-back at derive time** — before returning the upsized IIIF
  URL, `HEAD` it; on 404/501 return the known-good original source. This is
  *exactly* what `apps/viewer/src/og-image.ts:21-33` already does for cover
  unfurls (`probeUpsize`: HEAD with a 10s abort timeout, cache the promise, 404 →
  fall back, throw → stay optimistic). Lift that into a shared helper the grids
  call.
- **B. Bake remote sources at ingest** — fetch once, downscale, store a local
  thumb like a local import. Removes the runtime round-trip and makes the published
  tree self-contained (helps gaps 4, 6, 7), but pulls remote bytes on add (CORS,
  latency, the LARGE-MEDIA ceiling) and duplicates data the user chose to keep
  remote.
- **C. Both** — bake when the fetch succeeds, probe-guard as the fallback for the
  rest.

**Recommended: A now, C later.** A is small, has proven in-repo prior art
(`og-image.ts`), and stops the broken image immediately without touching the
ingest WIP. B is the right *eventual* answer for offline/portable (gap 7) but is
its own M-L project with a CORS story; fold it in once the ingest files are clean.
Do not hand-roll a second probe — extract `og-image.ts`'s `probeUpsize` shape into
a shared module and have both call it (the repo's anti-drift convention, ADR-0013,
which `og-image.ts`'s own header cites).

**Effort.** M (A) / L (B). **Files.** `resolve.ts` + a new shared probe helper (or
`og-image.ts` promoted); grid/rail consumers unchanged if the guard lives in
`thumbnailUrl`'s callers. **Prior art.** `apps/viewer/src/og-image.ts:21-39`.

---

## 3 — Bake errors are swallowed at ingest

**Now.** `ingest-flows.ts:442-444` wraps `bakeThumbnail` in a try/catch whose only
effect is `console.warn`; the import continues thumb-less. The surrounding comment
correctly argues a thumb failure must **not** block the import — that part is right.
What's missing is any *user-visible* signal that it happened.

**Impact.** A curator whose images consistently fail to bake (a codec the canvas
can't decode, an OOM on huge masters) sees a grid of fallback plates and no reason
why. The failure is real data-quality information written only to a console they
never open.

**Options.**
- **A. Count and surface** — tally bake failures across a batch and fold the count
  into the same `note` the import already returns (`:387-389`), e.g. "Added 40
  images; 3 couldn't be thumbnailed and will show a placeholder."
- **B. Per-object flag** — stamp `object.thumbnailFailed` and let the plate show a
  quiet "no preview" state distinct from "not yet loaded." More model surface for
  little more signal than A.

**Recommended: A.** It matches the module's existing return-a-`note` idiom and the
repo rule that a swallowed failure must leave a trace
(`render-core-data-integrity.md` §2) — without escalating a pure-optimization miss
into a blocking error. Keep the non-blocking catch; add the tally.

**Effort.** S. **Files.** `ingest-flows.ts` (**WIP-blocked** — same file and branch
as the fix under revision). **Prior art.** The batch-`note` return already in this
function (`:387-389`); the "surface the miss per item" policy in
`render-core-data-integrity.md` §2 and `readAnnotations`' skip-and-report.

---

## 4 — Publish silently drops thumbnail refs

**Now.** For each asset object, `publish/site.ts:427-439` deletes `next.thumbnail`
and re-adds it **only** if `getThumbnail` is wired *and* the bytes read back. Any
path with no `getThumbnail` callback — notably the viewer sample generator
(`apps/viewer/scripts/gen-published.mts:99`, which passes only `getAsset`) — ships
a tree with **zero** baked thumbs and no report. Missing *assets* get a report
(`missingAssets`, `:404-409`, surfaced by `gen-published.mts:102`); missing
*thumbnails* have no equivalent.

**Impact.** A published gallery can lose every thumbnail with the publish reporting
success. The wall (gap 6) then has nothing to show — image-index entries carry no
`source`, only the baked `thumbnail` (`iiif/image-index.ts:61-66`), so a dropped
thumb is unrecoverable at view time. The loss reads as "complete."

**Options.**
- **A. A `missingThumbnails` report, mirroring `missingAssets`** — when an object
  has `o.thumbnail !== undefined` but `getThumbnail` returns nothing (or isn't
  wired while thumbs were expected), push `{exhibitSlug, objectId, name}` onto a
  new result array. `gen-published.mts` warns per item, exactly as it does for
  `missingAssets` at `:102`.
- **B. Bake on the fly during publish** — if no thumb byte exists, derive one from
  the asset the publisher already has in hand (`:403`). Heavier (a decode in the
  publish loop) and conflates "author never baked" with "bake failed."

**Recommended: A.** It is the established pattern one function over
(`missingAssets`), it upholds "a torn write must read as *refused*, never
*complete*" (`render-core-data-integrity.md` §1 — the report is what makes the loss
legible), and it is the minimum that turns a silent drop into a stated one. B is a
reasonable later optimization but should not gate the report.

**Effort.** S-M. **Files.** `publish/site.ts` (**WIP-blocked**), `gen-published.mts`,
the studio publish result surface (`publish-flows.svelte.ts`, also **WIP-blocked**).
**Prior art.** `missingAssets` (`site.ts:404-409`) and its consumer
(`gen-published.mts:102`); `render-core-data-integrity.md` §1.

---

## 5 — Cover selection has no fallback in either app

**Now.** Studio's `coverOf` is the **first object, unconditionally**
(`apps/studio/src/gallery-data.ts:73-77`) — so an exhibit whose first object is
audio or video gets a glyph/motif cover even when it holds real images later.
Viewer covers are **authored-only**: `toExhibitsJson` copies `e.cover` when set and
omits it otherwise (`packages/render-core/src/iiif/exhibits.ts:44` — *corrected
path*), with no auto-derivation, so an exhibit with no authored cover renders a
title-text card.

**Impact.** The front door and the studio library show a text or motif card for
exhibits that are full of images — the single worst first impression, since the
gallery grid is the product's face.

**Options.**
- **A. Prefer the first *image* object** — in `coverOf`, pick the first object
  with `mediaType` image/undefined (i.e. not sound/video/map), falling back to the
  first object of any kind when there is no image. Mirror the same derivation in
  `toExhibitsJson` so the viewer auto-derives a cover from the first image object's
  thumbnail when `e.cover` is unset.
- **B. Explicit-cover field** — add `ExhibitMeta.cover` and let the curator choose;
  `coverOf`'s own comment (`:71-72`) already anticipates this ("when one lands,
  prefer it here"). Best UX, but a model + editor change.

**Recommended: A now, B later.** A is a few lines at the one site each app already
funnels cover choice through (`coverOf`, `toExhibitsJson`) and removes the
worst-case text card with no new model surface. `coverOf`'s comment reserves the
seam for B, so A does not paint us out of it.

**Effort.** S (studio) + S-M (viewer derivation). **Files.** `gallery-data.ts`,
`packages/render-core/src/iiif/exhibits.ts`. **Prior art.** `coverOf`'s own
single-decision-site comment (`gallery-data.ts:71-72`); `MediaThumbnail.svelte`'s
`kind` derivation (`:12`) for the image-vs-AV test to reuse.

---

## 6 — The "All images" wall turns AV and plain rasters into text tiles

**Now.** The viewer wall is built from `buildImageIndex`, whose entries carry
`{objectId, slug, title, thumbnail?, width?, height?}` and **no `source`**
(`iiif/image-index.ts:60-70`); `thumbnail` is set only when the published canvas
has one (`:61`). So the wall's only possible image is the baked thumbnail — every
AV object (no thumb, gap 1) and every plain external raster that was never baked
(gap 2) becomes a text tile. A plain raster is especially jarring: it shows a
picture in the *grid* (which derives via `thumbnailUrl`) but text on the *wall*
(which has no `source` to derive from).

**Impact.** The wall — pitched as "all images" — is visibly not all images, and the
grid/wall inconsistency reads as a bug.

**Options.**
- **A. Fix upstream (gaps 1 + 2)** — once AV objects and remote rasters carry baked
  thumbs, the wall fills in with no wall-side change. This is the real fix.
- **B. Carry `source` into the index** — add `source` to `ImageIndexEntry` so the
  wall can derive via `thumbnailUrl` like the grid. Closes the grid/wall gap for
  IIIF objects, but re-introduces the runtime 404 risk (gap 2) the wall currently
  dodges, and does nothing for AV.
- **C. Type-motif tiles on the wall** — reuse `MediaThumbnail`'s AV/map motifs for
  entries with no thumb, so the wall shows an honest "audio/video" plate instead of
  bare text.

**Recommended: A as the primary, C as the stopgap.** The wall's text tile is a
*symptom* of gaps 1 and 2; fixing those is the durable answer and needs no wall
change. Until they land, C makes the wall honest (a labeled motif beats raw text)
for a small cost. Avoid B — carrying `source` re-opens the runtime-404 hole on the
one surface that currently avoids it.

**Effort.** M (mostly inherited from 1 + 2; C is S). **Files.** none if A; wall
render + `MediaThumbnail` reuse if C. **Prior art.** `MediaThumbnail.svelte`'s
per-type motifs (`:22-48`) are already the honest-plate vocabulary to lift onto the
wall.

---

## 7 — Portable `.archie.zip` leaves an unresolvable thumbnail URL offline

**Now.** When a portable bundle is built, `rewriteThumbUrl` rewrites an embedded
`…/assets-thumb/{name}` reference to a `blob:` URL only if the thumb file exists in
the zip; if `mintThumbBlob` finds no `assets-thumb/` dir or file it returns `null`
and the URL is **left as-is** (`publish/portable.ts:98-124`). Left as-is means the
absolute published `https://…/assets-thumb/…` URL — which cannot resolve when the
`.archie.zip` is opened offline.

**Impact.** A portable gallery opened without network shows broken thumbnails for
every object whose thumb wasn't in the bundle (which, given gap 4, can be *all* of
them). The bundle's whole promise is offline self-sufficiency.

**Options.**
- **A. Fall back to the object's own asset** — when the thumb is absent, rewrite to
  the *master* asset's `blob:` URL (via the existing `mintAssetBlob`) instead of
  leaving the dead absolute URL. The plate shows the full image (heavier but
  correct) rather than nothing.
- **B. Guarantee thumbs are bundled** — fix gap 4 so the tree always carries the
  thumbs it references; then "absent" only happens on genuine corruption, and A
  becomes the corruption fallback rather than the common path.

**Recommended: B as the root cause, A as the guard.** Most missing-thumb-in-bundle
cases are gap 4 (thumbs never published) surfacing downstream — fix that and the
bundle carries what it points at. Keep A as the belt-and-suspenders fallback so a
genuinely-absent thumb degrades to the full image, never a dead URL — the same
"degrade, don't dead-link" instinct as the `?? url` pass-through the function
already uses for external thumbs.

**Effort.** S (A) — B is gap 4. **Files.** `publish/portable.ts`. **Prior art.**
`mintAssetBlob` / `rewriteAssetUrl` in the same file (`:85-90`) are the fallback
target; the "leave external URLs unchanged" contract (`:117-118`) shows the
existing degrade-gracefully seam.

---

## 8 — Studio plates use CSS `background-image` with no `onerror`

**Now.** Three studio plates paint the thumbnail as a CSS
`background-image` — the rail-collapsed plate (`ExhibitOverview.svelte:713`), the
list-row thumb (`ExhibitOverview.svelte:814`), and the App rail tile
(`App.svelte:2099`, deriving via `thumbSrc` at `:1052`). A CSS background cannot
fire `onerror`, so a broken remote-derived URL (gap 2) paints an empty box with no
fallback.

**Impact.** Every gap-2 failure inside studio is a silent blank rectangle rather
than the honest "couldn't load" card — the curator can't tell an empty exhibit from
a broken one.

**Options.**
- **A. Render an `<img>` with an `onerror` fallback** — the viewer already solved
  exactly this. `Gallery.svelte:35-38` (*"a CSS background-image can't fire
  onerror, so a 404'd cover was a dead rectangle… render an `<img>` and fall back to
  the exhibit's name"*) keeps a `failed` set and swaps to a text wash on error.
  Port that to the three studio plates.
- **B. Probe URLs before assigning them** (gap 2's approach) — complementary, not a
  substitute: even a probed URL can die between probe and paint, so the `<img>`
  fallback is still wanted.

**Recommended: A.** It is a verbatim in-repo pattern (`Gallery.svelte`) for the
identical problem, and it is the honest-error idiom `MediaThumbnail.svelte` already
uses (`:19,:24-28`). Do A **and** gap 2 (probe reduces failures, `<img>` catches the
rest).

**Effort.** S. **Files.** `apps/studio/src/ExhibitOverview.svelte` (clean),
`apps/studio/src/App.svelte` (**WIP-blocked**). Because App.svelte is under active
WIP, split this: do the `ExhibitOverview` plates now, the `App.svelte` rail tile
after the WIP lands. **Prior art.** `apps/viewer/src/components/Gallery.svelte:35-38`
(the broken-cover fallback, audit gap #10 — already fixed on the viewer side);
`MediaThumbnail.svelte:19-28`.

---

## Suggested order

1. **Now, clean files:** 2 (probe guard), 5 (cover fallback), 7-A (portable
   fallback), 8-`ExhibitOverview` half. Each is small, isolated, and removes a
   visible blank.
2. **After the WIP lands:** 3 (bake-error tally), 4 (`missingThumbnails` report),
   1 (AV poster), 8-`App.svelte` half — all gated on `ingest-flows.ts` /
   `site.ts` / `App.svelte` / `publish-flows.svelte.ts`.
3. **Falls out of the above:** 6 (the wall fills itself once 1 and 2 land; add the
   motif stopgap only if the interim text tiles bother anyone).
