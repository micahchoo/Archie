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
- **Amendment (2026-07-05, tend Issue 3):** jsDelivr's `/gh/` serving resolves paths at the **repo
  root**, not inside a package subpath, so `packages/archie-viewer/dist/` — the actual build output —
  is hand-mirrored to a root-level `dist/` (`a656cda`). This is a second copy that can silently diverge
  from the package build; there is no repo-root build step to replace it with. Rule: after
  `pnpm --filter archie-viewer build` and before tagging a new `@vN`, run `pnpm sync-dist`
  (`scripts/sync-dist.mjs`) to resync the root copy, and `pnpm sync-dist:check` to verify it before
  release — it diffs both trees and exits 1 on drift.

## Capability contract (amendment 2026-07-25, Archie-f90d / Archie-52a9)

The Decision above says "a thin shell over the SAME `@render/core` — one engine, not a fork", and it
sanctions exactly one divergence: Annotorious/PixiJS out, DOM-SVG overlay in. Parity for everything
else was **convention**, and convention is what drifted. `element.ts:9-10` records the mechanism —
the markup was *ported, not imported* — and by 2026-07-25 the embed had silently lost object
navigation, the note list, Readings, the narrative, rights and the shell's whole visual language,
with every test green throughout.

**Why the previous audit did not see it, and why this table is shaped the way it is.** annomea's
`EMBED-AUDIT.md` (2026-05-23) is the cautionary tale this ADR was written against, and it diagnoses
the audit as sharply as the code. Its Channel-3 Web Component had evaporated entirely, and the audit
before it missed the whole channel because it was **file-driven**: "annomea has **no** embed/
directory, so every anvil embed file had zero counterpart to compare against and was **invisible by
construction**" (`EMBED-AUDIT.md:15`). A capability with no file cannot be missed by a **capability**-
driven check, which is what follows. The verdict vocabulary and the one-row-per-capability shape are
annomea's (`:21`, `:23-33`) — including `DONE-differently`, which is precisely what this ADR's
DOM-SVG overlay is and which a bare `DROP` would misreport.

**What is ours and not inherited:** annomea proposed **no automated gate** — its enforcement was a
one-time audit plus a manual "Prioritized recovery order" (`:53-62`). Nothing in the surveyed corpus
gates embed parity: clover-iiif documents its surface as an options table plus a named unsupported
list (`pages/docs/viewer.mdx:78-89, 251-275, 668`), canvas-panel scopes by framing sentence ("not a
IIIF Viewer … a component of your application", `docs/intro.md:15`), anvil ADR-0006 weighs each
pattern's cost in prose. All of those are documents. The `recipes/smoke.mjs` column below is Archie's
own answer to the problem annomea named and did not solve.

Verdicts, annomea's vocabulary: **PORT** · **ADAPT** (port the UX, strip the dropped subsystem's
coupling) · **DONE-differently** · **DROP-justified** · **DEFER-tracked** · **ABSENT** (claimed-kept,
missing — a bug by definition; no row may sit here).

