# FIX — the finder says where it found things (V106, Archie-9eeb)

**Branch** `fix/finder-locus` off `origin/main` at **`0c0b121`**.
**Files** `apps/viewer/src/lib/search-index.ts`, `apps/viewer/src/components/SearchOverlay.svelte`,
`apps/viewer/e2e/finder-locus.spec.ts`, and **two lines** of `apps/viewer/src/components/ExhibitView.svelte`.

## What a hit says now

Before, a finder result was a body snippet and some tag chips. On the seed narrative that meant
eighty-seven rows of prose with nothing to tell you which of twenty-one folios you were about to be
sent to. A result now leads with **where it lives**, above what it says:

```
S3-CANVAS   § Annotate an image
Draw a region, write the note in the popover anchored right where you drew it…
```

The object's authored label, and — in a narrative — the section that shows it. Activating the result
still lands on the note's own rung, which it already did; what changed is that you can now tell,
before clicking, where clicking will take you.

## Where it came from, and where it deliberately didn't

`locateNotes` (`search-index.ts`) is a pure projection from note id to *place*. It builds **no
address**. That is the ticket's central constraint and it is worth restating because the temptation
is real: `routeToHash` is right there, and the finder could have assembled `#/<slug>/a/<id>` itself
in four lines. It doesn't. `ExhibitView.svelte:206`'s `locus` derivation is the one address writer,
`choose()` routes through `onselect → arriveAtNote → locusNote`, and that derivation writes the bar.
A second writer would agree with the first until the day it didn't.

The object rung was free: `annotationsByObject` and `readingAnnotationsByObject` are **keyed by object
id**, so the finder always knew *which* object a hit sat on. What it could not know is what that
object is **called** — and a ULID is not a locus a reader can read. That, and only that, is why this
touched `ExhibitView.svelte`.

Two judgement calls inside the projection, both of which chose an honest gap over a plausible answer:

- **A section is named only when exactly one activates the object.** A note is anchored to an object;
  a section merely *activates* one (`model.ts:189`), and a spine may revisit an object across several
  sections. Where two sections share an object, none owns the note, and naming one would be a
  confident lie about where the reader lands. The object name stands alone there, which is true
  either way.
- **An object with no known label yields no entry at all**, rather than a row reading `o17`. The
  overlay draws nothing in that case.

## Prior art

Every citation below was opened at the line. Two claims that had been circulating are corrected
rather than repeated, per `.claude/rules/prior-art-citation-discipline.md`.

**The shape of the row — two donors, and the axis that picks between them.**

- **clover-iiif** carries location as a **group header**: `ContentSearch.tsx:50-58` groups hits by
  `target.source.id`, and `:83-88` renders each group under `<header><Label label={canvas.label}/></header>`.
  Never a repeated per-row field.
- **mirador** carries it **per row**: `IIIF/mirador/src/components/SearchHit.jsx:120-125` renders
  `<CanvasLabel>{canvasLabel}</CanvasLabel>` inline above each hit's snippet, fed by
  `containers/SearchHit.js:49-52` (`getCanvasLabel` off `hitAnnotation.targetId`).

**We took mirador's, and the reason is structural rather than aesthetic.** Clover's grouping is free
because its Content Search results arrive **in document order from the server** — regrouping by canvas
costs no information. Ours are a **MiniSearch relevance ranking** (`filterResults`), so grouping by
object would reorder the list by *place* instead of by *match quality*, which is the wrong trade for a
list the reader reached by typing. Both shapes have real precedent; the axis is whether the list is
ranked.

The repetition clover's shape avoids is bounded here and was measured rather than assumed: 21 objects
across 87 notes, so a label repeats about four times, not twelve. **Found-not-fixed:** if an exhibit
ever concentrates its hits on one object, the group header becomes the better shape.

**Naming a hit by a narrative unit rather than a canvas — quire, and only quire.** Every IIIF system in
the corpus labels a hit by canvas/page identity. Quire labels it by chapter: its Pagefind records are
built per rendered page, which in quire's structure *is* a section, and the result's title is rendered
straight as the hit's location label (`content/_assets/javascript/application/index.js:108-109`,
`item.href = result.url` / `title.textContent = result.meta.title`). The section rung follows it.

**Activation as an in-app callback, not an anchor — four of five, so this is the norm.** clover
(`Annotation/PlainText.tsx:21`, a `ButtonStyled onClick`), mirador (`SearchHit.jsx:139-140`, a
`ListItemButton onClick`) and universalviewer (`FooterPanel.ts:233-238`, `:530-532`, divs publishing
`CANVAS_INDEX_CHANGE`) all dispatch viewer state with no href. Only **quire** has a real copyable
anchor (`_includes/components/search.js:15` + `index.js:108`), and it can afford one because it is a
static site where the locus is baked at index time (`_plugins/search/search.js:100-101` indexes each
figure as `canonicalURL + '#' + id`). This is the direct support for keeping activation on
`arriveAtNote` rather than growing an href in the finder.

