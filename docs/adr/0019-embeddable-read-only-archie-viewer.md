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
construction**" (`EMBED-AUDIT.md:15`).

**What is inherited, precisely:** the **verdict vocabulary** (`:21`) — including `DONE-differently`,
which is exactly what this ADR's DOM-SVG overlay is and which a bare `DROP` would misreport — and the
diagnosis above. **What is not:** the row axis. annomea's table is one row per **anvil source file**
(`:23-33`: `embed/AnnotatedImage.svelte`, `lib/share-url.ts`, …), which is the very file-driven shape
its own prose identifies as the reason the channel went missing — it names the disease and then
tabulates the symptom. The table below is one row per **capability**, so a capability with no file
has somewhere to be absent from. That change of axis is the whole mechanism, and it is ours.

**The gate is ours too.** annomea proposed no automated enforcement — a one-time audit plus a manual
"Prioritized recovery order" (`:53-62`). Nor does the rest of the corpus: clover-iiif documents its
surface as a Features list (`pages/docs/viewer.mdx:78-89`) and an options table (`:251-275`);
canvas-panel scopes by framing sentence ("not a IIIF Viewer … a component of your application",
`docs/intro.md:15`); anvil ADR-0006 weighs each pattern's cost in prose. anvil **does** ship an
automated embed smoke in CI (`.github/workflows/ci.yml:98-103` → `.testing/clients/embed-smoke.mjs`),
so "all of them are documents" would be false — but it asserts that the embed RENDERS, never that it
matches the app. So the accurate claim, and the one this ADR rests on: **no prior art gates parity
between an embed and its app surface.** `recipes/smoke.mjs` is Archie's answer to the problem annomea
named and did not solve.

Verdicts, annomea's vocabulary: **PORT** · **ADAPT** (port the UX, strip the dropped subsystem's
coupling) · **DONE-differently** · **DROP-justified** · **DEFER-tracked** · **ABSENT** (claimed-kept,
missing — a bug by definition; no row may sit here).

