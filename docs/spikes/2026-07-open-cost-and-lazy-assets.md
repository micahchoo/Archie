# Spike S2 — open cost, lazy masters, overview virtualization, fixture

Investigates SCALE-GALLERY-PLAN Phase 1.2 (lazy blob-URL minting) + 1.3 (virtualize the Studio
overview) and the Phase-wide verification fixture. Every claim cites `file:line`.

## Problem A — eager asset minting (Phase 1.2)

### What is minted, and where
`resolveAssets` (`apps/studio/src/App.svelte:123-142`) runs on every exhibit open. For **every**
asset object it fans out two `Promise.all` waves — masters via `readAssetUrl` and thumbs via
`readThumbUrl` (`:138`) — into two `$state` maps: `assetUrls` (master blob URL) and `thumbUrls`
(baked-thumb blob URL) (`:114-115`).

### What minting actually costs — measured against the code, not guessed
`readAssetUrl`/`readThumbUrl` → `readAssetFile` (`store.ts:201-209`) does
`dir.getFileHandle(name).getFile()` — a **lazy OPFS File handle, NOT a byte read** (comment
`store.ts:198-200`, `284-286`). `fileToObjectUrl` (`store.ts:214-217`) then `URL.createObjectURL`
on the File (or a zero-copy `slice` to restore MIME) — also no byte read. So per object the cost is
**two async OPFS handle lookups + two blob-URL registrations**, ×N objects, ×2 (master+thumb). The
bytes/decode cost is paid **downstream** when a consumer sets the URL as an `<img>`/`background-image`
or OSD source. The eager fan-out's real waste at scale: N master blob URLs held alive (each pins its
OPFS File) for objects never viewed, plus N handle lookups on the open critical path.

### All consumers (master vs thumb; sync vs awaitable)
| Consumer | Needs | Sync? | Site |
|---|---|---|---|
| `currentSource` → Canvas/AvEditor source | **master**, current object only | yes, at mount (gated on `assetsReady`) | `App.svelte:627`, `:1730`, `:1742`, gate `:1739`/`:1724` |
| `thumbSrc` (rail + overview + link-picker) | **thumb, falling back to master** | yes (`background-image`) | `App.svelte:630-635`; rail `:1404`; overview `thumbFor` `:1327`; link-picker `:1062,:1064,:1108` |
| ExhibitOverview plates | thumb (via `thumbFor`) | yes | `ExhibitOverview.svelte:239,:311` |
| ingest new import | master (registers own blob) | — | `App.svelte:1210` (`setAssetUrl`), `ingest-flows.ts:119` |

**Load-bearing finding:** only `currentSource` needs a master, and only for the *one* current
object. Every other consumer wants the **thumb**. The single snag is `thumbSrc`'s fallback
`thumbUrls[o.id] ?? assetUrls[o.id]` (`App.svelte:634`): when an object has **no baked thumb** it
paints the *master* blob. Every modern import bakes a thumb (`ingest-flows.ts:218-227`, best-effort),
so the fallback only fires for pre-baked-feature imports / already-tiny images.

### Masters-on-demand design
1. Keep thumbs eager — drop the master wave from `resolveAssets` (`:138` → resolve `readThumbUrl`
   only). Thumbs are small and every rail/overview plate needs them synchronously.
2. Mint the current object's master on view. Add `masterUrl` derived state that, on `current`
   change, awaits `readAssetUrl(slug, name)` into a single-slot cache and revokes the previous one.
   The Canvas mount is **already** gated (`assetsReady`, `:1739`); add a `masterReady` gate for the
   current object so the `{#key canvasId}` block waits for its master (mirrors today's `assetsReady`
   contract — no new UX). `setAssetUrl` on import (`:1210`) still pre-seeds the just-added master so
   the first-import OSD race stays closed (`ingest-flows.ts:113-120`).
3. **Race on rapid switching:** guard the async mint with the target object id; on resolve, only
   commit if `current.id` still matches (drop stale). Revoke the outgoing master URL on switch.
4. **Thumb-less fallback:** `thumbSrc`'s `?? assetUrls[o.id]` breaks once masters aren't eager (the
   map only holds the current master). Fix: on open, mint masters **only for the asset subset that
   has no `thumbnail` field** into a small `railFallbackUrls` map; `thumbSrc` falls back to that.
   Modern libraries → empty subset → zero cost. (Simpler than per-plate visibility minting; the
   thumb-less set is the rare legacy case.)
5. **Tauri vs browser:** the OPFS path is identical (`store.ts` uses `navigator.storage.getDirectory`
   throughout, e.g. `:243`); the fs-seam backend swap is below this layer. No divergence to design for.

## Problem B — overview virtualization (Phase 1.3)

