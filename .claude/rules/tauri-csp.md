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