**A stated absence, worth more than a strained match: nothing in the corpus solves our actual
problem.** No corpus finder searches across *interpretive layers* — Archie's index spans every Reading
(`flattenExhibitNotes`), so a hit may live on a page the reader is not currently looking at. Clover,
mirador and universalviewer all search one manifest's canvases with no equivalent axis. **Which reading
a hit lives in is therefore part of "where" and is unrepresented here.** No donor exists; it is
recorded as found-not-fixed below rather than guessed at.

**Two corrections to citations that were in circulation.** Both name real files and are wrong about
what the code does:

1. *"clover's cross-canvas path still ends at the exact region — a `useEffect` at `Item.tsx:119-132`
   polls until the overlay exists, then zooms."* The effect exists, but it is gated
   `if (!openSeadragonViewer || !isContentState) return;`, and `ContentSearch.tsx` never passes
   `isContentState` to `AnnotationItem` — it passes `isContentSearch`. **For an actual search hit on a
   canvas that is not visible, `handleClick` dispatches `updateActiveCanvas` and the poll-then-zoom
   never fires.** The line numbers are right; the causal chain is not.
2. The thumbnail template at `Item.tsx:41-52` is `` `${targetResource}/${xywh}/!${computeSize(w, h)}/0/default.jpg` ``
   — the size segment passes through `computeSize`, it is not the raw `!${w},${h}` that had been
   quoted. The *concept* (crop the thumbnail at the hit's own fragment selector, so the row shows
   where it is by showing what is there) is correct, and is the most interesting idea in the corpus.
   **Found-not-fixed:** Archie's notes carry `xywh` selectors and its objects are deep-zoom pyramids,
   so a region-cropped thumbnail per result is buildable and would be a strictly better locus than a
   name. Out of scope here.

## How I know a real reader sees it

The bar for this ticket was set by how it came to exist. `Archie-3ea1` and `Archie-99b1` both recorded
V106 as delivered, both told the truth about the address grammar, and **neither opened
`SearchOverlay.svelte`.** So the claim below is about the *surface*, and the gate is a driven browser.

`apps/viewer/e2e/finder-locus.spec.ts`, four specs, all against the **built** app served by `astro
preview`, offline (all non-localhost aborted). Every expected string — object labels, section titles,
note count — is read from the published manifest at runtime, so a regenerated tree moves the
expectation instead of quietly hollowing it out.

| spec | what it pins |
| --- | --- |
| names the object and the section | the row's `.locus-object` is exactly that canvas's authored label, and `.locus-section` exactly the title of the section that activates it |
| every result carries a locus | `.result`, `.result-locus`, `.locus-object`, `.locus-section` each `toHaveCount(87)` — the denominator read from the manifest |
| real places, not ids | every rendered locus string is a member of the exhibit's actual label set, and the set spans >5 distinct names |
| activation lands on the rung | after a real click, the address matches `#/screenshots/a/<ULID>` — not `#/screenshots`, not `#/screenshots/o/<id>` — and the note's body is on the page |

`screenshots` was chosen because it satisfies three constraints at once: its images are local (so this
is hermetic), it is a narrative (so the section rung is exercised), and all 21 of its sections activate
**distinct** canvases (so the sole-occupant rule fires for every note). Its notes also live only on
**reading** pages, which makes the test stronger — a locus that stopped at the base annotation page
would place none of them.

No `Locator.count()` is branched on anywhere in the file; every count is a `toHaveCount` that waits.
The finder is behind a lazy `import()`, so `openFinder()` waits on `input.finder-input` — something the
overlay itself renders — before anything is measured.

### Red-green, five injections

Source was committed first, backed up to `/tmp/finder-backup/`, and restored **from there** — never
`git checkout --` or `git restore`. Each injection anchored with `assert s.count(old) == 1` before
replacing, so an ambiguous anchor fails loudly instead of patching a coin toss. Every run rebuilt
(`gen-published` + `astro build` confirmed in the log).