| capability | shell surface | embed surface | verdict | obligation | gate |
| --- | --- | --- | --- | --- | --- |
| rights / attribution / licence | `Credit.svelte`, `MetadataList` | `element.ts` `creditHtml` | PORT | **MUST** | smoke — value compared against the manifest's own `requiredStatement` / `rights` / `metadata` |
| object navigation | `SidebarObjectNav.svelte` | `reader-chrome.ts` | PORT | **MUST** | smoke — Back to Exhibit + Prev · N of M · Next present, and Next actually changes the open object |
| note list (the INDEX, Archie-c982) | `Reader.svelte` sidebar | `reader-chrome.ts` | PORT | **MUST** | smoke — row count equals the canvas's annotation count, and a row opens the note |
| readings + legend | `ReadingLegend.svelte` | `reader-chrome.ts` + `reading-marks.ts` | ADAPT (no `setStyle` channel on a DOM-SVG overlay — the marks are styled after the draw, from the same `readingMarkerStyle`) | **MUST** | smoke — legend rows match `readings.json`, swatch numbers come from `readingMarkerStyle`, and picking a reading recolours the marks |
| narrative spine (ADR-0005) | `NarrativeReader.svelte` | `narrative.ts` (lazy, and only for an exhibit WITH sections) | ADAPT (sections + prose + stepper; no resize divider, no per-section note pane) | **MUST** | smoke — section count matches the manifest's Ranges, prose renders, the stepper advances |
| design language (V9/V31/V69) | `tokens.css` | the SAME file, read as text into the shadow root (`tokens.ts`) | PORT | **MUST** | smoke — a token's value in the shadow root compared against the canonical file fetched from the same tree |
| deep zoom | OpenSeadragon | OpenSeadragon (lazy) | PORT | MUST | smoke (canvas mount is best-effort headless) |
| region marks + selection | Annotorious → PixiJS WebGL | geometry-only DOM-SVG overlay (`read-overlay.ts`) | **DONE-differently** | MUST | smoke — a REAL driven mouse click on a region opens its note (V68); `eagerGzKB` for the weight claim |
| note body | `NotePopup.svelte` | `note-card.ts` (text only) | ADAPT | MUST | smoke (the click assertion above asserts the card opens) |
| AV playback | `MediaPlayer.svelte` | `av-player.ts` (lazy) | ADAPT | MUST | unit (`av-player.test.ts`) — no AV object in the smoke drive's path |
| cite / share | `CitePanel.svelte`, `CiteCard` | `currentContentState()` — the codec, no UI | ADAPT | SHOULD | unit (`content-state.test.ts`) |
| note media (images in notes) | `NoteMedia`, `NoteLightbox` | — | DEFER-tracked | — | — (needs a ticket) |
| reading sheet (long-form reading text) | `ReadingSheet.svelte` | — | DEFER-tracked | — | — (needs a ticket) |
| cite hovercards in prose | `ProseCites.svelte` | — | DEFER-tracked | — | — (needs a ticket) |
| full-text search | `SearchOverlay.svelte` + minisearch | — | DEFER-tracked | — | — (needs a ticket; the index and minisearch are real weight, so this one may well resolve as DROP-justified — but *undecided* is not the same as *dropped*) |
| authoring / drawing | Studio | — | DROP-justified | — | the element is read-only by definition (ADR-0020 owns the round-trip) |
| `@annotorious/openseadragon` + `@annotorious/plugin-tools` + PixiJS | Studio and the shell | — | DROP-justified — ~194 KB gz and the `script-src 'unsafe-eval'` grant, for an edit capability a read-only embed does not have | — | `eagerGzKB` in `build.mjs --check` |

**How to use this table.**

- A row's **obligation** is what the embed owes, not what it happens to do. A MUST row that stops
  being true is a failing build, not a backlog item.
- **Adding a `DROP-justified` row is a deliberate, reviewable act with a written reason** — that is
  the whole point. The failure mode this replaces is a capability leaving with no row at all.
- **`ABSENT` must never appear.** It is annomea's name for "claimed kept, actually missing"; a row
  that reaches that state is the bug the table exists to surface.
- A `DEFER-tracked` row without a ticket is a half-measure. The four above are named here so they
  are at least *visible*; filing them is follow-up work.
- The gate column is load-bearing in one specific way: `eagerGzKB` is the only thing that can see the
  weight claims, and `recipes/smoke.mjs` is the only thing that can see the behavioural ones (it
  drives the BUILT bundle in real Chromium). Neither `entryGzKB`, `totalGzKB`, nor any unit suite can
  substitute — see `.claude/rules/archie-viewer-eager-closure.md` and `.claude/rules/osd-overlay-wrapper.md`
  for the two occasions each was proven blind.
- Parity is cheap here for a structural reason worth restating: every MUST capability above rides
  behind the `await import("./reader.js")` boundary the canvas already needed, so none of it lands in
  the eager path. Lazy-loading as an explicit design pattern rather than an optimisation is
  universalviewer's posture too (`manual/ARCHITECTURE.md:42,60`).

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
