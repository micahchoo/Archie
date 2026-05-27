# Portable Viewer read-seam spike — FINDINGS

**Status:** QUARANTINED throwaway spike. NOT wired into any app build. Feeds **ADR-0010** (seam mechanism for the portable Viewer). Not in `pnpm-workspace.yaml` globs; installs into its own isolated `node_modules` via `pnpm install --ignore-workspace`.

**Question (CONTEXT 2026-05-27 "Portable Viewer", ADR-0008/0009):** all three entry vectors produce ONE `Filesystem` (a `ZipFilesystem`). How does the Viewer's read path consume it? The crux is MEDIA: embedded `{slug}/assets/{name}` bytes have no server to resolve their URLs.

## How to run

```
cd spikes/portable-viewer-seam
# fnm-managed Node v24 (system v20 is incompatible — project memory)
eval "$(fnm env)" && fnm use 24
pnpm install --ignore-workspace && pnpm rebuild esbuild   # one-time
node_modules/.bin/vitest run
```

**Result (both approaches, run 2026-05-27):**

```
✓ approach-s/sw-handler.test.ts (10 tests)
✓ approach-p/portable.test.ts  (6 tests)
Test Files  2 passed (2)
     Tests  16 passed (16)
```

Stack: vitest 2.1.9 + happy-dom 15.11.7, Node v24.16.0.

---

## Approach P — data-provider + blob URLs

`approach-p/portable.ts` (~174 functional LOC). `loadPortableExhibit(fs, slug)` reads the SAME data `published.ts` fetches, out of the in-memory `ZipFilesystem`, and mints `blob:` object URLs for embedded assets, rewriting image URLs to them, with a `revoke()` lifecycle.

### What works (proven at the data layer)
- **Data parity:** a published zip round-trips into the `PublishedExhibit` shape `published.ts` produces over HTTP — title, objects, `canvasIdByObject`, `annotationsByObject`, **plus** `readings` + `readingAnnotationsByObject`. (`portable.test.ts` test 1.) Note: core's `readPublishedExhibit` (`site.ts:287,306`) does NOT carry the readings registry — P had to re-implement the readings read like `published.ts:50,60` does, ~30 LOC of P's cost.
- **Media crux (object.source):** an `assets/`-embedded PNG resolves to a `blob:` URL on `object.source`; the blob carries the SAME bytes (verified via `node:buffer` `resolveObjectURL`) with `type: image/png`. (test 2.)
- **Media crux (note-body `m.url`):** a note body `Look ![](/assets/plate.png) here` has its `/assets/` token rewritten to a `blob:` URL; `splitNoteMedia(value).media[0].url` is a blob that reads back the embedded bytes — so `NoteMedia`/`NoteLightbox` work with NO component change. (test 4.) This is the extra surface S avoids; P pays it in the body-markdown rewrite (regex over `/assets/` tokens).
- **Zero sink change:** `thumbnailUrl(blobUrl)` returns the blob URL unchanged — asserted against the real core fn. (test 3.) Load-bearing prior art: `resolve.ts:41` + `resolve.test.ts:46-47` already pass `blob:`/`data:` through. So `ObjectGrid`/`Reader`/`MediaPlayer` need NO change.
- **Revoke lifecycle:** `revoke()` frees every minted URL. (test 5; mirrors `App.svelte:99`.)

### Media story
Universal: blob URLs work identically for `object.source` (grid/reader/player) and for note-body `m.url` (`NoteMedia`/`NoteLightbox`, fed by `splitNoteMedia`). P rewrites both — the canvas source AND `/assets/` tokens inside note-body markdown. No bootstrap, no separate context, no race.

