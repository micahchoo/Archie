# TEND EXPLORE — desktop shell (tauri-shell) — 2026-07-20

Subsystem: `src-tauri/` (Rust host, `tauri.conf.json`, `capabilities/default.json`, CSP), the
Tauri fs seam app-side (`apps/studio/src/tauri-fs.ts`) over its contract
(`packages/render-core/src/fs/tauri.ts`), and Flatpak packaging
(`src-tauri/flatpak/*`). Adjacent web-app code is context only.

Read the two installed contracts first: `.claude/rules/tauri-csp.md`,
`.claude/rules/tauri-fs-seam.md`. No new code violates them (checked: atomic temp-then-rename in
`TauriFile.close`, `assertSafeName` on every `TauriDir` name-join, CSP still carries `unsafe-eval`
+ `https:`, `TauriFsBridge` two-implementer parity holds). Findings below are friction/surplus
*around* the shell, not the contracts themselves. `a09d` (native tauri-build smoke) already exists
elsewhere — not duplicated.

## Map facts (grounding)

- Rust is logic-light: menu (`lib.rs`) + GitHub device-flow/keyring/pack-push (`github.rs`, well
  unit-tested, 15 tests, token redaction proven). Frontend is a combined Studio(`/`)+Viewer(`/viewer/`)
  bundle (`scripts/build-tauri-frontend.sh`), `frontend/`+`gen/` are gitignored build artifacts.
- Storage model on desktop: the **working store is still OPFS** (`store.ts:38` `navigator.storage.getDirectory()`,
  unconditional, "Browser-only (OPFS)"). `TauriFilesystem` is used only for user-picked **folder bindings**
  (`folder-backend.ts`) and deploy staging goes through `plugin-fs` directly (`deploy-flows.svelte.ts:83`).
- Publish/deploy: JS (`deploy-flows.svelte.ts`) → Rust `gh_*` commands. Token stays in Rust/keyring (Q-12).

## Rung × friction/surplus ledger

### L1 Purpose (why it exists)
- **Friction:** `fs/tauri.ts` header claims "a native folder on disk is the canonical store, written
  in place" (the desktop analogue of FSA) — but `store.ts` keeps **OPFS canonical on desktop**; the
  native backend never backs the working store. `src-tauri/README.md:44-48` frames asset-protocol
  image loading as "the real remaining work / highest-risk remaining item," and it is genuinely
  unshipped (zero `convertFileSrc` in the tree). Two purpose-vs-code drifts.
- **Surplus:** Cargo/README model a full native canonical store + keyring "stay signed in" + one-pack
  device-flow publish — richer than the stated "logic-light webview host." (Mostly realized; noted for
  completeness.)

### L2 Behavior (what it does)
- **Friction (Strong):** `Publish.svelte:717` "Open my site" (primary success CTA) → `machine.openSite()`
  → `openUrl(result.url)` (the `*.github.io` site). `capabilities/default.json:24-27` scopes
  `opener:allow-open-url` to **exactly `https://github.com/login/device`** — every other URL is denied,
  and `publish-machine.svelte.ts:467` swallows the rejection (`.catch(()=>{})`). The button silently
  does nothing on desktop. (verificationUri open at :302 is the only allowed URL.)