| # | injection | result |
| --- | --- | --- |
| 1 | strip the locus block from the row (the ticket's own named probe) | **3 of 4 red** — 1, 2, 3 fail; activation correctly unaffected |
| 2 | render `where.objectId` instead of `objectLabel` | **2 red** — 1 and 3 fail; **2 PASSES**, which is exactly why 3 exists: 87 ULIDs count identically to 87 names. Detail line named the strays: `o1, o2, o3…` |
| 3 | drop the `.locus-section` rung | **2 red** — 1 and 2 fail |
| 4 | `choose()` stops handing the note id to `arriveAtNote` | **1 red** — only the address spec fails, on `toHaveURL` |
| 5 | revert the facet-starvation CSS fix | **1 red** — only the driven click fails, `element is outside of the viewport` |

Injection 2 is the one worth keeping in mind: a suite of counts is satisfied by a page full of ULIDs.

### Repeat runs

Twenty **independent** `playwright test` invocations — separate processes, not `--repeat-each` — against
a build made from the restored source at 19:18, on a server whose PID cwd was verified to be this
worktree (`/proc/<pid>/cwd`) per `.claude/rules/viewer-e2e-shared-port.md`. Port `4362`; server killed
between the injection campaign and this one.

**20/20 invocations green = 80/80 test runs.** Per spec, each ran 20 times and passed 20 times,
including the driven-click spec (the one that can flake on layout settle).

### The artifact, not the exit code

`grep` over the **built** page, not the source:

```
apps/viewer/dist/screenshots/index.html
  .locus-object.svelte-danbg0{…color:var(--ink-paper-secondary)}
  .locus-section.svelte-danbg0{…color:var(--ink-paper-muted)}
  .locus-section.svelte-danbg0:before{content:"§ "}
  .finder-facets.svelte-danbg0{…flex:0 1 auto;max-height:20vh;overflow-y:auto}
  .finder-results.svelte-danbg0{…overflow-y:auto;flex:1 1 auto}
apps/viewer/dist/_astro/SearchOverlay.ZYsLH-Q0.js  →  locus-object svelte-danbg0
```

## The defect driving the surface found — Archie-8e73

Filed separately because it is not this ticket's, and because a defect fixed in passing and never
filed is invisible to anyone counting what this map found. Full measurement in the ticket; the short
form:

On `screenshots` the facet block renders **132 tag chips at 668px** inside a panel capped at 76vh
(547px). Being an `overflow: visible` flex item, its `min-height: auto` resolved to its content height
and it refused to shrink, taking the panel whole. `.finder-results` collapsed to **`clientHeight: 0`**
with **9930px** of scroll content, and the first result sat at **y=883 in a 720px viewport**. **Every
finder result was off-screen and unclickable.** Proven pre-existing by re-measuring with the locus line
`display: none`'d — identical geometry. Fixed in `SearchOverlay.svelte` (cap the facets and let them
scroll; let the results claim the remainder), red-green'd as injection 5 above.

The transferable part, and the reason it got a ticket rather than a footnote:

> The three text/count assertions stayed **green** throughout, because text and counts do not imply
> **reachability**. Only the driven click caught it.

`[[osd-overlay-wrapper]]` is *something on top eats the click*. `[[playwright-count-does-not-wait]]`
is *the count is zero because nothing hydrated*. This is a third: **the element is present, correct,
and pushed out of the viewport by a sibling that ate the height.** Every assertion about its content
passes — it is in the DOM, its text is right, all 87 are counted, and Playwright's `toBeVisible()`
returns **true**, because a non-empty bounding box outside the viewport is still "visible" by that
definition. No human can reach it. The detection question is *"could a reader's mouse get to it?"*,
and neither presence, nor text, nor count, nor `toBeVisible` answers it.

## Gates

| gate | result |
| --- | --- |
| `pnpm --filter @archie/viewer run check:svelte` | 1523 files, **0 errors 0 warnings** |
| `apps/viewer` `pnpm typecheck` (TS7 by explicit path, never bare `tsc`) | clean |
| `apps/viewer` vitest | **190/190** (17 in `search-index.test.ts`, 6 of them new) |
| `finder-locus.spec.ts`, `VIEWER_E2E_PORT=4362` | **4/4**, and 20/20 invocations |

## The ExhibitView change, quoted in full

Granted as a mount-site-only addition on a file now shared with the AV slice. Two lines, at
`:758-763`. Nothing else in the file was touched — not `locus` (`:206-227`), not its `$effect`
(`:229-235`), no reformatting, no import reordering.

```diff
       <SearchOverlayLazy.current
         data={{ annotationsByObject: data.annotationsByObject, readingAnnotationsByObject: data.readingAnnotationsByObject }}
+        objects={layout.objects}
+        sections={layout.type === "narrative" ? (layout.sections ?? null) : null}
         initialTag={finderTag}
         onselect={(id) => arriveAtNote(id)}
         onclose={() => (finderOpen = false)}
```

Both props are **optional** on `SearchOverlay` (`objects = []`, `sections = null`), so the component
compiles and degrades to today's unlabelled rows in either merge order — which is the condition that
made granting the edit safe.

## Found, not fixed

- **Which Reading a hit lives in is unreported.** The index spans every reading, so a hit may sit on a
  page the reader is not currently looking at — genuinely part of "where", and the rung most likely to
  surprise. It needs reading labels, which is a third prop and a wider claim about the noun vocabulary
  than this ticket owns. No corpus donor exists (see the stated absence above).
- **No region-cropped thumbnail.** Clover's `Item.tsx:41-52` is the sharpest idea in the corpus — show
  where a hit is by showing what is there. Archie has both halves (notes carry `xywh`; objects are
  deep-zoom pyramids). Not attempted.
- **The group-header shape becomes right if hits ever concentrate on one object.** Measured ~4x
  repetition today; clover's shape is the answer if that number climbs.
- **The 132-chip facet row is capped, not solved.** A scrollable box of 132 chips is not a usable facet
  affordance. Recorded on Archie-8e73.
- **No general in-viewport invariant.** The driven click covers the results list only because that list
  happens to be what gets clicked. A different panel child that grows would re-starve it and only that
  one spec would notice.
