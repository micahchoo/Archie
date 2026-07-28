# PROBE / BUILD — embed-autogrow (DIVERGENCES.md divergence 5)

**Run:** 2026-07-06 · built for real on **`main`** (user-ordered; not the `probe/embed-autogrow` branch the
divergence sketched) · same review-gated loop as the other Issue-11 phases. Blast radius as predicted:
`packages/archie-viewer/src/element.ts` + a small pure module + a recipe snippet. Tiny.

## What was built

An embedded `<archie-viewer>` (sole content of an `<iframe>`) can't make the iframe grow with its content —
iframes don't auto-size — so a long gallery is clipped inside a fixed `height`. The element now POSTs its
rendered height to the parent, and a ~8-line parent-page listener resizes the matching iframe.

- **`packages/archie-viewer/src/embed-autogrow.ts`** (pure): `EMBED_HEIGHT_MESSAGE` (`"archie-embed:height"`),
  `embedHeightMessage(height, id)` (namespaced, ceil'd, non-negative), `isFramed(win)`, and `heightToPost({
  viewKind, height, lastPosted })` — the when-to-post decision. Skips the **reader** view (a `70vh` deep-zoom
  surface would drive a vh feedback loop; the iframe is frozen while reading), non-positive heights, and
  unchanged heights (coalesces ResizeObserver no-ops so pan/zoom can't spam the parent).
- **`element.ts`** wiring: a `ResizeObserver` on the STABLE host element (the shadow tree is re-rendered
  wholesale, so an inner node would break each render), started in `connectedCallback` only when `isFramed`,
  torn down in `disconnectedCallback`; each observation rAF-coalesced → `heightToPost` → `window.parent.postMessage`.
  `targetOrigin: "*"` — the payload is a single non-sensitive height integer and the parent's origin is
  unknowable from inside a (possibly sandboxed) iframe; the parent validates by `event.source` + message type.
- **Parent listener** (copy-pasteable) in `recipes/EMBED.md` (§"Auto-grow the iframe to its content") +
  the live demo **`recipes/09-autogrow.html`** (parent page + `srcdoc` iframe hosting the element at natural
  height + the listener). `recipes/README.md` iframe-height note updated to point at the built feature.

## Kill-criterion finding (honest)

The declared kill: *"if the documented script-stripping hosts also strip the listener (making auto-grow
unreachable exactly where it's needed), record that and close as docs-only."*

**Finding: the boundary is real, but the feature is NOT docs-only.** Auto-grow needs the parent page to run
`<script>`. The CMSes that forced the iframe fallback in the first place — Notion / Substack / Squarespace /
locked-WordPress — strip `<script>` from user content, so they **also strip this listener**: auto-grow can't
run there, and the **fixed-height iframe remains the answer** for that class of host. But auto-grow *does*
work, and removes a real paper-cut, on the large set of hosts that CAN run script — self-hosted museum pages,
script-permitting WordPress/Ghost, any page the author controls. So it was **built** (value on script-permitting
hosts) **with the boundary documented** (no value on script-stripping hosts — they keep the fixed height), not
closed as docs-only. Scope note: auto-grow sizes the gallery/exhibit grids; the deep-zoom reader keeps the
iframe's current height (a zoom surface wants a viewport), so a deep-link straight to a reader is best served
by a fixed height.

## Verification

- **Unit (headless, vitest):** `embed-autogrow.test.ts` — message shape (ceil/non-negative/namespaced),
  `heightToPost` (posts a changed grid height; skips reader / non-positive / unchanged), `isFramed`.
  Package suite: 105/105, `tsc --noEmit` clean, `build` + `bundle:check` clean (bundle Δ +0 KB — the code is tiny).
- **End-to-end (throwaway Playwright probe, not committed):** served the repo root, opened
  `recipes/09-autogrow.html`, and observed the no-fixed-height iframe grow from its 322 px min-height to
  **1182 px** (the gallery) via the postMessage handshake, then shrink to **521 px** after clicking into an
  exhibit grid — 2 height messages received (`[1180, 519]`). Confirms the observe → coalesce → post → parent-resize
  loop works against the real built bundle. (Prereq, same as the other recipes: a built bundle served at
  `/dist/archie-viewer.js` — `pnpm --filter @render/archie-viewer build`.)
