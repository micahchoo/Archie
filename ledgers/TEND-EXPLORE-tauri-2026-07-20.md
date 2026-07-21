# TEND-EXPLORE-tauri — 2026-07-20 (Archie-fada)

Native-http bridge, wired past AV. Findings + the tiles decision, from wiring
`fetchRemoteAsBlobUrl`/`fetchRemoteJson` (apps/studio/src/tauri-fs.ts) into the remote-image ingest
path and the OSD IIIF load path. Base: `main` @ `3a4d776` (fleet base), branch `wf/native-fetch-images`.

## The problem the bridge exists for

The packaged webview enforces CORS and its own redirect rules on `fetch` / `<img>` / XHR. A
CORS-restricted or 302-redirecting host (archive.org → a mirror; some institutional IIIF) fails
"Load failed" / open-fails. `fetchRemoteAsBlobUrl` (Tauri `plugin-http`, native, no webview CORS)
sidesteps it by returning same-origin `blob:` bytes. Before this ticket only `AvEditor.svelte` used
it — remote **images** and **IIIF** still rode the webview loader.

## What was wired (three seams, one contract)

The platform split is unchanged: `apps/studio/src/tauri-fs.ts` is the ONLY place `@tauri-apps/*` is
touched, its imports are literal dynamic `import()`s that never run on web (`isTauri()` false), and
every seam activates ONLY under the existing `isTauri()` idiom. Web builds are byte-identical.

1. **Remote-image ingest (dimension probe).** `ingest-flows.ts#imageDims` is the fetch that pulls
   remote image bytes in the add-by-URL flow (`addObject` / `addUrlObjects`). It was a bare
   `new Image().src = url` → `onerror`→`null` on a CORS host. Now: when `ctx.fetchRemoteAsBlobUrl` is
   injected (Tauri only) and the src is `http(s)`, pull the bytes natively → probe the same-origin
   `blob:` URL → revoke it. Local/`blob:`/`data:` and the web build take the unchanged `<img>` path; a
   native-fetch throw falls back to it, so it is never worse than before.

2. **OSD image + IIIF load.** New pure seam `@render/mount#resolveOsdTileSources(ts, nativeFetch?)`
   (extracted from `createMount` so it is unit-testable without a real OSD/DOM). The studio injects a
   `NativeFetch` `{ toBlobUrl, json }` (App.svelte, `isTauri()`-gated) threaded App → Canvas.svelte →
   `createMount`. The web viewer never sets the prop.
   - **image** (a plain remote `http(s)` image, incl. IIIF full-image URLs and most manifest imports):
     native-fetch the bytes → a `blob:` URL → OSD `{type:"image"}`. OSD `<img>`-loads same-origin bytes
     — no webview CORS, no WebGL taint. `createMount` revokes the minted URL on `destroy()`. The
     annotation target IRI stays the ORIGINAL remote URL, not the ephemeral blob.
   - **iiif** (an info.json service base, e.g. the default Voynich seed): native-fetch + parse the
     `info.json`, hand OSD the parsed object as a DATA tile source (OSD `determineType` →
     `IIIFTileSource`, no second webview fetch). Restores the OPEN of an info.json a webview XHR can't
     reach.

3. **CSP interaction (why info.json returns JSON, not a blob).** The compiled CSP (`tauri.conf.json`)
   allows `blob:` on `img-src`/`media-src` but NOT on `connect-src`. So a remote **image** can be a
   `blob:` URL (img-src) but an **info.json** can't be routed as `fetchRemoteAsBlobUrl` + `fetch(blob)`
   — the webview `fetch` of the blob would be refused by connect-src. `fetchRemoteJson` returns the
   parsed value straight from native http, sidestepping connect-src entirely. CSP is unchanged;
   `.claude/rules/tauri-csp.md` got a cross-reference to this escape hatch.

## The tiles decision — info.json native, tiles stay webview (reasoned partial)

The ticket allows "info.json/manifest fetch via the bridge and a documented reason tiles must stay
webview-fetched." That is what landed. Rationale:

- **Per-tile IPC is disproportionate.** OSD's tile loader (`downloadTileStart`, openseadragon@5.0.1)
  sets `image.src` per tile; overriding it to native-fetch each tile costs **one Tauri IPC round-trip
  per tile** — dozens per deep-zoom viewport, hundreds across a pan/zoom session — for bytes the
  webview already fetches directly from any CORS-open tile host. `loadTilesWithAjax` + a global
  `makeAjaxRequest` override would still be webview XHR (same CORS), not native, so it buys nothing.
- **info.json is the high-value, single-fetch hop.** It is one small document whose failure open-fails
  the WHOLE surface; fetching it natively is one IPC and unblocks the common redirect/CORS case.
- **Residual gap, documented:** a host that serves info.json but also CORS-blocks its tile `<img>`
  loads still shows blank tiles. This is unchanged from before (the pre-existing
  `crossOriginPolicy:"Anonymous"` posture) — not a regression. A full fix would need a native tile
  loader (the per-tile IPC cost above) or a local DZI bake; both are out of scope. The default Voynich
  IIIF host (Yale) sends CORS headers, so its tiles load webview-side today and continue to.

## Proven vs OWED

- **Proven (unit + type gates):** `resolveOsdTileSources` routing/fallback (`mount-fetch.test.ts`, 8
  tests), `fetchRemoteJson`/`fetchRemoteAsBlobUrl` ok/!ok contract (`tauri-fs.test.ts`, +4), the
  `imageDims` native/web/blob-guard/fallback paths (`ingest-flows.test.ts`, +4). Studio typecheck +
  svelte-check (0/0) + render-mount typecheck clean.
- **Proven (web build):** browser-driven remote-image add still ingests identically (web path
  untouched; `nativeFetch` undefined off-Tauri).
- **OWED to the a09d desktop smoke:** the DESKTOP runtime claim — that native fetch actually opens a
  CORS-restricted image / info.json in the packaged webview — cannot be proven without a packaged
  build. The code + unit tests stand in for it; the packaged-app proof is owed, same posture as the
  streaming-zip sink and the FSA picker path.
