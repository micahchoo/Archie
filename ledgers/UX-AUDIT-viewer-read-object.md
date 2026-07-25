# UX audit — Viewer vertical 3: Reading an object (V40–V56)

Ticket `Archie-c743`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-25, real
Chromium at 1280×800 (embed at 1280×900), against the running dev shell on `:5173` and the local
`dist/archie-viewer.js` dated **Jul 24 19:52**.

**What this vertical asks:** at the deep-zoom canvas — the product's centre of gravity — what does the
reader see, what can they reach, and how far do the shell and the embed diverge?

Screenshots are `/tmp/ro-*.png`; every finding carries its repro. Two substrates: `voynich-rosettes`
(one folio, 4 readings, 1 rect region at 71% coverage + 1 bare-IRI whole-object note) and `sampler`
(video + audio + image, the AV surface).

---

## The canvas at rest

### V40 — The zoom readout for the canvas is painted 264 px inside the notes panel *(Severity: high — Look)*

**Surface:** `Reader.svelte:319` `.scale-cue` (the `ZOOM 1×` readout).

**Weakness.** Measured at 1280×800: `main` — the OSD canvas — is `[0, 0, 924, 800]`. `.scale-cue`
renders at **`[1188, 52, 71, 22]`**, i.e. 264 px inside the 345 px paper sidebar, where it lands on
the object title block (`f85v–86r — Cosmological…`, y 63–155). The cue is the answer to "how far in am
I?" and it sits nowhere near the thing it measures.

The cause is one line: `.reader { position: relative }` (`:434`) is the positioning container, and
`.reader` is the **flex row holding both the canvas and the aside** — so `right: var(--space-5)`
resolves against the whole 1280 px page. The comment directly above the rule (`:313-318`) states the
intended contract — *"Top-right — the one corner this reader's canvas overlays don't already use"* —
and is measurably not what ships. `ReadingLegend`, anchored in the same container with `left`, lands
correctly at `[20, 52, 272, 198]`: `left` works, `right` doesn't.

This is the same defect, in a different component, as **V80** in the narrative vertical
(`.canvas-chrome-right` at x 1042–1260 over a 420 px spine). Two independent instances of one
`position: relative`-on-the-wrong-box mistake means the fix is a shared audit of canvas-relative
chrome, not a one-line nudge.

`GOAL.md:20-24` ranks **Look** above everything.

**Repro:** `/viewer/#/voynich-rosettes` *(`/tmp/ro-01-overview.png`, `/tmp/ro-05-fit-first.png`)*.

*(Principle: Look; chrome must not sit on content. Prior art: `annomea/src/viewer/NavControl.svelte:66`
anchors canvas chrome inside the media element itself, not the shell row.)*

### V41 — Two nested green rectangles at fit-width mean two different things and look identical *(Severity: medium — Look)*

**Surface:** the 7e1f coverage frame (`ExhibitView.svelte` `frameFor` → `frame-overlay.ts`) drawn over
the Annotorious mark layer.

**Weakness.** On the Rosettes folio the reader meets two green rectangles nested one inside the other:

| Mark | Measured | What it means |
| --- | --- | --- |
| whole-object frame | `svg[role="button"]` at `[25, 0, 872, 800]` — flush to the canvas edges, clipped top and bottom | the bare-IRI Object-level note (ADR-0018): *this note is about the whole folio* |
| region mark | inset ≈ 65 px, `xywh=pixel:600,600,6700,6100` = **71.0%** of the 7925×7268 canvas | a note about a detail |

Nothing distinguishes them but inset. Both are the same forest green (`ACCENT` `#3A8C5D` /
`frameColour`, which per `ExhibitView.svelte:284-288` returns the reading colour unchanged — the
contrast rescue is an open `TODO(0045)`). The outer one, hugging the viewport boundary, reads as an
application border rather than as somebody's annotation: a first-time visitor has no way to learn that
the frame *is* a note they can open.

71% is also just under the 75% coverage heuristic, so the frame went to the bare-IRI note and the
detail note stayed a mark — the two rectangles are 8% apart in size and carry opposite scopes.

**Repro:** `/viewer/#/voynich-rosettes` *(`/tmp/ro-01-overview.png`)*.

*(Principle: Look; distinguishable states. Prior art: `tropy` renders a whole-item selection as a
different affordance class from a region selection, never as a same-coloured larger rectangle.)*

### V42 — Canvas chrome text has no contrast floor: the same breadcrumb measures 5.2:1 and 3.3:1 in one screenshot *(Severity: medium — Look / a11y)*

