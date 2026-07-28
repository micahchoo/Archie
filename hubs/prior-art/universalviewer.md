---
updated: 2026-07-27
---
# universalviewer
> *Does UV dock its canvas chrome by default, and can its test suite stand in for a network check?*

Source: `ledgers/PRIORART-chrome-placement-2026-07-26.md`, `.claude/rules/prior-art-citation-discipline.md`.

## Verified claims (line-cited)
- **Docked ≥768px, via CSS grid**: `.mainPanel { grid-template-areas: "left center right" }`
  (`uv-shared-module/css/styles.less:114-131`); opening a panel widens
  `--uv-grid-left-width` 30px → 271px (`:25-29`, `:144-150`), shrinking the centre (canvas) track.
- **Also enforced in JS, independently of CSS**: `Shell.resize()` computes the canvas area as
  `$element.height() − headerPanel − footerPanel − mobileFooterPanel` (`Shell.ts:96-105`) — the
  canvas is explicitly what's left over, not merely implied by layout.
- **Below 768px it overlays instead**: `.leftPanel, .rightPanel` become
  `position: absolute; inset: calc(5em + 8px) 0 2em; width: 100%` (`styles.less:196-207`) — full-bleed
  sheets over the canvas, selected by viewport width alone, never by config.
- Defaults trace to the literal, not a fallback: all four `is<X>PanelEnabled()` read
  `Bools.getBool(config, true)` (`BaseExtension.ts:1090-1114`), AND the shipped OSD extension config
  sets all four `true` explicitly (`uv-openseadragon-extension/config/config.json:8-10,:37`).

## Stated absences
- No persistent over-canvas chrome on the image path: the only two `position:absolute` rules in the
  OSD centre panel are a paging button with `display:none !important`
  (`uv-openseadragoncenterpanel-module/css/styles.less:30-40`) and a loading spinner (`:224`).

## What citations of it may NOT support
- "universalviewer's suite covers this" — **false**; its suite never touches the network
  ([[prior-art-citation-discipline]]). Don't cite UV's test suite as a network-behavior donor.
- **Correction (verified 2026-07-28): the clone IS present.** A same-day edit to this page claimed
  "no local clone... not present anywhere under `/mnt/Ghar/2TA/DevStuff/Annotators/Image/`." That is
  false — `IIIF/universalviewer/` exists (692 files, its own `.git/`), including
  `src/content-handlers/iiif/modules/uv-shared-module/Shell.ts`, the exact file this page already
  cites at `:96-105`. Don't trust a "no local clone" claim without running `ls`/`find` yourself —
  this one didn't.