| capability | shell surface | embed surface | verdict | obligation | gate |
| --- | --- | --- | --- | --- | --- |
| rights / attribution / licence | `Credit.svelte`, `MetadataList` | `element.ts` `creditHtml` | PORT | **MUST** | smoke — value compared against the manifest's own `requiredStatement` / `rights` / `metadata` |
| object navigation | `SidebarObjectNav.svelte` | `reader-chrome.ts` | PORT | **MUST** | smoke — Back to Exhibit + Prev · N of M · Next present, and Next actually changes the open object |
| note list (the INDEX, Archie-c982) | `Reader.svelte` sidebar | `reader-chrome.ts` | PORT | **MUST** | smoke — row count equals the canvas's annotation count, and a row opens the note |
| readings + legend | `ReadingLegend.svelte` | `reader-chrome.ts` + `reading-marks.ts` | ADAPT (no `setStyle` channel on a DOM-SVG overlay — the marks are styled after the draw, from the same `readingMarkerStyle`) | **MUST** | smoke — legend rows match the readings that have notes on **this object**, swatch numbers come from `readingMarkerStyle`, picking a reading recolours the marks, a reading SURVIVES a step to the next object, and a reading does NOT follow you into another exhibit (both fixtures publish ids cipher/hoax/abjad, so a carry-over would silently activate a different curator's layer) |
| narrative spine (ADR-0005) | `NarrativeReader.svelte` | `narrative.ts` (lazy, and only for an exhibit WITH sections) | ADAPT (sections + prose + stepper; no resize divider, no per-section note pane) | **MUST** | smoke — section count matches the manifest's Ranges, prose renders, the stepper advances |
| design language (V9/V31/V69) | `tokens.css` | the SAME file, read as text into the shadow root (`tokens.ts`) | PORT | **MUST** | smoke — a token's value in the shadow root compared against the canonical file fetched from the same tree |
| deep zoom | OpenSeadragon | OpenSeadragon (lazy) | PORT | MUST | smoke, INDIRECTLY — a headless WebGL canvas is too flaky to assert on directly, so `canvasMounted` stays best-effort; but every region/halo/V55 assertion below only exists when it mounted, and the completeness check makes a missing assertion a failure. A canvas that never mounts fails by absence. |
| region marks + selection | Annotorious → PixiJS WebGL | geometry-only DOM-SVG overlay (`read-overlay.ts`) | **DONE-differently** | MUST | smoke — a REAL driven mouse click on a region opens its note (V68); `eagerGzKB` for the weight claim |
| note body | `NotePopup.svelte` | `note-card.ts` (text only) | ADAPT | MUST | smoke (the click assertion above asserts the card opens) |
| AV playback | `MediaPlayer.svelte` | `av-player.ts` (lazy) | ADAPT | MUST | smoke — the drive opens the exhibit's audio object, then asserts a TIMED row travels the recording to its cue and opens it, and an UNCUED whole-recording row shows ITS OWN body without moving the playhead |
| cite / share | `CitePanel.svelte`, `CiteCard` | `currentContentState()` — the codec, no UI | ADAPT | SHOULD | unit (`content-state.test.ts`) |
| note media (images in notes) | `NoteMedia`, `NoteLightbox` | — | DEFER-tracked | — | — (needs a ticket) |
| reading sheet (long-form reading text) | `ReadingSheet.svelte` | — | DEFER-tracked | — | — (needs a ticket) |
| cite hovercards in prose | `ProseCites.svelte` | — | DEFER-tracked | — | — (needs a ticket) |
| full-text search | `SearchOverlay.svelte` + minisearch | — | DEFER-tracked | — | — (needs a ticket; the index and minisearch are real weight, so this one may well resolve as DROP-justified — but *undecided* is not the same as *dropped*) |
| **layout: chrome docks OUT of the canvas** | `ViewerShell` topbar · `Reader`/`NarrativeReader` `.canvas-dock` + `.note-dock` · `ExhibitView` `.chrome-dock` | `element.ts` `.reader-dock` / `.reader-note` (`reader-chrome.ts` legend, `note-card.ts`) | PORT | **MUST** | smoke — every docked chrome element's box is measured against the canvas's box: zero intersection, AND `elementFromPoint` at the canvas centre is not a chrome node |
| authoring / drawing | Studio | — | DROP-justified | — | the element is read-only by definition (ADR-0020 owns the round-trip) |
| `@annotorious/openseadragon` + `@annotorious/plugin-tools` + PixiJS | Studio and the shell | — | DROP-justified — ~194 KB gz and the `script-src 'unsafe-eval'` grant, for an edit capability a read-only embed does not have | — | `eagerGzKB` in `build.mjs --check` (metafile), **and** smoke (wire): every `/dist/*.js` fetched before the first object open is read, scanned for OpenSeadragon **and PixiJS and Annotorious** — the row names all three, and a PixiJS-only leak contains no `openseadragon` string at all — and its byte total held under a ceiling |

### The layout row, in full (amendment 2026-07-26, human ruling)

**The image is never obscured by chrome, and both consumers honour it.** Persistent chrome is a
SIBLING of the canvas in normal flow — a row above it, a row below it, or a column beside it — never a
surface on top of it. This is a contract, not a style: an embed and a shell that disagree about it show
the same object differently, which is the class of drift this whole table exists to catch.

**The corpus default, which is what settled it.** `IIIF/clover-iiif` `Viewer/Viewer.tsx:180-184` renders
`<ViewerHeader>` and `<ViewerContent>` as flex SIBLINGS (`Viewer.styled.tsx:15-22`), and that is
precisely *why* its header can be `background-color: transparent !important`
(`Header.styled.ts:57-73`) — nothing is behind it to be legible against. Its one genuinely over-canvas
control, `PanelToggle`, is an **opaque plate** (`Viewer.styled.tsx:41-82`), i.e. it sidesteps the
contrast question rather than solving it. `tropy` `src/components/esper/container.js:11,39` makes an
overlay toolbar **opt-in**, `hasOverlayToolbar` defaulting to `false`. `canvas-panel` paints no chrome
over the image at all.

**What it covers, and what it deliberately does not.** The row governs PERSISTENT chrome: navigation,
readouts, the reading legend, the note surface, the item strip, the finder and cite triggers, status
strips. It does NOT govern:

- **modal surfaces** — the finder overlay, the cite panel, the note lightbox, the reading sheet. A
  modal takes the surface over on purpose and hands it back; docking one is meaningless.
- **self-dismissing toasts** — the cold-arrival chrome (`ExhibitView` `.arrival`, 6–8s). Docking a
  surface that appears and vanishes on a timer would reflow the canvas mid-read, twice, which costs
  more than the seconds of overlap it buys.
- **the OSD locator mini-map.** This is the one NAMED EXCEPTION and it is not settled by this row.
  It is OpenSeadragon's own `navigator` (`read-mount.ts:245`, `navigatorPosition: "BOTTOM_RIGHT"`),
  it is a map OF the image rather than chrome over it, and every viewer in the corpus floats it.
  Docking it needs `navigatorId` plumbing through `@render/mount`, which is a separate change. Until
  then the smoke assertion below is scoped to a NAMED SET of docked elements rather than "anything on
  the canvas" — an honest gate over a real set beats a total-sounding one that quietly excludes what
  it cannot handle.

**What retired with it**, because a gate that keeps passing after its subject disappears is the failure
mode this ADR is most alert to: `fitBoundsRect`'s chrome reservation and the whole `getFitOptions` seam
(`FitOptions` now carries only `margin`); `--topbar-h`, `--scrim-top`, `--pane-top`, `--strip-h`,
`--finder-h`; `Filmstrip`'s live `--strip-h` publisher; the embed's `reserveLocatorSpace` /
`--archie-locator-h`. Every one of those existed so one floating surface could clear another. Tickets
`Archie-de08` (V42, a contrast floor for chrome over an arbitrary image) and `Archie-c30a` (V48's
vertical clearance) close **OBVIATED**: there is no contrast problem and nothing to clear if nothing
floats.

**The cost, named and accepted.** Vertical space is scarcest in a small embed, which is exactly where a
docked bar taxes most. Both docked rows in the embed are `:empty`-gated, so an object with no readings
and no open note pays nothing; the measured worst case is recorded in the slice's report.

**How to use this table.**

- A row's **obligation** is what the embed owes, not what it happens to do. A MUST row that stops
  being true is a failing build, not a backlog item.
- **Adding a `DROP-justified` row is a deliberate, reviewable act with a written reason** — that is
  the whole point. The failure mode this replaces is a capability leaving with no row at all.
- **`ABSENT` must never appear.** It is annomea's name for "claimed kept, actually missing"; a row
  that reaches that state is the bug the table exists to surface.
- A `DEFER-tracked` row without a ticket is a half-measure. The four above are named here so they
  are at least *visible*; filing them is follow-up work.
- **A MUST row is covered only when its labels are entries in `CONTRACTED_LABELS`** — the hard-coded
  array in `recipes/smoke.mjs`. Writing a `record()` call is *not* coverage: the completeness check
  compares that array against the labels that ran, so a capability the array does not name is
  invisible to it however many assertions exist for it. Say "an entry in `CONTRACTED_LABELS`", never
  "has a label" — the two readings come apart exactly where it matters, and the vaguer one licenses a
  row that looks covered and is not. A row the array does not name is the same shape as the
  file-driven audit this table replaced, one level up.

  AV playback was the last such row (unit-tested only), and the residual defect found in review sat
  exactly there: a unit test can assert what `select()` returns, but only a driven browser can say
  WHICH note's body a row is displaying, and the uncued row was displaying the previous row's. AV now
  has four entries in the array. Every MUST row in this table has at least one.

  **This paragraph was itself false when first written (2026-07-25, corrected 2026-07-26).** It
  claimed AV had four labels while all four existed only as `record()` calls, spliced by a bad patch
  into an argument list ~135 lines from the array — so the row this paragraph declared covered was
  still invisible to the very check the paragraph describes, and smoke reported PASS either way. It is
  recorded here rather than quietly fixed because a document written to stop a capability going
  missing had itself gone the distance from *naming the disease* to *tabulating the symptom* in the
  space of three paragraphs, which is the failure this ADR attributes to annomea's own audit above.
  The mechanical invariants that would have caught it now run inside `smoke.mjs` before the browser
  starts; the process habits are in `.claude/rules/post-review-fixes-are-unreviewed.md`.
- **Every MUST assertion was proven RED-GREEN**: the capability was deleted, smoke failed, it was
  restored. This is not ceremony. The first version of the DROP-justified row's driven check matched
  `/dist/reader-*.js` by NAME, and the 2026-07-24 eager leak — reintroduced deliberately, taking
  `eagerGzKB` from 37.6KB to 270.5KB — passed it at 33/33, because a static re-export makes esbuild
  hoist OpenSeadragon into a `chunk-*.js` the filter never looked at. It now reads the bytes. An
  assertion nobody has watched fail is a guess about what it covers.
- **A missing FIXTURE must fail like a missing capability.** Every drive here depends on a published
  exhibit being where it was, and a drive that could not find one used to log `info` and record
  nothing — so the run simply got shorter and still exited 0. Measured: renaming one slug in
  `exhibits.json` took the suite from 33 assertions to **6, PASS, exit 0**, with rights, navigation,
  the note list, readings, the narrative, the tokens, the real-click, the halo and V55 all gone. That
  is annomea's "invisible by construction" relocated from files to fixtures, inside the gate written
  to close it. Two things fix it: every skip is now a `record(false, …)`, and a final check compares a
  hard-coded list of contracted labels against the labels that actually ran. **That check is what
  makes `ABSENT` mechanically unreachable rather than merely forbidden here** — it also catches an
  assertion someone deletes, and it is how the `deep zoom` row is enforced without asserting on a
  flaky headless canvas.
- The gate column is load-bearing in one specific way: `eagerGzKB` is the only thing that can see the
  weight claims, and `recipes/smoke.mjs` is the only thing that can see the behavioural ones (it
  drives the BUILT bundle in real Chromium). Neither `entryGzKB`, `totalGzKB`, nor any unit suite can
  substitute — see `.claude/rules/archie-viewer-eager-closure.md` and `.claude/rules/osd-overlay-wrapper.md`
  for the two occasions each was proven blind.
- Parity is cheap here for a structural reason worth restating: every MUST capability above rides
  behind the `await import("./reader.js")` boundary the canvas already needed, so none of it lands in
  the eager path. Measured eager cost of the whole contract: **36.0 → 38.9 KB gz**, roughly two thirds
  of it the shared token layer. (For the record, the Decision's "~5–15 KB gz core" was an estimate made
  in 2026-06 before the read-only core existed; the measured floor was already 36 KB before this
  amendment. The estimate was never met and is not the budget — `bundle-size.json` is.) Lazy-loading as an explicit design pattern rather than an optimisation is
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