Both modes render **all** plates eagerly: canvas-mode tableau `{#each objects}` under one CSS
`transform: translate/scale` (`ExhibitOverview.svelte:230,:238`); list-mode `<ul>` (`:304`).
Viewer's `ObjectGrid` already skips off-screen work with `content-visibility:auto` +
`contain-intrinsic-size: auto 360px` on grid rows (`apps/viewer/src/components/ObjectGrid.svelte`
`.grid > li`, ~`:69-73`).

**List mode — verdict: apply the treatment directly.** Rows are fixed-height flex items
(`.list li button`, thumb `.li-thumb` is `3rem × 2.25rem`, `ExhibitOverview.svelte:377`), so a
per-row `content-visibility:auto; contain-intrinsic-size: auto 3.5rem` (row + gap) is a clean copy
of the Viewer pattern — no measurement needed. Set it on `.list li`.

**Canvas mode — verdict: measure first, likely leave alone.** Plates are `width: 13rem` with a
`4/3 .frame` (`ExhibitOverview.svelte:381,:384`) in a `flex-wrap` tableau under a live
`transform` (`:230,:371`). `content-visibility` keys off viewport intersection, which *does* survive
a transformed ancestor, but intrinsic-size reservation interacts awkwardly with the scaled layer, and
pan/zoom repaints the whole transformed tableau regardless. **Capture before touching:** at 30 and 70
plates — (a) DOM node count under `.tableau`; (b) paint/raster time on a pan drag and a zoom step
(DevTools Performance, look for long "Composite Layers"/"Paint"); (c) whether frames come from
`background-image` **decode** (now cheap — thumbs, not masters, after Problem A) or transform
**repaint**. Hypothesis to confirm: once masters are lazy the tableau is fine at 70, so this is a
"prove it's not a problem" measurement, not a build task.

## Problem C — verification fixture

The seed exhibits (`apps/studio/src/seed-data.ts`) point at **remote IIIF** sources, so they do
**not** exercise the `/assets` OPFS master path at all (`isAsset` = `startsWith("/assets/")`,
`store.ts:115-117`). Testing Problem A needs a real OPFS-backed library.

**Cheapest scripted path — reuse the existing Playwright harness.** No e2e infra exists, but
`scripts/capture-screenshots.mjs` already launches chromium, boots the dev servers, and drives the
Studio UI by text anchors (`:17-60`). Clone that harness into `scripts/seed-fixture.mjs`:
1. Generate placeholder PNGs **in-page** via `OffscreenCanvas`/`canvas.toBlob` (big visible object
   number) — no disk image files, no canvas npm dep.
2. Feed them through the **real ingest** so OPFS assets + baked thumbs are written exactly as a user
   would: either `page.setInputFiles` on the folder input that fires `oncreatefromfolder`
   (`App.svelte:1294`, → `newExhibitFromFolder`, `ingest-flows.ts:280`), or `page.evaluate` calling
   the store writers directly. Build 2 exhibits × 30 + 1 × 10 = 70 objects.
3. **Persistent OPFS caveat:** OPFS is per-origin and ephemeral in a fresh Playwright context — run
   with `launchPersistentContext(userDataDir)` and hand the user that same profile dir to open for
   manual testing, or they re-run the seed in their own profile.
4. **Folder-bound copy:** the folder binding uses the native FSA directory picker
   (`binding-store.svelte.ts`), which Playwright can't drive. Recommend: the seed produces the OPFS
   library; the user performs the one-time folder-bind gesture manually, then autosave-touch testing
   proceeds against that folder (Phase 1.1 verification).

## 10-line summary

- **Masters-on-demand:** thumbs stay eager; drop the master wave from `resolveAssets`
  (`App.svelte:138`); mint the current object's master on `current` change into a single-slot cache
  (id-guarded against rapid-switch races, revoke-on-switch), gate the Canvas `{#key}` on a new
  `masterReady`. Only `currentSource` (`:627`) ever needs a master. Preserve `thumbSrc`'s
  thumb-less fallback (`:634`) by minting masters *only* for the no-`thumbnail` subset into a small
  `railFallbackUrls` map (empty for modern libraries). No Tauri/browser divergence.
- **List-mode virtualization:** apply Viewer's `content-visibility:auto` +
  `contain-intrinsic-size` to `.list li` directly (fixed-height rows) — no measurement.
- **Canvas-mode:** measure first (DOM count + pan/zoom paint time + decode-vs-repaint at 30/70
  plates); likely fine once masters are lazy — a "prove it" pass, not a rebuild.
- **Fixture:** clone `scripts/capture-screenshots.mjs`'s Playwright harness into a seed script that
  generates in-page placeholder PNGs and drives real ingest to write a 70-object OPFS library
  (persistent profile); folder-bound copy needs one manual FSA bind gesture.
