# The AV reading surface — four tickets, two of them re-measurements

**Branch** `fix/av-surface-slice` off `origin/main` **`0c0b121`**.
Tickets: `Archie-d37d`, `Archie-d6e9` (re-measurements), `Archie-4524` (legend), `Archie-7b86` (design items).

Two of the four had no subject left. That is the headline, and both were established on a clean tree
before a line of source changed — the ordering matters, because a measurement taken through your own
edits cannot tell "the dock fixed it" from "I fixed it by accident."

---

## 1. `Archie-d37d` — CLOSES, obviated by the chrome dock

The ticket: the cite trigger sits on top of the AV note card's first tag chip, 62px of horizontal
overlap, a real driven `click()` times out with `<button class="cite-trigger"> subtree intercepts
pointer events`. It asked for a re-measurement against the docked build first, and named the two
possible readings — *if the trigger is canvas chrome it leaves with the dock; if it is note-card
chrome it needs its own answer.* **The first reading is the true one.**

Measured on a clean tree at `0c0b121`, offline, `#/sampler` → the audio object → cue `t=180,220`,
viewport 1280×720 — the ticket's exact route:

| | before (the state d37d was filed against) | after (docked) |
| --- | --- | --- |
| `.note-pop` | — | y 479 – **592** |
| `.chrome-dock` | did not exist | y **592** – 720 |
| `.cite-trigger` | x 20–100, y 556–588 | x 20–100, y **641–673** |
| `#cadence` chip | x 38–122, y 560–572 → `elementFromPoint` = **`SPAN.lbl`** | x 22–106, y 564–576 → **`BUTTON.tag tag-btn`** |
| `#transcript` chip | x 134–245, y 560–572 → `BUTTON.tag` | x 118–229, y 564–576 → `BUTTON.tag` |
| real driven click on the FIRST chip | timed out | **succeeds**; finder opens with `#cadence` pressed, `#transcript` not |

The horizontal overlap did not go away — it grew, from 62px to 78px — and it stopped mattering. The
note card and the chrome bar are flow siblings in one column, so the card ends at y 592 and the bar
begins at y 592. No amount of x-overlap can make one cover the other. That is the ticket closing
*obviated* rather than fixed, and it is the same shape as the two `closes obviated` the dock already
claimed (`Archie-c30a`, V42).

**What shipped anyway, because the measurement is not the guarantee:** `av-surface.spec.ts` used to
drive the SECOND chip and say why. It now hit-tests EVERY chip with `elementFromPoint` and drives
BOTH, with the before/after table above recorded at the call site — the ticket's own "when this is
fixed, move it to the first chip and assert both". The fixture comment in `sampler.ts` that recorded
the defect was corrected rather than deleted.

## 2. `Archie-d6e9` — CLOSES, the pairing is correct and the corpus agrees

The ticket is explicitly not a fix: it carries V23's re-measurement and a named remainder — *two
object-stepping affordances co-present on every reader surface, differing in access model* — and asks
whoever takes it to decide whether the pairing is correct.

Re-measured against the docked build, same route (`#/sampler` 3 objects, `#/voynich` first 3 of 12),
1280×720, offline. **Unchanged from the ticket's figures**, which is itself the finding: docking moved
the filmstrip out of a fixed overlay into a flow row and changed neither count.

| object | `.player` | `nav[aria-label="Objects in this exhibit"]` | `nav[aria-label="Media in this exhibit"]` | stepper text |
| --- | --- | --- | --- | --- |
| `sampler` [0] video | 1 | 1 | 1 | `‹ Object 1 of 3 ›` |
| `sampler` [1] audio | 1 | 1 | 1 | `‹ Object 2 of 3 ›` |
| `sampler` [2] image | 0 | 1 | 1 | `‹ Object 3 of 3 ›` |
| `voynich` [0..2] image | 0 | 1 | 1 | `‹ Object N of 12 ›` |

