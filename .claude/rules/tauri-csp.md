---
scope: src-tauri/tauri.conf.json
tags: [tauri, csp, security, pixi, annotorious]
priority: high
source: hand-written
---

# Tauri CSP must keep `script-src 'unsafe-eval'`

The `app.security.csp` in `tauri.conf.json` **must** include `script-src 'self' 'unsafe-eval'`.

**Why:** Archie's annotation layer is `@annotorious/openseadragon`, which renders via
**PixiJS 7** (a bundled transitive dep — see `apps/studio/dist/assets/Canvas-*.js`). PixiJS
compiles WebGL shaders with `new Function()`, which a CSP without `'unsafe-eval'` blocks —
the webview then throws *"current environment does not allow unsafe-eval"* and the annotation
canvas fails to render. Archie never instantiates PixiJS itself (Annotorious does, internally),
so the `@pixi/unsafe-eval` module is **not** a usable fix here — allowing eval in the CSP is.

Also keep `worker-src 'self' blob:` (PixiJS asset loader workers).

## `img-src` / `media-src` / `connect-src` must allow `https:`

Archie is an image-annotation tool: the default Voynich seed loads folios **directly from a
remote IIIF service** (`apps/viewer/fixtures/voynich.ts` → `https://collections.library.yale.edu/iiif/2/...`),
and users add images / IIIF manifests / audio by arbitrary URL (`ingest-flows.ts`, `iiif-import.ts`).
OpenSeadragon fetches `info.json` (connect-src) and tiles (img-src); wavesurfer streams remote audio
(media-src). Without `https:` in those directives the canvas throws *"Couldn't load this media item."*
Keep `https:` on `img-src`, `media-src`, `connect-src` — but NOT on `script-src` (remote **data** is
fine; remote **code** is not).

The CSP is compiled into the binary by `tauri::generate_context!`, so any change requires a
`tauri build` + Flatpak rebuild to take effect. Don't tighten `script-src` without testing the
annotation canvas in the packaged app.

## `https:` is the FALLBACK; the native-http bridge is the escape hatch (Archie-fada)

Webview `fetch`/`<img>`/XHR under this CSP still enforce **CORS** and the webview's redirect rules, so
a CORS-restricted / 302-redirecting host fails even with `https:` present. For that class, remote
**images** and a IIIF **info.json** now route through Tauri's native http (`apps/studio/src/tauri-fs.ts`
→ `fetchRemoteAsBlobUrl` / `fetchRemoteJson`), injected `isTauri()`-gated into the ingest dimension
probe and the `@render/mount` `resolveOsdTileSources` seam. This does **not** relax the CSP: on
desktop every http(s) image/info.json is now routed through native fetch (the webview path is the
*fallback*, taken only when the native fetch throws), and on web the webview path is the sole path —
so keep `https:` on `img-src`/`media-src`/`connect-src`; the bridge is additive, not a replacement.

One CSP fact the bridge is shaped around: `connect-src` allows `https:` but **not** `blob:`, so a
webview `fetch()` of a `blob:` URL is refused. That's why `info.json` is fetched as **parsed JSON**
(`fetchRemoteJson`, handed to OSD as a data tile source) rather than the image trick of
`fetchRemoteAsBlobUrl` + `fetch(blobUrl)`. IIIF **tiles** deliberately stay on the webview `<img>`
loader (per-tile native fetch = one IPC per tile, disproportionate) — see
`ledgers/TEND-EXPLORE-tauri-2026-07-20.md` for the full reasoning.