### Complexity / LOC
~174 LOC, all pure data over the existing Filesystem seam. The cost concentrates in: (a) the readings re-read (core's reusable fn omits it), and (b) the note-body media rewrite (regex over markdown/HTML `/assets/` tokens) + the revoke bookkeeping.

### Browser-verify-owed
- A real `<img src="blob:…">` and `<video>`/`<audio src="blob:…">` actually PAINT (node proves bytes + mime, not the render).
- Memory ceiling: every asset blob is held in RAM until `revoke()`. Confirm a large-media library's peak — and that `revoke()` fires on nav/close before the next exhibit mints.
- OSD `type:'image'` accepts a `blob:` tile source in a real viewer.

---

## Approach S — Service Worker serves the Filesystem

`approach-s/sw-handler.ts` (~64 LOC, pure) + `approach-s/sw-bootstrap.ts` (~28 LOC, browser-only). The SW maps `${BASE_URL}published/<libraryId>/<path>` to bytes read out of a loaded `ZipFilesystem`, so `published.ts` + every component stay **UNCHANGED**.

### What works (handler logic, node-verified)
- **Routing:** `parsePublishedUrl` maps the published grammar → `(libraryId, relPath)`; non-matching URLs return `undefined` = SW fall-through to network. (`sw-handler.test.ts` tests 1-2.)
- **Serves the seam:** `manifest.json` → 200 + `application/json` with a real Manifest; embedded `assets/plate.png` → 200 + `image/png` with the SAME embedded bytes — **media works with `published.ts` untouched** (the URL the component requests is the published path; the SW resolves it). (tests 3-4.)
- **Honest 404:** an in-namespace file the archive lacks (e.g. `readings.json` on a base-only exhibit) → 404, which `published.ts:fetchJsonOptional` treats as null. (test 5.)
- **Cache isolation:** two DISTINCT archives registered under `LIB_A`/`LIB_B` in one origin each serve their OWN bytes for the same rel path — the LIB_B request returns LIB_B's manifest ("Different Exhibit"), never LIB_A's ("Voynich"). An unregistered library falls through (no fake-serve from a sibling). Cache key is namespaced by `libraryId` (`cacheKeyFor`) and surfaced as an `x-archie-cache-key` header. (tests 6-10.)

### Media story
Media + deep-links resolve "for free" — no URL rewrite, no blob lifecycle, because the network IS the seam and `published.ts`'s existing fetches just hit the SW. A `?src=` zip becomes HTTP-cacheable.

### Complexity / LOC
Handler is small (~64 LOC) BUT the real cost is in `sw-bootstrap.ts` and the deployment shape, which node CANNOT verify (~28 LOC of reference impl + a separate `sw.js` build artifact the app build must emit at the project-site root).

### Browser-verify-owed (cannot be node-verified)
- **SW scope on a GH PROJECT base path (`/repo/`):** the `sw.js` must be served from a path whose scope covers `/repo/published/*`. GH Pages can't set `Service-Worker-Allowed`, so `sw.js` must be emitted at `/<repo>/sw.js` and registered with `{ scope: import.meta.env.BASE_URL }`. **Unverified that this intercepts correctly on a live project site.**
- **"SW active before first fetch" race + SW-can't-read-the-opened-file:** the recipient opens the zip in the PAGE context; the SW runs in a SEPARATE worker context with no handle to those bytes. The page must `await navigator.serviceWorker.ready`, postMessage the zip bytes to the worker, await an ack, and ONLY THEN render — else the first `fetch('published/<lib>/manifest.json')` hits an empty registry → blank exhibit on first paint. **This ordering is the central, unverified hazard.**
- Real Cache API storage + eviction, and lifecycle on `?src=` reload / "open another library."

---

## Recommendation: **P (data-provider + blob URLs)**, with S deferred as a v1.1 option if deep-link-over-network is ever required.

### The 2-3 facts that drive it

1. **S's interception genuinely needs server-shaped behavior that the locked "no server" frame and GH Pages fight.** S's media win is real ONLY if the SW reliably intercepts `/repo/published/*` on a project site AND wins the activation race. Neither is node-verifiable; both are exactly the fragile, environment-dependent surface a static-publish platform should avoid. The SW *replaces* the missing server with a worker pretending to be one — strictly more moving parts than P, and the failure mode (blank exhibit if render beats handoff) is severe.

2. **P's blob-URL layer is cheap because the sinks already accept it.** `thumbnailUrl` passes `blob:` through unchanged (`resolve.ts:41`, `resolve.test.ts:46-47`), so `ObjectGrid`/`Reader`/`MediaPlayer`/`NoteMedia` need ZERO change once URLs are rewritten — proven green here. P's whole cost is ~174 LOC of pure, fully node-testable data code with no bootstrap, no second context, no race.

3. **Cache-isolation under S is solvable but it's S-specific work P never incurs.** Namespacing by `libraryId` works (tests 6-9), but it exists only because S puts library bytes behind a shared-origin URL space where cross-read is *possible*. P's blob URLs are origin-scoped and per-load by construction — isolation is free.

**Net:** P is the seam mechanism. It is fully proven at the data layer today, changes no components, and aligns with "no server." S's only unique advantage — `published.ts` literally unchanged + deep-link semantics over the network — does not outweigh its unverifiable, environment-fragile bootstrap on the exact deploy target (GH project pages). If a future requirement demands network-true deep-links into a portable library, revisit S as a v1.1 layer ON TOP of the P data path (hybrid), not as the v1 seam.

### Seam shape this implies
`published.ts` gets a portable branch: hosted → `fetch`; portable → `loadPortableExhibit(fs, slug)` (this spike's P). One file, the seam CONTEXT already names.