Landmarks identical on every surface: `["Breadcrumb", "Media in this exhibit", "Objects in this
exhibit"]`. Exactly **one** object stepper per surface, sourced from whichever surface owns it.

**Judgement: no fix. The pairing stands.** The ticket's own argument — filmstrip is *glance-and-jump*
(random access to a named thumbnail), stepper is *prev/next relative motion* — is corroborated by the
corpus, opened at the line:

- **universalviewer ships both, simultaneously, by default.** `PagingHeaderPanel.ts:91/99/233/241`
  builds first/prev/next/last; `ContentLeftPanel.ts:200` mounts `thumbsView` in the same UI
  (`ContentLeftPanel.ts:4` imports it, `:127`/`:236` open it). Direct support for the pairing.
- **mirador ships the stepper unconditionally and the strip opt-in.** `ViewerNavigation.jsx:44-58` is
  prev/next canvas, mounted from `WindowCanvasNavigationControls.jsx:69` ← `WindowViewer.jsx:19` — no
  gate. The thumbnail strip is a companion window whose `defaultPosition` is **`'off'`**
  (`config/settings.js:521`). So mirador's *unconditional* affordance is the stepper, which is the
  same one Archie makes unconditional.
- **clover-iiif is the stated ABSENCE, and it cuts the other way.** `Content.tsx:141-145` renders
  `<Media items={items} activeItem={0}/>` gated on `sequence[1].length > 1` and there is **no**
  prev/next stepper in the canvas at all. So the corpus is not unanimous — one of three ships the
  strip alone. What no corpus system does is ship the strip *instead of* a stepper on a surface that
  has one; and Archie's reason for the stepper (an AV object has no canvas chrome to hold nav — V65)
  has no analogue in any of them, because none has an AV reading surface with an annotation spine.

The original `SidebarObjectNav` header's "discoverable, full-width twin" framing is therefore an
argument FOR the pairing, exactly as the ticket's Watch says, and nothing in the corpus contradicts
it. V23's remaining statement is answered: **the pairing is deliberate, corpus-normal, and correct.**

## 3. `Archie-4524` — the reading legend, fixture-verified first