- **Friction (Worth exploring):** keyring "stay signed in" (`gh_token_save/load`, `sync-secret-service`
  over `org.freedesktop.secrets`) almost certainly **fails inside the Flatpak** — `flatpak/*.yml`
  finish-args share no `--talk-name=org.freedesktop.secrets` / session bus. `gh_token_save` returns
  `false` → signed out every launch. Code + plan flag it open (Cargo.toml:35-36 "finalized in the
  packaging pass"; PUBLISH plan Q-E4 "deferred").
- **Surplus:** `TauriFilesystem` + `defaultLibraryRoot()` (a whole native backend) exist but no primary
  journey mounts them as the working store. Native-http `fetchRemoteAsBlobUrl` (bypasses webview
  CORS/redirect "Load failed") is used by **AV only** (`AvEditor.svelte:81`); remote images/IIIF get
  no such escape hatch.

### L3 Structure (how organized)
- **Friction:** none material. The seam split (headless core + app glue), the single untrusted-open
  module, and the two-implementer bridge are clean and rule-backed.
- **Surplus:** `defaultLibraryRoot()` (`tauri-fs.ts:36`) is a **dead export** — zero importers. The
  `fs:scope` + `assetProtocol` scope for `$APPDATA/**` has no consumer (nothing writes there; OPFS is
  canonical). `http:default` allows `http://**` (cleartext) though every caller uses `https:`.
  `opener:allow-open-url` is a one-URL "scope" the app has already outgrown.

### L4 Implementation (how built)
- **Friction:** `flatpak/digital.compost.archie.yml` finish-args miss the Secret Service D-Bus name
  (keyring, above). `flatpak/digital.compost.archie.metainfo.xml` has **no `<screenshots>` and no
  `<developer>`** — appstreamcli/Flathub will flag it; the app is not listing-ready. `lib.rs` menu +
  same-origin nav (`window.location.replace('/index.html')`) has no test and assumes the combined-
  frontend layout under `--base ./`.
- **Surplus:** `assetProtocol.enable=true` + `protocol-asset` cargo feature + `$HOME`/`$APPDATA` asset
  scope are wired, but **no `convertFileSrc` call exists** — a protocol capability with zero consumers.

## Issues / Directions — see returned JSON.

Fog: opener-via-portal inside the sandbox (unverified); `http://**` cleartext over-grant; whether
in-webview `<a target=_blank>` secondary links (commit/pages-settings/docs in Publish.svelte) open at
all under `--base ./`; metainfo homepage/release cadence.

## Adversarial verification — 2026-07-20 (workflow wf_19aab265-c48; one independent skeptic per finding)

- issues[0] "'Open my site' (and every non-login external link) is silently dead in the desktop app - opener scope allows one URL" — confirmed (Strong) → seeds Archie-2139.
- issues[1] "Flatpak 'stay signed in' will fail silently - keyring can't reach the Secret Service D-Bus name in the sandbox" — confirmed (Strong) → seeds Archie-18b4. Corrections: Cargo.toml keyring comment/dep is lines 33-37 (cited as 35-36); manifest finish-args span lines 17-25 (cited 17-24). Both trivial off-by-a-few; substance intact.
- issues[2] "Flatpak metainfo is not listing-ready - no screenshots, no developer" — corrected (Worth exploring) → seeds Archie-a53c. Corrections: 1) The claim "appstreamcli validate ... require[s] at least one screenshot" and that the file "fails the validation gate" is measured false: `appstreamcli validate` (AppStream 1.0.6, plain / --pedantic) PASSES with exit 0 on src-tauri/flatpak/digital.compost.archie.metainfo.xml — only two info-level notices (cid-maybe-not-rdns, developer-info-missing); missing screenshots is not flagged at all. The Flathub linter's own appstream check (`flatpak-builder-lint appstream`, v3.0.0) also passes, exit 0, same two infos. Only `--strict` fails (exit 3), and on those infos, not screenshots. 2) Consequently the finding's done-when ("appstreamcli validate passes with no errors") is already satisfied TODAY with zero changes — it is a broken acceptance criterion; the real gate for screenshots is Flathub's repo-level lint (appstream-missing-screenshots) / quality guidelines at submission time, which I could not run without a build. 3) `<developer>` missing is an info, not an error, in current appstream.
- directions[0] "The native desktop backend is built but the working store still rides OPFS blobs - the reliable path is used only for export" — corrected (Strong) → seeds Archie-683c. Corrections: 1) The "real remaining work" asset-protocol text is in src-tauri/README.md:44-48, not the root README.md (root README has no such section). 2) "Reliable path is used only for export" is slightly overstated: Tauri FolderBindings serve both the publish sink (publish-flows.svelte.ts:384) AND a one-shot open/import source (binding-store.svelte.ts:280 "loadLibrary ← FolderBinding.fs → replace OPFS project") — but in both cases the resident working store remains OPFS, so the substance is unchanged.
- directions[1] "Native-http CORS/redirect bypass is applied to audio only - remote images have no escape hatch" — confirmed (Worth exploring) → seeds Archie-8519.

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
     — no webview CORS, no WebGL taint. The minted URL is revoked on EVERY teardown path — normal
     `surface.destroy()`, OSD open-failed (createMount rejects before returning a surface), and the
     Canvas `{#key canvasId}` remount race (unmounted before createMount resolves) — so the fetched
     bytes never orphan (rev-native-fetch finding). The annotation target IRI stays the ORIGINAL remote
     URL, not the ephemeral blob.
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


