# ADR-0019 — Embeddable read-only `<archie-viewer>`: drop Annotorious/PixiJS, render regions as DOM-SVG, no `unsafe-eval`

**Status:** accepted (2026-06-21, grill — user-gated)

## Context

Institutional buy-in ("Recipes / Ghost + WordPress plugins") was grilled to a single need: drop an
Archie exhibit into a third-party page (museum CMS, WordPress/Ghost, LMS). IIIF-interop alone is
insufficient — Mirador/UV cannot render Readings (ADR-0007), the narrative Spine (ADR-0005), or rich
Notes — so institutions must embed *Archie's own viewer*, not just consume its manifest. Prior art
converges: anvil ADR-0006 ("Web Component + iframe, nothing else" — WordPress/Substack strip
`<script>`, so the iframe is the floor); clover-iiif (`<clover-viewer>`) and canvas-panel
(`<canvas-panel>`) ship exactly this. No prior art builds a native CMS plugin (server-side → breaks
the no-server lock).

The blocker was weight + privilege: the only standalone runtime today (the `ExhibitView` island) is
282.9 KB gz and requires `script-src 'unsafe-eval'`. A probe (2026-06-21) established WHY:
`@annotorious/openseadragon` displays regions via a PixiJS 7 WebGL layer (NOT edit-only), and PixiJS's
`new Function()` shader compile (`@pixi/core/generateUniformsSync.mjs:219`) is the SOLE cause of the
`unsafe-eval` requirement (confirms `.claude/rules/tauri-csp.md`).

## Decision

Ship `<archie-viewer>`: a single **read-only** Web Component — a thin shell over the SAME `@render/core`
as `ViewerShell` (one engine, not a fork). Because it is read-only (editing is external — ADR-0020 /
Studio round-trip), it **drops `@annotorious/openseadragon` + `@annotorious/plugin-tools` + transitive
PixiJS** and renders annotation regions with a thin **DOM-SVG overlay** built geometry-only from the
already-pure `render-core` selectors (`geometry/selector.ts`), reusing the in-repo
`render-mount/frame-overlay.ts` pattern (`createElementNS` + `viewer.addOverlay`). OpenSeadragon stays
(deep-zoom tiles). Packaged as:

- **Two bundles:** a ~5–15 KB gz core (custom element + `EmptyHall` drop-zone + grid, render-core only)
  eager; the deep-zoom reader (`createMount`, `mount.ts:74`) lazy-imported on object-open.
- **No-`src`** → open/drop a local `.archie.zip`; **`src=URL`** → fetch+open.
- **Shadow DOM** for host-page isolation.
- **Distribution:** one self-contained bundle (canvas-panel `dist/bundle.js` style) served via
  **jsDelivr `/gh/` pinned to a git tag** (+ Subresource Integrity), GitHub Pages as fallback. No npm
  publish, no server.

## Consequences

- Removes ~194 KB gz (Annotorious+PixiJS, the single biggest mass) AND the `script-src 'unsafe-eval'` +
  `worker-src blob:` grants — so the embed runs under strict host CSPs the desktop app cannot. Estimated
  read-only floor ~110–150 KB gz vs 282.9 now; this is the first **real measurement** against the
  never-validated 240 KB budget (CONTEXT "Named cuts").
- The DOM-SVG overlay is NEW code that must reproduce Annotorious read behaviours: BOTH `xywh` Fragment
  AND `SvgSelector` polygon regions, hit-test for SELECT, `fitBounds`-on-select (ADR-0006 nav contract),
  and the a11y marker-label pass (`Canvas.svelte:82` currently leans on Annotorious-emitted DOM).
- **Security:** the overlay must build via `createElementNS`+`setAttribute` from parsed points only —
  raw `SvgSelector.value` must never reach `innerHTML`/`DOMParser` (verified not-exploitable 2026-06-21;
  the guardrail is an overlay-leaf acceptance test). Ingest hardening lives in ADR-0020.
- OSD popovers anchor via `getBoundingClientRect`/`position:fixed` (`mount.ts:241`) → Shadow-DOM
  positioning must be browser-verified; the overlay's own styles must inject into the shadow root.
- Annotorious stays in **Studio** (the editor legitimately needs draw/edit); `render-mount` must gain a
  read-only path WITHOUT regressing the editor mount (shared by both apps via `@render/svelte`).
- The element name + attribute schema become a frozen public API (annomea shipped this inconsistently —
  `<anvil-viewer>` vs `<annotated-image>`, its `EMBED-AUDIT.md`); locked in a follow-on grill before code.

## Alternatives rejected

- **Native WordPress/Ghost plugins** (user's initial idea): server-side → breaks the no-server lock; no
  prior-art donor; anvil serves restricted CMSes via iframe, never a plugin.
- **IIIF-interop only** (hand institutions a manifest for their Mirador/UV): rejected by the user —
  foreign viewers can't render Readings/Sections/rich Notes.
- **Keep Annotorious, add `@pixi/unsafe-eval`:** not a usable fix while Annotorious owns the PixiJS
  instance (`tauri-csp.md`); v3.8.2 exposes no external-renderer hook.
- **iframe-only** (no Web Component): the iframe is kept as the universal fallback, but a sealed box
  can't give the inline/native feel institutions want; both ship (anvil P1 + P2).
- **One mega-bundle:** rejected — the grid/gallery needs no heavy engine; lazy-loading the reader keeps
  the default tiny.