**The fixture already existed, and I verified rather than assumed it.** `5252f69` ("fixture(f4fb,4524):
a polygon region and the first reading-bearing AV note") added it: `apps/viewer/fixtures/voynich.ts:363`,
a **fifth** `voynichAvNotes` entry at `t=165,205` carrying `reading: "abjad"`, appended rather than
folded into the four (`.claude/rules/test-fixtures.md`). Its own comment says it is deliberately
unasserted and why: `annotationsOf` returns the base notes alone while `activeReading === null`, and the
AV surface had no control that could set it — the note was in the published tree and structurally
unreachable. So the ticket's step 1 was done; steps 2 and 3 are this.

### What was built

- **`MediaPlayer.svelte`** takes four new props (`readings`, `activeReading`, `onreading`,
  `readingCount`), all optional with inert defaults so an unwired host renders no legend rather than an
  empty one. The legend mounts as the media column's leading ROW (`.media-dock`) — the same seat, same
  padding and same border as the image reader's `.canvas-dock` (`Reader.svelte:386-389`).
  Deliberately in `main` and **not** in the aside: the ticket's Watch forbids pushing the transcript
  toward collapse, and this aside cannot collapse at all (`collapsible={false}`, it holds the object
  nav), so anything added to it comes straight out of the reading measure.
- **The layer's colour reaches the spine.** A reading-bearing cue carries its reading's hue on the
  row's left edge, inline so it wins over the `.active` rule — the arrangement the image note LIST
  uses (`Reader.svelte:540`). Set only when the cue belongs to a reading, which is the one deliberate
  difference: `Reader`'s list has no playhead and this spine does, and `.cues button.active` spends
  the same border on "the line being spoken". A base cue keeps that signal; a reading cue trades it
  for identity and keeps the spoken state on the fill.
- **`styleOf` — the fifth prop the ticket named — was NOT taken, and the absence is the finding.** It
  returns a `MarkerStyle` for OpenSeadragon marks and this surface has no marker canvas to apply one
  to. The colour still reaches the reader by the route above (`readingIdOf` against the `readings`
  registry, `Reader.svelte:172-176`), which needs no extra prop at all.
- **Hide-all is WITHHELD, and `ReadingLegend` now gates it on the handler.** `hidden`/`onhiddenchange`
  mean "the canvas draws no markers"; on AV the notes ARE the transcript being read along with, so
  there is nothing honest for the toggle to do. It previously rendered unconditionally and called
  `onhiddenchange?.(…)`, i.e. an unwired host would ship a control that renders, is enabled and does
  nothing — the dead-door defect. Now `{#if onhiddenchange}`. Reader and NarrativeReader both pass it,
  so nothing changes for them, and a test asserts the image reader still has it (so this reads as a
  per-surface decision rather than a deletion).

### `ExhibitView.svelte` — the exact diff, both mount sites, append-only

```diff
@@ grid AV player (:574-589)
           onoverview={() => (selectedObjectId = null)}
           onopenfinder={(tag) => openFinder(tag)}
+          readings={data.readings}
+          activeReading={activeReading}
+          onreading={(id) => (activeReading = id)}
+          readingCount={readingCountOf(activeData.id)}
         />
@@ narrative-index AV player (:601, one line)
-            <MediaPlayerLazy.current object={indexData} … onopenfinder={(tag) => openFinder(tag)} />
+            <MediaPlayerLazy.current object={indexData} … onopenfinder={(tag) => openFinder(tag)} readings={data.readings} activeReading={activeReading} onreading={(id) => (activeReading = id)} readingCount={readingCountOf(indexData.id)} />
```

Nothing else in that file was touched: not the `locus` derivation or its `$effect`, not the
`SearchOverlayLazy` block, no import reordering, no re-indentation. All four props are optional on
`MediaPlayer` with defaults, so the component compiles and behaves in either merge order.

### Prior art

The corpus has **no rival-interpretation legend to copy** — that is a stated absence and Archie's
readings are original. What the corpus decides is the RULE that the legend belongs on an AV surface at
all, and it is unanimous: every multi-media viewer swaps the *painting engine* by media type and keeps
the *annotation reading surface* identical.

- **clover-iiif** `src/components/Viewer/Viewer/Content.tsx:133-138` — `<Painting … isMedia={isAudioVideo}>`
  carries the media flag; `:178-186` hands `<InformationPanel …>` seven props and **not one** is that flag.
- **mirador** `src/components/WindowSideBarAnnotationsPanel.jsx:14-42` — the reading panel's whole
  signature is `{annotationCount, canvasIds, windowId, id}`; the media branch lives on the canvas
  (`PrimaryWindow.jsx`).
- **hyperaudio-lite** `js/hyperaudio-lite.js:648-664` is the constraint the ticket names: hiding the
  transcript obliges you to re-home the position signal to `document.title`. The legend takes a row in
  `main`, above the media and beside nothing — the `.timeline` position signal is untouched by it.

## 4. `Archie-7b86` — V49 confirmed closed; V50 NOT taken, with the reason

**V49 is closed by the dock, measured.** The ticket's own resolution note left it open with "re-measure
before re-fixing", and `av-surface.spec.ts`'s second V49 test was marked **⚠ KNOWINGLY RED on
`dca4215`** (the map's `.tl-track` sat 153px below the fold, `toBeInViewport` ratio 0). On `0c0b121`
both V49 tests are **green**: the map does not overlap the strip or any of its 12 frames, and it is on
screen on arrival without scrolling. That red was a defect in the docked layout, and the docked layout
that shipped fixed it. No change was needed; the assertion that would catch a regression is already in
the file.

**V50 (the audio waveform) was NOT taken, and this is a scoping report rather than a deferral.** Three
things were established before stopping, so the next taker does not re-derive them:

1. **The ticket's premise about the dependency was already known-wrong** (recorded at `5b08f9a`) and is
   still wrong: `wavesurfer.js` is in `.claude/rules/deps-index.md` (a docs index) and in one
   aspirational comment at `ExhibitView.svelte:24`. It is in no `package.json`, no
   `optimizeDeps.include`, and nothing imports it. `mcp__context__get_docs("wavesurfer.js", "peaks")`
   returns **`Package not found`** — the docs index entry has no package behind it either, so the
   ticket's "check the docs before hand-rolling" step is not currently available and needs a
   `context add` first.
2. **The prior art is real and reads as the ticket says.** `osd-audio-video/audio-canvas.html:274-276`
   imports `wavesurfer.js@7.8.6` plus its Regions and Timeline plugins from unpkg and creates the
   instance at `:294`. It is a direct donor for the shape.
3. **The blocker is a perf contract, not a scheduling one, and it is the thing to decide first.**
   wavesurfer computes peaks by decoding the whole file through WebAudio unless it is handed
   precomputed `peaks`. Archie's seed recording is a **296-second remote MP3** that `<audio>` streams
   today; drawing a waveform for it means downloading and decoding all of it on arrival at the object.
   Precomputed peaks would be a publish-time bake — Studio and `render-core` work, outside this slice's
   territory — and `.claude/rules/perf-measure-the-flow.md` is explicit that a change on the per-object
   read path is not done until the end-to-end number moves. So V50 is a slice with a dependency
   decision and a publish-pipeline question in it, not a component edit, and starting it here would
   have meant either a silent regression on the read path or reaching into two packages I do not hold.

V50 therefore stays open on `Archie-7b86` with the above written down. V51, V29, V53 and V49 are all
resolved; V52 is scoped out; V50 is what the ticket now is.

---

## Gates

Every number below was copied from output, not inferred from a neighbouring one.

| gate | result |
| --- | --- |
| `apps/viewer` `pnpm exec vitest run` | **22 files, 184 tests passed** |
| `apps/viewer` `pnpm run typecheck` (TS 7 native, by path) | clean |
| `apps/viewer` `pnpm run check:svelte` | **1523 files, 0 errors, 0 warnings** |
| `apps/viewer` e2e `av-surface.spec.ts` | **16/16 passed** |
| `apps/viewer` e2e, whole suite | see the table in *Repeat runs* |

e2e ran on `VIEWER_E2E_PORT=4361` throughout, one run at a time, each one rebuilding
(`gen-published` + `astro build`) in its own webServer — the log was checked for the build lines
rather than assumed (`.claude/rules/viewer-e2e-shared-port.md`).

### The three failures my own change caused, and what each taught

All three were caught by running, and all three were informative rather than noise. Recorded because
"it went green on the second run" hides them.

1. **`.player aside` became a strict-mode violation.** `ReadingLegend`'s root is an
   `<aside class="legend">` (its complementary-landmark rule), so mounting it inside `main` gave
   `.player` two asides and the pre-existing resize test resolved to 2 elements. Fixed by naming the
   transcript aside precisely — `.player > aside` — which is what `occlusion.spec.ts:193` already does
   for the narrative (`.narrative > aside:not(.legend)`). Not a workaround: the previous selector was
   simply less precise than the DOM.
2. **The base count is 5, not 4.** My first draft asserted `General notes4` to match the four
   transcript lines. `readingCount` counts NOTES on the recording and the spine renders the
   TIME-RANGED ones; o12 also carries a whole-track note. The count doing its job.
3. **`hasText: "root-and-pattern morphology"` matched TWO cues.** The base cue at `45,80` uses the
   same phrase ("Under the abjad reading this resembles a root-and-pattern morphology (Bax)"). Matched
   on the abjad note's opening clause instead. Worth recording: a `hasText` that matched a *neighbour*
   would have made the colour assertion ambiguous rather than failing — on a fixture written to argue
   about the very phrase being matched.

### Red-green, per new assertion

See the section below — filled in after the probes were run, on a committed tree, restoring from
`/tmp` rather than `git checkout --`.

### Repeat runs

See below.
