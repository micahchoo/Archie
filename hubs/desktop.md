---
scope:
  - "src-tauri/**"
  - "apps/studio/src/tauri-fs.ts"
  - "apps/studio/src/resident-store.ts"
  - "apps/studio/src/folder-native.ts"
  - "packages/render-core/src/fs/tauri.ts"
  - "packages/render-core/src/fs/tauri.test.ts"
  - "docs/plans/native-canonical-store.md"
  - "docs/plans/folder-av-originals.md"
updated: 2026-07-28
---
# desktop
> *How is the desktop app different?*

The Tauri v2 shell (`src-tauri/`) bundles Studio+Viewer into a native window; the main app-side
Tauri touchpoint is `apps/studio/src/tauri-fs.ts` (fs seam); two more `isTauri()`-gated dynamic-import
sites exist — external links (`Publish.svelte`) and GH-Pages deploy (`deploy/deploy-flows.svelte.ts`) (dynamic-imports `@tauri-apps/*`, gated by
`isTauri()`, so the web build is byte-identical). Three things a desktop task must know: the
capability manifest (`src-tauri/capabilities/default.json`) is a second, independent failure
surface vitest cannot see; the working store is native-folder-canonical now, code-complete but
UNVERIFIED packaged (Archie-9ece); and `scripts/check-tauri-capabilities.mjs` (`pnpm
capabilities:check`, CI's unit-scripts job) is the one gate that catches the class that has bitten
twice already.

## Binding rules
- [[tauri-csp]] — CSP must keep `script-src 'unsafe-eval'` (PixiJS shader compile) and
  `worker-src 'self' blob:` (both Annotorious AND Archie's own dzi/bake workers — the second one
  fails SILENTLY, re-freezing import UI with no visible error); `img-src`/`media-src`/`connect-src`
  need `https:` for remote IIIF, but native fetch (below) is the fallback for CORS/redirect hosts.
- [[tauri-fs-seam]] — `TauriFilesystem` must re-earn what browser handle APIs give free: atomic
  commit via same-dir temp-then-rename in `close()`, and `assertSafeName` blocking `..`/`/` traversal
  on every name-join (an untrusted exhibit slug from a `.archie.zip` is the concrete threat).

## Decisions
- Archie-91e7 — capability manifest omitted `fs:allow-rename`; **every desktop write failed at its
  commit point**, 100% of authored work lost with the UI showing "Retry save" / 25e6d67
- Archie-7b48 — scope globs don't match dot-led path components (`.bake-schema`,
  `.archie-cache/`); asset saves rejected AFTER bytes landed, misreported as "free some space" / 891e6f7
- Archie-be3a — `http:default` cleartext `http://**` grant removed (merged to main 2c26708); native-http
  bridge is `https://**` only, refusal falls back cleanly to the webview path / 7da8734
- Archie-2139 — "Open my site" and every external link were silently dead (opener scope covered
  only the login URL); `openExternal` now pins hostnames itself, since the capability glob can't / 4730681 (glob), 6f3630d (the pinning itself)
- Archie-fada — remote images + IIIF `info.json` now route through the native-http bridge on
  desktop (previously AV-only); tiles deliberately stay webview-fetched (per-tile IPC not worth it) / 3c9a70f
- Archie-623e — native folder is becoming the canonical desktop store (OPFS demoted to web-only);
  **still OPEN**, all 6 phases code-landed (`68e5041` phase 1, `8140bc4` phases 2-6) but blocked on packaged proof, not on code

## Evidence
- `docs/plans/native-canonical-store.md` §"a09d packaged verification" — 9-row checklist (the ticket's own "7" undercounts the primary table), every row
  code-complete and unit-proven, every row still `☐ pending build`; this is the honest state, not
  the ledger below.
- `scripts/lib/tauri-capabilities.test.mjs` — the gate born from Archie-91e7/7b48 is TWO audits
  (permissions: is the command granted; scope: may it touch this path) because the manifest is
  wrong in two structurally different ways — audit 1 is blind to audit 2's class by construction.
- `ledgers/TEND-EXPLORE-tauri-2026-07-20.md` — dated exploration; **its L1/L2 "OPFS still canonical"
  finding is STALE** (fixed by Archie-623e phases 2-6 since). Its Flatpak findings (keyring D-Bus,
  metainfo screenshots) were fixed same week (Archie-18b4, Archie-a53c, merged `1cc1ee8`) — cite those tickets, not this file, for current truth.

## Open & hazards
- `src-tauri/README.md:44-48` still calls asset-protocol/`convertFileSrc` "the real remaining
  work" / "highest-risk item" — **doc is stale**, Phase 4 (`convertFileSrc` for AV, `1c5f813`)
  shipped. Don't cite the README for current state; cite `docs/plans/native-canonical-store.md`.
- Archie-9ece (open, blocks Archie-623e) — nothing in the 9-row checklist may be claimed "done" on
  vitest/typecheck alone; each rides the packaged native-build smoke.
- Flatpak "stay signed in" (keyring/Secret Service D-Bus) and the single-instance focus behavior
  are still packaged-only claims — same a09d dependency, not yet independently ticketed as stale.
- A new `TauriFsBridge` method is invisible to unit tests until `pnpm capabilities:check` runs it
  through both audits — the bridge interface is the derivation source, so an unmapped method fails
  loudly instead of shipping a silent data-loss bug a third time.