**Surface:** `ViewerShell` top-bar breadcrumb (`.zone.left`), rendered over the deep-zoom canvas.

**Weakness.** The breadcrumb is a fixed gold (`rgb(154, 123, 57)`) and the scrim behind it fades out
across its own width. Sampling `/tmp/ro-01-overview.png` (darkest glyph pixel vs lightest background
pixel inside each label's box — the *best case* for the background, so the true ratio is worse):

| Label | Box | Ratio |
| --- | --- | --- |
| `Archie Library` | x 16–113, y 17–35 | **5.23 : 1** |
| `The Rosettes` | x 132–230, y 17–35 | **3.25 : 1** |

One control, two legibility regimes, because the left half sits over the letterbox and the right half
over pale parchment. Every deep-zoom image is different, so this is not a fixed-palette problem to
solve once — it is chrome that needs its own guaranteed ground. The `.scale-cue` (V40) uses
`--surface-canvas-raised` and is legible everywhere; the breadcrumb has `background: none`.

Recorded as medium and method-caveated: the sampling bounds the ratio rather than measuring a single
glyph/background pair. The *variance* is the finding, and it is unambiguous.

**Repro:** `/viewer/#/voynich-rosettes` *(`/tmp/ro-01-overview.png`, crop `/tmp/ro-07-crumb-dark.png`)*.

*(Principle: Look; WCAG 1.4.3 against an arbitrary substrate.)*

---

## Selecting a region

### V43 — Select-to-zoom fits the region edge-to-edge, so the thing selected leaves the frame *(Severity: high — Feel)*

**Surface:** `fitbounds.ts:36-42` `fitBoundsRect` → `mount.ts` `dispatchFitBounds` → OSD
`viewport.fitBounds`.

**Weakness.** The sidebar hint promises *"selecting one zooms in"*, and it does — measured `Zoom 1×` →
`Zoom 1.2×` on the 71% region, `Zoom 1×` → `Zoom 9.3×` on the cipher note. But `fitBoundsRect` returns
the annotation's **exact bbox** with no inset, so OSD lands the region's bounds flush against the
container edges. In `/tmp/ro-05-fit-first.png` the fitted region's green outline survives only as two
faint vertical hairlines at x ≈ 24 and x ≈ 917; its top and bottom edges are off-screen entirely. The
reader arrives at a crop with no visible indication of the region's extent — they cannot see what was
selected, only what it contained.

At 9.3× (`/tmp/ro-04-note-open.png`) the mark is gone from the frame altogether.

`juncture` pads exactly this call — `Map.vue:654`: `fitBounds(coords, { padding: [50, 50] })` — so the
fitted feature stays visibly inside the frame. Archie's no-inset behaviour is inherited from the donor
it was delaminated from (`anvil/app/src/embed/EmbeddedReader.svelte:308-337`), which fits the raw rect
too; that is provenance, not a justification.

Compounding: at that moment the legend (`[20, 52, 272, 198]`, or `[20, 50, 272, 368]` once a reading's
description shows) and the note card (`[24, 458, 502, 320]`) cover the canvas's left flank — see V48.

**Repro:** `/viewer/#/voynich-rosettes` → click the first note card *(`/tmp/ro-05-fit-first.png`)*.

*(Principle: Feel; visibility of system status — the camera should frame the mark, not become it.)*

### V44 — Selection has no on-canvas representation, in either consumer *(Severity: high — Feel)*

**Surface:** `packages/render-core/src/query/marker-style.ts` (shell) and
`packages/render-mount/src/read-overlay.ts:250-255` (embed).

**Weakness.** Both overlays draw the same mark before and after it is selected.

- **Shell.** `MarkerDisplayState` (`marker-style.ts:19-27`) has exactly three members —
  `comparing`, `soloed`, `highlighted` — and no `selected`. `ExhibitView.svelte:277` passes only
  `{ highlighted: hovered === id }`. So a mark changes on *hover* and never on *selection*. Selection
  shows up in one place only: the sidebar list card gains `.active` (measured). Combined with V43,
  which pushes the mark's outline out of frame, the shell gives the reader no canvas-side confirmation
  of which region they opened.
- **Embed.** `applySelectedStyle` sets `data-selected="true|false"` on the geometry — and it is broken
  twice over. (1) `emitSelect` (`:158-161`), the path a user click or Enter takes, sets `selectedId`
  but never calls `applySelectedStyle`; only the programmatic `setSelected` does. Measured: after a
  selection that demonstrably opened the note card, `data-selected` was still `"false"`. (2) `grep -rn
  'data-selected'` across `packages/` and `apps/` returns **one** hit — the write. Nothing in the repo
  reads or styles it, so even a correct write would paint nothing.

**Repro (embed):** `BEFORE` `dsel:"false"` → open the note → `AFTER-SYNTH-CLICK` `dsel:"false"`,
`cardDisp:"block"` *(drive `.audit-readobj-12.mjs`)*.

*(Principle: Feel; visibility of system status. Prior art: `annomea/src/editor/AnnotationList.svelte:60`
carries a `.selected` treatment for the list row — Archie has that half; the canvas half is missing.)*

### V45 — In the shell an individual region is not keyboard-reachable; in the embed every region is *(Severity: medium — Feel / a11y)*

**Surface:** the Annotorious/WebGL mark layer (shell) vs `read-overlay.ts:188-197` (embed).

**Weakness.** Measured `[tabindex="0"]` on the Rosettes reader, dev toolbar filtered:

| Consumer | Canvas tab stops | Regions individually reachable |
| --- | --- | --- |
| shell | `div.openseadragon-canvas` (unnamed), `svg` role=button "View whole object", `svg.a9s-annotationlayer` (unnamed), `div.resize-divider` "Resize notes" | **no** — the whole mark layer is one unnamed stop |
| embed | `div` (unnamed), `svg` role=button "The opening page: a single herbal plant…", `svg` role=button "View whole object" | **yes** — one named `role="button"` per region |

The consumer ADR-0019 *downgrades* — geometry-only DOM-SVG instead of Annotorious/PixiJS — is the one
where a keyboard reader can tab to a specific note's region and hear its text. The shell, the flagship,
cannot offer that at all, because Annotorious 3 renders marks to WebGL with no per-shape node (the
`Archie-a6fb` probe already established this for CSS; the same fact costs the mark layer its a11y tree).

This is a *capability* inversion, not the unnamed-tab-stop count **V90** already recorded at low
severity. It is filed here because the ticket's mandate is to find where the two overlays differ in
ways that change what the reader can DO, and this is the largest such difference. Whether the shell
should grow a parallel focusable layer (a hidden button list, the pattern `read-overlay.ts` already
proves) is the fix ticket's question.

*(Principle: a11y — WCAG 2.1.1; ADR-0019's "one engine, not a fork".)*

### V46 — "Hide all" also removes the whole-object frame, the canvas's only named tab stop *(Severity: medium — Feel / a11y)*

**Surface:** `ReadingLegend.svelte` hide-toggle → `Reader.svelte:270-279` (`canvasFrame` is gated on
`!notesHidden`; `canvasAnnotations` collapses to the selected mark).

**Weakness.** Measured before and after one click of **HIDE ALL**:

| | `svg[role="button"]` on the canvas | note list |
| --- | --- | --- |
| before | `["View whole object"]` | 2 |
| after | `[]` | 2 |

The declutter is documented and the note list correctly survives, so the mouse reader keeps a door. A
keyboard reader loses the canvas entirely: the only named focusable element on it is gone, and the
whole-object note is now reachable only through the sidebar. The toggle's copy also flips asymmetrically
— **HIDE ALL** → **SHOW NOTES** — so the control does not name one thing consistently.

**Repro:** `/viewer/#/voynich-rosettes` → HIDE ALL *(`/tmp/ro-35-hideall.png`)*.

*(Principle: a11y; consistency. Route the copy through `product-copy`.)*

---

## The readings legend

### V47 — The legend's General-notes swatch is not the colour the canvas paints General notes *(Severity: medium — Look)*

**Surface:** `ReadingLegend.svelte:89` `.sw.base` vs `ExhibitView.svelte:255` `ACCENT`.

**Weakness.** The legend is the key to the marker colours. Measured computed values on the Rosettes
folio:

| Legend row | Swatch | What the canvas actually draws |
| --- | --- | --- |
| General notes (base) | `rgba(26, 60, 35, 0.45)` (`--ink-canvas-muted`) | base marks at `ACCENT` **`#3A8C5D`** = `rgb(58, 140, 93)` |
| Cipher reading | `rgb(58, 107, 76)` | the cipher reading's own colour |
| Hoax reading | `rgb(163, 85, 58)` | " |
| Natural-language reading | `rgb(76, 93, 138)` | " |

Two consequences. The base row's key is a translucent dark green that composites nothing like the mark
it stands for; and the row whose swatch *is* closest to what the canvas paints for base notes is
**Cipher reading** (`rgb(58,107,76)` vs `rgb(58,140,93)` — same hue family). A reader who sees a green
mark and consults the key is pointed at the wrong layer.

This is **not** the roll-up's standing correction. That correction concerns colour-*only* coding in
shared code (`readingMarkerStyle`) and explicitly protects `ReadingLegend`'s swatch+name pairing, which
this finding leaves intact — the pairing is fine, the swatch's *value* is wrong. Fixing it is a one-line
change in the viewer's own component, not a shared-code decision.

**Repro:** `/viewer/#/voynich-rosettes`, computed styles on `.legend .sw` *(`/tmp/ro-01-overview.png`)*.

*(Principle: Look; match between system and the real world — a key must use the ink it keys.)*

### V48 — At the moment of closest looking, two cards cover the canvas's left flank *(Severity: medium — Look)*

**Surface:** `ReadingLegend` + the shared `NotePopup`, both anchored inside `main`'s row.

**Weakness.** Measured with a reading active and a note open at 9.3× (`/tmp/ro-04-note-open.png`):
legend `[20, 50, 272, 368]` (the active reading's description grows it by 170 px), note card
`[24, 458, 502, 320]`. Against a 924×800 canvas that is **160 k px² of 739 k**, ≈ 22%, and it is
contiguous down the entire left edge — the two cards stack into one 502 px-wide occluding column from
y 50 to y 778.

The reader has just asked the app to zoom in on a detail. The app zooms, then covers a fifth of the
result with the apparatus that explains it, including (per V43) the side where the fitted region's
own boundary lies.

**Repro:** `/viewer/#/voynich-rosettes` → Cipher reading → the cipher note
*(`/tmp/ro-04-note-open.png`)*.

*(Principle: Look. Prior art: `annomea/src/viewer/Sidebar.svelte` keeps the reading apparatus in a
reserved column rather than floating it over the media; `juncture`'s `Image.vue` puts the caption
below the frame.)*

---

## Audio and video

### V49 — The AV surface's one novel affordance ships fully covered by the item strip *(Severity: high — Look)*

**Surface:** `MediaPlayer.svelte:177-191` `.timeline` ("Where the notes fall in the recording") under
the shell's filmstrip.

**Weakness.** The temporal map — a strip showing where each transcript note falls across the
recording, described in its own header comment as the *"AV affordance pareto-hybrid"* and the read-side
mirror of Studio's annotation timeline — is **invisible on arrival**. Measured on `sampler`'s audio
object at 1280×800:

| | `.timeline` | `.tl-track` | marks | visible in pixels |
| --- | --- | --- | --- | --- |
| item strip shown (default) | `[0, 720, 860, 80]` | `[24, 756, 812, 24]` | 3, at y 760–776 | **none** — `/tmp/ro-09-audio.png` |
| item strip hidden | same boxes | same | same | label + track + 3 marks — `/tmp/ro-11-av-striphidden.png` |

The filmstrip is an opaque cream band occupying y ≈ 703–800 of the media column; the timeline is in
`main`'s flow underneath it. The A/B is the proof: nothing about the timeline changes, only what is
painted over it. Since the filmstrip is default-on for every multi-object exhibit, the only readers who
ever see the temporal map are those on a single-AV exhibit or those who find the small **▼ HIDE**
control at `[600, 680]`.

Same family as V40 and V80, but the failure is stacking rather than anchoring, and the casualty is a
whole feature rather than a readout.

**Repro:** `/viewer/#/sampler` → the Kryptogramm recording; then click **HIDE**.

*(Principle: Look. Prior art: `osd-audio-video/audio-canvas.html:31-35` gives the time axis its own
reserved 120 px band as the primary canvas, never a strip in the gutter.)*

### V50 — The audio object is 860×700 of empty cream with a browser-default scrubber *(Severity: high — Look)*

**Surface:** `MediaPlayer.svelte:164-169` `.audio-stage`.

**Weakness.** The listening station renders: an eyebrow, the title, and a native `<audio controls>` at
`[174, 419, 512, 54]` — Chrome's grey pill, `0:00 / 4:56`, three UA glyphs. Nothing else. The whole
media column (860×700 above the timeline) is otherwise blank, and the one element the reader must
operate is the only thing on the page in browser chrome rather than Archie's warm-paper language. In
`/tmp/ro-09-audio.png` the app's visual identity simply stops at the control.

The asymmetry with authoring is the sharp end: **Studio authors AV against a wavesurfer waveform** —
`apps/studio/src/AvEditor.svelte:252-253` imports `wavesurfer.js` plus its regions plugin. A curator
places a note at 0:45 by eye on a waveform and publishes to a reader who has no waveform to see it
against, so the note's *placement* — the thing the curator actually judged — is unrepresented. (This
is not the embed's CSP constraint: `packages/archie-viewer/src/av-player.ts:15` deliberately avoids
wavesurfer for ADR-0019's no-`unsafe-eval` keystone, but `apps/viewer` is under no such rule and
`wavesurfer.js` is already a repo dependency.)

`GOAL.md:20-24` ranks **Look** first; this is the surface where it is thinnest.

**Repro:** `/viewer/#/sampler` → the Kryptogramm recording *(`/tmp/ro-09-audio.png`)*.

*(Principle: Look; parity between what the author judges and what the reader sees. Prior art:
`osd-audio-video/audio-canvas.html:274` — wavesurfer 7 as the audio canvas, regions drawn on it;
`hyperaudio-lite` pairs an active-line transcript with a visible time surface.)*

### V51 — Paused at 0:00, the first transcript line is already lit as "the line being spoken" *(Severity: low — Feel / copy)*

**Surface:** `MediaPlayer.svelte:73` `activeIdx` = `activeNoteIndex(ranges, currentTime)`, and the
sidebar hint at `:205`.

**Weakness.** Measured on arrival: `{ paused: true, currentTime: 0 }`, and `.cues button.active` is
cue 1 (`0:00 The recording opens…`), rendered with the accent left-stripe and `--accent-muted` fill —
the same treatment it will have while actually playing. The hint promises *"As it plays, the line being
spoken lights up"*, so the signal is asserting playback that has not started. Cue 1 starts at t=0 and
`activeNoteIndex` is time-only, with no notion of whether the media is running.

Low severity because the harm is a soft lie rather than a lost capability, but it is the one status
signal on the surface and it fires before there is any status to report.

**Repro:** `/viewer/#/sampler` → the Kryptogramm recording, do not press play *(`/tmp/ro-09-audio.png`)*.

*(Principle: honest system status. Prior art: `hyperaudio-lite/css` reserves `.highlight.active` for
the played position and does not pre-light the head.)*

### V52 — ADR-0021's `t=` landing seek is correctly built and structurally unreachable *(Severity: high — Feel)*

**Surface:** `av-landing.ts` `clampSeekStart` → `MediaPlayer.svelte:113-125` `landSeek`, reached only
via `#/<slug>/a/<note>?t=<offset>`.

**Weakness.** The implementation honours the ADR exactly: `landSeek` sets `currentTime` directly and
never calls `seekTo` (which couples `play()`), so a landing seeks **paused**; the offset is clamped to
the loaded duration; garbage resolves to the head. There is nothing wrong with the code.

There is also no way for a reader to reach it. Published note ids are full IRIs containing `/`
(`https://micahchoo.github.io/…/sampler/annotations/0000000004CNX7MQKVXP3NV49Q/v1` — verified in
`apps/viewer/public/published/sampler/canvas/sa1/annotations.json`), `resolveNoteArrival`
(`note-arrival.ts:26-40`) matches the id **exactly**, and the hash grammar is `/`-delimited. Driven,
all three plausible forms degrade to the exhibit:

| URL form | Result |
| --- | --- |
| `#/sampler/a/https%3A%2F%2F…%2Fv1?t=45` | *"That note isn't here anymore — showing the exhibit instead"* |
| `#/sampler/a/https://…/v1?t=45` | same |
| `#/sampler/a/0000000004CNX7MQKVXP3NV49Q?t=45` (bare ULID) | same |

**V100** established that the note rung is unsatisfiable. This is that fact's cost inside vertical 3:
the entire ADR-0021 AV-landing feature — the one this ticket was told to judge — has no reachable path
in the shipped corpus, and its unit tests (`av-landing.test.ts`) pass anyway. Recorded as a separate
finding, at V100's severity, so the AV consequence is not lost when V100 is fixed as a routing bug: a
`t=` fix ticket needs to re-verify the seek behaviour once an id form exists that the route can carry.

**Repro:** the three URLs above *(drive `.audit-readobj-8.mjs`)*.

*(Principle: a feature the reader cannot reach is not shipped. Extends `V100`.)*

### V53 — The AV reader drops four affordances the image reader has, with no notice *(Severity: medium — coverage)*

**Surface:** `MediaPlayer.svelte` vs `Reader.svelte`, same exhibit, adjacent objects.

**Weakness.** Measured on `sampler`'s audio object, then its image object:

| Affordance | image Reader | AV MediaPlayer |
| --- | --- | --- |
| readings legend | yes (when the exhibit has readings) | **`legend: false`** — never rendered |
| Notes / Details tabs + `MetadataList` | yes (`Notes · N` / `Details · N`) | **`tabs: []`, no metadata surface at all** |
| tag chips → the finder (Q-4) | yes, per note card | **none** |
| note popup / lightbox / reading sheet | yes | **none** — transcript prose only |

Stepping from a folio to a recording inside one exhibit silently removes the interpretive layer, the
descriptive-metadata surface and the cross-cutting discovery affordance. Nothing marks the difference,
so a reader who used the legend on folio 1 has no way to know whether the recording has no readings or
whether the surface just doesn't show them.

The metadata half compounds **V104** (*the Dublin Core surfaces render nothing, anywhere*): on AV
objects there is no surface to render into, so authored metadata on a recording is structurally
unreachable rather than merely empty. Worth separating in the fix.

**Repro:** `/viewer/#/sampler`, audio object vs image object *(`/tmp/ro-09-audio.png`,
`/tmp/ro-08-sampler-grid.png`)*.

*(Principle: consistency across object types.)*

---

## The region vocabulary

### V54 — Not one polygon region exists in the corpus, so half of both overlays is content-untested *(Severity: low — coverage / showroom)*

**Surface:** `read-overlay.ts:95-104` `overlayShapeFor`'s `SvgSelector` → `parsePolygonPoints` branch,
and its Annotorious counterpart.

**Weakness.** Inventoried every `canvas/*/annotations.json` in the published tree — 6 exhibits, 56
targets:

| Selector | Count |
| --- | --- |
| `FragmentSelector` (`xywh=`) | **48** |
| bare IRI (whole-object, ADR-0018) | **8** |
| `SvgSelector` (polygon) | **0** |

The ticket asked for both `xywh` Fragment and `SvgSelector` polygon regions. The polygon path could not
be driven in either consumer, in any exhibit, because no shipped content exercises it. It has unit
coverage (`read-overlay-geometry.test.ts`) and zero pixels.

Two costs. The v1 shape vocabulary's other half — including `polygonBBox`'s bbox-anchored SVG
user-space mapping, the only place the embed's local `viewBox` math is non-trivial — has never been
seen rendered. And the showroom shows a first-time visitor a box-drawing tool: every mark in the demo
library is a rectangle, so the capability reads as absent.

**Repro:** the inventory above, over `apps/viewer/public/published/*/canvas/*/annotations.json`.

*(Principle: the demo library is the product's face. Prior art: `annotorious-openseadragon`'s own demo
leads with a polygon precisely because it distinguishes the tool from a crop box.)*

---

## The embed's canvas

### V55 — The embed's note card lands on top of the locator minimap *(Severity: low — Look)*

**Surface:** `packages/archie-viewer` `createNoteCard` over the OSD navigator (`locator: true`,
`Archie-6f25`).

**Weakness.** Both canvas overlays are anchored bottom-right and collide. Measured with a note open on
`voynich`/f1r at 1280×900: the note card occupies `[874, 535, 394, 145]` and the navigator sits at
roughly `[1084, 590, 184, 85]` — the card covers its left two-thirds. Visible in
`/tmp/ro-32-embed-selected.png`: the minimap survives as a sliver of frame to the right of the card.

The embed has exactly two canvas overlays and they overlap. The shell solved the same problem by
convention (`Reader.svelte:313-318`: legend top-left, note popup bottom-left, locator bottom-right,
scale cue top-right) — a convention the embed does not share because its markup was ported, not
imported (`element.ts:9-10`).

**Repro:** the embed against `apps/viewer/public/published/` → `voynich` → f1r → open the note
*(`/tmp/ro-32-embed-selected.png`)*.

*(Principle: Look.)*

### V56 — The embed drops readings entirely: three readings in the library, zero coloured marks, no legend *(Severity: medium — Look / consistency)*

**Surface:** the embed's object view against a library that carries `readings.json` +
`annotations-<reading>.json`.

**Weakness.** Driven against the `voynich-rosettes-copy` zip, which ships `readings.json` and three
per-reading annotation pages (`cipher`, `hoax`, `abjad`), the embed renders **one** region shape (the
base note) plus the whole-object frame, and `legend: false`. The reading annotations are not drawn, not
listed, and not selectable; there is no control that could reveal them.

This extends **V69** in a way that changes the fix. V69 records that the embed's marker carries no
reading *colour*. The stronger measured fact is that the embed carries no *readings* — ADR-0007's
competing-interpretations model, the feature that distinguishes Archie from an image viewer, is absent
from the consumer that renders on other people's sites. Colouring the existing hairline would not
recover it.

**Repro:** the embed against `/Archie/archie-loop-ovGxms/published.archie.zip` → the folio
*(drive `.audit-readobj-10.mjs`: `shapes` = 2, `legend: false`)*.

*(Principle: consistency; ADR-0019's sanctioned divergence is the marker *layer technology*, not the
model it renders.)*

---

## Embed re-verification — the six provisional findings, against the current build

All six re-driven on **2026-07-25** against `dist/archie-viewer.js` mtime
**`2026-07-24 19:52:37`** (`packages/archie-viewer/dist/` 19:55:18 — same source, later copy). Host
page: a plain `<archie-viewer src="…">` scripting `/Archie/dist/archie-viewer.js`, served by
`python3 -m http.server 5199` over `/mnt/Ghar/2TA/DevStuff/Annotators/Image` — **no Vite instance was
started**; `apps/viewer/node_modules/.vite/deps` was untouched. Two substrates: the published tree
(`/Archie/apps/viewer/public/published/`, which carries rights, readings, a narrative and a 12-object
exhibit) and `archie-loop-ovGxms/published.archie.zip`.

**No verdict flipped. All six stand.**

| # | Claim | Verdict | Evidence on the current build |
| --- | --- | --- | --- |
| V68 | a note opens with the keyboard but not with the mouse | **still true** | see below |
| V69 | the marker is a 1.5px near-black hairline with no reading colour | **still true** | computed on the region geometry: `stroke: rgb(42, 35, 32)`, `stroke-width: 1.5`, `fill: rgba(0,0,0,0)` — invisible in `/tmp/ro-32-embed-selected.png` over parchment |
| V70 | no note list, so the marker is the only door | **still true** | the object view's complete visible control set is `["← The Whole Manuscript"]` plus the note card's `×`. No list, no legend, no finder |
| V30 | no way to move between objects at all | **still true** | confirmed on a **12-object** exhibit (`voynich`), not just a single-object one: same one-control set, no prev/next, no stepper |
| V88 | the narrative is dropped — prose in, thumbnail grid out | **still true** | `voynich-reading` renders 12 `button[data-obj]` thumbnails; zero prose paragraphs, no sections, no spine |
| V105 | no attribution, licence or metadata at all | **still true** | `credit: []` at gallery *and* object level against the published tree, whose manifests do carry `requiredStatement` (the shell shows *"Beinecke Rare Book & Manuscript Library, Yale University — MS 408 (public domain)"* on the same object) |

### V68 — confirmed, and the mechanism is now pinned

Re-run four ways on `voynich`/f1r, current build:

| Attempt | Note card |
| --- | --- |
| real `mouse.click` at the region's centre (636, 375) | **no** (`display: none`) |
| slow press–release (130 ms) on the region's stroke edge | **no** |
| synthetic `click` dispatched on the geometry element | **yes** (`display: block`, correct body text) |
| focus the `svg[role="button"]`, press **Enter** | **yes**, plus the white focus ring (`outline: rgb(255,255,255) solid 2px`) |

Two additions to V68's record:

- **The listener is fine.** A synthetic `click` on the geometry opens the card, so `styleGeometry`'s
  handler (`read-overlay.ts:209-212`) and the whole `emitSelect` → `onSelect` → `noteCard.show` chain
  work. The defect is entirely that pointer events never reach the element:
  `shadowRoot.elementFromPoint` at the region's own centre returns an unnamed `DIV`, as V68 found.
- **Nothing happens at all.** I expected OSD's click-to-zoom to be eating the click and to at least
  move the camera; measured, it does not — the region's bbox is byte-identical after one click and
  after two (`401×552` → `401×552` → `401×552`, zoom factor 1.000). The click is swallowed with **zero**
  feedback of any kind. That is worse than a wrong response and worth stating in the fix ticket.

### Two provenance notes for whoever cuts the tickets

- V68's original drive used `recipes/try.html`, which the roll-up warns pins a jsDelivr build. Checked:
  `try.html:34` scripts the **local** `/dist/archie-viewer.js` (the `@v1.1` CDN pin is a separate demo
  at `:94`), so V68's original measurement was against the working tree after all. No correction needed.
- V105 could **not** be re-verified against either available `.archie.zip` — neither
  `archie-library.archie.zip` nor `archie-loop-ovGxms/published.archie.zip` carries any
  `requiredStatement`, `rights` or `metadata` in its manifests, so an absence there proves nothing. The
  verdict above rests on the **published tree**, which does carry them. Any future embed-attribution
  drive must use the tree, not those zips.

---

## Checked and cleared — do not re-report

- **`fitBoundsRect`'s sidebar-reservation branch never runs, and that is correct.** `Canvas.svelte`
  never supplies `getFitOptions`, so `mount.ts:29`'s `PLAIN_FIT` always applies and the
  `w / (1 - f)` widening (delaminated from `anvil/app/src/embed/EmbeddedReader.svelte:314-337`) is
  dead in the viewer. It looks like a bug and is not: anvil's sidebar *overlays* the canvas, whereas
  Archie's Reader aside is a **flex sibling**, so OSD's container (`main`, measured 924 px) already
  excludes it and no reservation is needed. Leave it alone.
- **The legend's counts are additive and correct.** `General notes 2 / Cipher 1 / Hoax 1 /
  Natural-language 1` against a sidebar reading `Notes · 2` looks like a 5-vs-2 contradiction. It
  isn't: base notes are always shown and an active reading *overlays* its own (ADR-0007 / Q16).
  Measured — selecting Cipher takes the list 2 → 3 and the heading to `Notes · 3`. The counts describe
  what each layer *adds* to this image, which is what the `title` attribute says.
- **The exclusive-radio legend (at most base + one reading) is a ratified v1 decision**, archie-ux
  Q-2, noted in `ReadingLegend.svelte`'s header. Not a defect.
- **Select-to-zoom itself works in the shell, by mouse and from the list.** `Zoom 1×` → `1.2×` on a
  click inside the region, → `9.3×` on a small mark; the correct note becomes `.active`. The ADR-0006
  nav contract holds in the shell — V43 is about the *framing* of that fit, not its absence.
- **The dark pill of icons at the bottom-centre of every canvas screenshot is Astro's dev toolbar**,
  not clipped OSD controls. Its host element is outside `.reader`, `elementsFromPoint` at (650, 790)
  never returns it, and it does not ship. I chased it before identifying it; don't repeat that.
- **The note popup's authoring prose is seed data, not a viewer defect.** The Rosettes cipher note
  ends `(§H cross-link, O3 §5: repointed from the sunset bidar exhibit … archie: in-body ref grammar
  from link.ts …)`, which a first-time visitor reads in full. It belongs on a seed-content ticket, not
  a UX one.
- **The note popup's `×`, expand affordance and text/tag duplication** are **V60**/**V62**/**V64**'s
  ground (vertical 4). The filmstrip's unlabelled frames are **V28**'s. The unchanged hash on note
  selection is **V101**'s. None re-reported here.
- **The two unnamed canvas tab stops** (`div.openseadragon-canvas`, `svg.a9s-annotationlayer`) are
  **V90**, already filed as shared/library-owned. V45 is the different, larger fact about *regions*.

## Not reached, and why

- **The portable (`.archie.zip`) shell mode at the canvas.** ADR-0008's second data source was driven
  by verticals 1 and 5; on the read surface it would need a zip with region annotations *and* a
  narrative, and the two available zips each have only one. The findings above are shell-hosted +
  embed. V43/V44/V47/V48 are pure component/geometry facts and cannot differ by data source; V49–V53
  (AV) are untested against a dropped zip.
- **Viewport widths other than 1280×800 / 1280×900.** V40, V48 and V49 are all geometry findings whose
  magnitudes will move with the viewport, and a narrow-viewport pass would likely find more. Not run.
- **The `SvgSelector` polygon path in either consumer** — see V54; no content exists to drive it.
- **The embed's own `fitBounds`-on-select.** Source-verified rather than driven: `element.ts:368-370`'s
  `onSelect` shows the note card and nothing else, so a click never moves the camera (corroborated —
  zoom factor 1.000 across two clicks). The only `fitBounds` call site is the deep-link
  `#applyFragment` path (`:442-445`), which V52's id problem makes unreachable in the shipped corpus.
  So the ADR-0006 select→camera contract is present in the shell and absent from the embed's only
  working selection path; I could not drive the embed's deep-link branch to confirm it in isolation.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted | yes | V40–V54 |
| `apps/viewer` portable | no — see "Not reached" | none |
| `packages/archie-viewer` embed | yes, local `dist/` (Jul 24 19:52), two substrates | V44 (embed half), V45, V55, V56 + the six re-verifications |
| `packages/render-mount` | yes, through the embed's DOM-SVG overlay | V44, V45, V56 |
| the published static tree | yes, as the selector inventory's substrate | V54 |

Drive scripts: `.audit-readobj-1.mjs` … `.audit-readobj-15.mjs` at the repo root, plus
`.audit-embed-host.html` beside the served root. All deleted after the drive; the static server on
5199 was killed.
