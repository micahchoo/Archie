# Archie-1820 — the embed's four DEFER-tracked capabilities

**Branch** `fix/embed-defer` · **base** `0c0b121` (`origin/main`) · **2026-07-26**

ADR-0019's capability contract carried four `DEFER-tracked` rows. `DEFER-tracked` means *deliberately
not done yet, and someone is holding the string* — a row in that state with no ticket behind it is
`ABSENT` wearing a better word, which the contract says no row may be. This resolves all four.
**Three shipped, one dropped.** No `DEFER-tracked` row remains in the table.

| row | verdict now | eager Δ | gate |
| --- | --- | --- | --- |
| note media | **ADAPT, shipped** | −0.2 KB | 2 smoke assertions + 8 unit |
| reading sheet | **ADAPT, shipped** | (same change) | 4 smoke assertions + 9 unit |
| cite hovercards | **DROP-justified** | — | none, by design — argued below |
| full-text search | **DONE-differently, shipped** | 0.0 KB | 3 smoke assertions + 10 unit |

`eagerGzKB` **39.3 → 39.1 KB** across the whole ticket. It went *down*. Everything three capabilities
added — 4.3 KB gz — landed past `await import()`.

---

## The row that was wrong

ADR-0019 said the embed **drops** note media. It did not.

`renderMarkdown` is snarkdown → DOMPurify, and DOMPurify keeps `<img>`. Measured against the fixture
note at `apps/viewer/fixtures/voynich.ts:237`, the embed's card was rendering:

```
…That comparison page is held here beside them. <img src="https://collections.library.yale.edu/…
   /full/400,/0/default.jpg" alt="f1r — the opening herbal leaf, for comparison">
```

So the picture was there — a 400px-wide remote image at natural width inside a row capped at 38% of
the reader's height — and the author's description (`Archie-ff79`/V66) was present but reachable only
as an attribute. That is a different defect from "drops them", with a different fix: the media was not
missing, it was **unmanaged**. Had the row been believed, the work would have been "add media"
rather than "take control of media that is already rendering".

The general lesson, now written into the ADR beside the table: **the verdict vocabulary describes
intent, and nothing in it checks the code.** When a row claims an absence, open the file before
believing it.

---

## 1 · Note media — shipped (ADAPT)

`splitNoteMedia` now runs **before** `renderMarkdown` (`note-card.ts` `noteParts`), so the prose is
free of media references and the pictures are ours to place. That function is render-core's own
(`packages/render-core/src/note/media.ts:73`), already used by all three shell readers, and it carries
the security gate the embed must not lose: `isSafeMediaUrl` (`media.ts:48`) rejects `javascript:`,
`file:`, `data:text/html` and leaves the rejected URL in the prose to be sanitized there instead of
becoming a live `src`.

**The `alt` contract is the load-bearing detail.** `media.ts:12-22` states it: the key is ABSENT when
the author wrote no description, and never `""`, because `alt=""` is a positive claim that an image is
decorative — the opposite of "we don't know". The tests assert the *absence of the key*, not its
emptiness. On the card the tile `<button>` carries the description as its accessible name and the
inner `<img>` is `alt=""`; that split is the shell's (`NoteMedia.svelte:23-25`, `:33`) and its reason
is that labelling both double-announces, leaving a reader with several tiles unable to tell them apart.

One detail ported verbatim because it already bit once in the shell: **the failed-media set is keyed by
URL, not by index** (`NoteMedia.svelte:12-17`). One card element is reused across every note on an
object, so an index-keyed set bleeds a dead tile onto the next note's healthy tile at the same
position. There is a unit test that drives exactly that sequence.

### Prior art

Every citation below was opened at the line by me or by a sub-agent who opened it; where a claim is
second-hand it says so.

- **clover-iiif renders an annotation body's image and gives it a VISIBLE caption.**
  `Item.tsx:182-184` sets `imageUri` from the body's own id; `Image.tsx:16-19` is a `<button>` wrapping
  `<img>` plus `<span>{caption}</span>`, and `:17` additionally synthesizes
  `alt={"A visual annotation for " + caption}`. So clover carries the description **twice** — as text
  and as a templated alt — rather than in an attribute alone. This is the precedent for the sheet's
  `<figcaption>`.
  *It does not support a lightbox:* clover's click pans the main canvas (`Item.tsx:134-155` →
  `:101-117`); it never enlarges the body image.
  *And a correction worth carrying:* `Item.tsx:209-215` renders a `backgroundImage` swatch in **every**
  format branch — that is a canvas-region crop, not the body image. It is not evidence for this row.
- **annomea is the corpus's only body-media lightbox** — `viewer/popup.ts:66-72` emits the media,
  `:253-268` delegates an `IMG` click to `MediaModal.svelte:29-38`. But it names nothing:
  `popup.ts:67` emits `alt=""` and `MediaModal.svelte:37` does too.
- **Stated absences.** *mirador* flattens an annotation body to `resource.chars`
  (`containers/CanvasAnnotations.js:19`), so an image body contributes `""`; `grep img` across its four
  annotation components returns zero. *universalviewer* has no commentary-body image path at all — its
  only non-painting body is `ModelViewerCenterPanel.ts:133`, which sets a `title` attribute.
- **The most useful absence, because it is what stopped me copying:** *no corpus viewer renders a body
  image as a fixed-size thumbnail tile on the read side.* clover does not constrain size at all (zero
  `img` rules in `Item.styled.tsx`, `InformationPanel.styled.tsx`, or `styles/`); annomea caps to
  container width (`app.css:101`). So the card's 132×92 tile has **no external precedent** — it is
  Archie's own shell idiom (`NoteMedia.svelte`), and the sheet's container cap is annomea's shape.

---

## 2 · Reading sheet — shipped (ADAPT)

`⤢` on the card opens a modal carrying the same note through **the same renderer**. That is
`Archie-dbbc`'s shape and its two defects are the reason it matters: **V60**, a sheet that rendered
prose only, so media vanished at the moment the reader asked to see more; **V64**, a sheet that named
itself "Note" while the card it expanded from said "Note — Herbal, f1r". One renderer makes both
unrepresentable rather than merely fixed. The shell reached the same place —
`ReadingSheet.svelte:53` is now nothing but `<NotePopup size="sheet" …>`.

**The card is hidden, not unmounted** (`display:none` via `hidden`), and both halves are separate
claims:

- *Still mounted*, because focus must return to the `⤢` that opened the sheet, and `dialog-a11y.ts:50`
  captures `document.activeElement` at mount and restores it only `if (document.contains(trigger))`.
  Unmounting fails in **both** effect orderings — unmount-first snapshots `BODY`, action-first
  snapshots correctly and then fails the `contains` check — so "we'll sequence the effects" is not an
  escape hatch (`dialog-a11y.ts:29-31`, `Reader.svelte:456-460`).
- *Hidden*, because a second legible copy of the note behind the scrim was V60's other half.

### Three deliberate divergences from the shell

**No lightbox; a tile opens the sheet.** The shell needs a third surface and therefore needs "a modal
REPLACES the sheet, never stacks on it" enforced at three separate call sites
(`Reader.svelte:557-571`) — a guard that went ungated in `NarrativeReader.svelte` until
`voynichMediaNotes` existed to reach it. Collapsing enlarge into the sheet means the embed has exactly
one overlay and **cannot reach a two-modal state**. Smoke asserts `modalCount === 1`.

**`position: absolute`, never `fixed`.** An embed must stay inside its own box. The shell's
`ProseCites` portals its card to `<body>` to escape a transformed ancestor
(`ProseCites.svelte:76-82`); from inside a shadow root that means leaving the embed's token scope, and
inside a host iframe a fixed overlay is clipped anyway. `:host` is already `position: relative`
(`element.ts:76`), so the layer sizes to the element exactly.

**The description renders as a visible `<figcaption>`.** The shell keeps it in `aria-label`/`alt`. The
embed has no lightbox, so the sheet is the only place it can be *seen* rather than announced — and
clover `Image.tsx:18` is the precedent.

### The defect this shipped and the gate caught

`.archie-note-sheet-layer` set `display: grid` from a class selector, which **outranks the UA's
`[hidden] { display: none }`**. The layer was therefore laid out at all times: a transparent,
full-element div at `z-index: 60`, eating every click on the canvas beneath it. Unit tests were green
— happy-dom has no layout and cannot hit-test. Smoke went red on **five unrelated pre-existing rows**
(the region hit target, the real-click row, three halo rows), which is what pointed at it.

It is precisely the shape `[[osd-overlay-wrapper]]` describes: an invisible box that is nonetheless the
topmost hit target. Fixed with an explicit `[hidden]` pair, commented so the next `display`-toggling
rule brings one.

---

## 3 · Cite hovercards — DROPPED, with the argument

**The payload does not survive the port, and the mechanism cannot.**

*What the shell's hovercard actually shows.* `CiteCard.svelte:19-40`, opened: for a note cite it
renders the link's own `label` (text the reader has just read), a kind badge reading "Note", the
**exhibit's** title, and the **exhibit's** cover image. It does not resolve the note. For a region
cite, `img = crop` — and the component's own header at `:7-9` says `crop` is forward-compat wiring,
"currently always undefined", because no `publish/` step emits it. A region cite is a badge over an
empty box.

So the thing being ported is a floating card that repeats a word the reader just read and adds the
name of the exhibit they are already in. `Archie-1820` itself flags the risk — *"a hovercard that
cannot resolve its target is worse than a plain link"* — and on the evidence the shell's is already
close to that line.

*Why the mechanism cannot come across.* The card is `position: fixed` and **must** portal to
`<body>` (`ProseCites.svelte:76-82`) because a transformed ancestor becomes its containing block. For
the embed both exits are shut: leaving the shadow root abandons the token layer the embed carries
precisely because a host page's styles cannot reach in, and a fixed overlay inside a host iframe is
clipped by the iframe regardless.

*And hover is pointer-only.* The shell mitigates with `focusin`/`focusout` (`ProseCites.svelte:55-67`).
An embed on someone else's page is the most touch-heavy surface Archie ships, and on touch this
capability does not exist.

**A finding that seals it, and is worth more than the argument.** I grepped every published exhibit
for a cite in any of the three grammars — `#/` hash routes, `…/index.html#note-…` static-archival
form, and `archie:` refs:

```
cites across ALL published exhibits: NONE ANYWHERE
```

There is no fixture anywhere that carries a cite. So a hovercard could not have been red-greened
today; it would have been a correct guard on a path nothing could touch — the exact category
`voynichMediaNotes` was created to close for the shell. Building it would have meant either shipping
it ungated or adding a fixture, and `apps/viewer/fixtures/**` is another slice's territory.

**A separate defect found while establishing this, NOT fixed — it needs a ticket.** The embed's
narrative prose renders authored markdown through `renderMarkdown` (`narrative.ts:111`), so an in-library
cite becomes a live `<a href="#/slug/a/id">`. The embed listens to no `hashchange` and has no click
handler on prose. Clicking such a link therefore **changes the host page's URL and does nothing** — or,
in an iframe, navigates the frame away. That is worse than a missing hovercard and it is a different
row. It is unreachable today for the same reason as above (no fixture has a cite), which is why I have
not fixed it blind: the fix (intercept in-library cite clicks and route them through
`target-resolve.ts`, which the embed already owns) is easy, and gating it needs a fixture I may not
edit. **Recommend a ticket; do not close this out as part of Archie-1820.**

---

## 4 · Full-text search — shipped (DONE-differently)

The ADR row predicted this would resolve `DROP-justified` because *"the index and minisearch are real
weight"*. **The weight objection dissolves rather than being paid**, and that is the whole finding.

minisearch exists in the shell because its finder is a library-scale browse surface
(`search-index.ts:48-56` — `fields: ["body","tags"]`, `prefix: true`, `fuzzy: 0.2`). The embed already
holds the exhibit's entire note tree in memory the moment the exhibit opens (`annotationsByObject`), so
an exact substring scan over it needs **no index and no dependency**. Measured: `eagerGzKB` did not
move at all, and the whole capability is +0.7 KB gz behind the lazy boundary.

Prefix and fuzzy are deliberately not ported. An exact substring match is a promise the embed can keep
precisely ("these notes contain what you typed"); fuzzy scoring without a relevance-ranked UI is not.

**Shape: a filter over the pane's existing note list, not a modal over the canvas.** The shell needs an
overlay because its finder has nowhere else to live; the embed's reading pane *is* a note index
(V70/`Archie-c982`). Filtering it in place costs no scrim, no second focus trap, and — the part
ADR-0019's own layout row cares about — never covers the image.

That shape has direct precedent, which I only found late and verified myself:
**tropy `src/selectors/items.js:11-13`** — `getVisibleItems` is memoized over `qr.items`, the query
result, so searching *narrows the existing item grid* rather than opening a result surface beside it.
The grid IS the results. `qr` is a first-class reducer (`src/reducers/qr.js:5`), not a view-local
filter, so this is the app's model of search rather than a UI shortcut. Nothing about a locus follows
from it — tropy has no result ROW to carry one — so it supports the placement decision and nothing
else.

**It does not port `Archie-9eeb`.** That ticket is open against the shell's finder because a result
renders only `r.body` and its tags (`SearchOverlay.svelte:100-103`) and never says *where* the hit
lives; on a many-object exhibit every result reads as if it came from the same place. Here:

- every hit renders its object's label (`.rc-where`), asserted for **all** rows, not merely for one;
- activating a hit lands on the **note**, not the object's top, by reusing `resolveExhibitTarget`'s
  existing `selectId` landing. `Archie-9eeb` warns "do not add a second address writer" — the embed's
  one resolver is `target-resolve.ts` and this adds nothing beside it.

Scope mirrors the shell's `flattenExhibitNotes` (`search-index.ts:62-77`): base notes plus every
reading's, de-duped. A finder scoped to the active layer would quietly lie about what the exhibit
contains.

### Prior art, including a correction that changed the claim

- **clover-iiif `ContentSearch.tsx:50-58`, `:83-88`** — hits are grouped by `target.source.id` and the
  canvas label is a group **header**, not a repeated per-row field. Good idiom; worth taking if these
  lists ever get long enough to repeat a name many times.
- **clover-iiif `Item.tsx:41-52`** — a result's thumbnail is cropped at the hit's **own** xywh rather
  than showing a generic canvas cover. The concept is a real donor.
- **A correction, and the reason this section is shorter than it started.** `Archie-9eeb`'s own
  prior-art sweep claims clover's `useEffect` at `Item.tsx:119-132` polls until the annotation's
  overlay exists and then zooms, "so the cross-canvas path still ends at the exact region". It does
  not: the effect is gated `if (!openSeadragonViewer || !isContentState) return;` and
  `ContentSearch.tsx` passes **`isContentSearch`**, never `isContentState`. For a real search hit the
  poll-then-zoom is dead code. *(Established by the finder slice opening all four lines; I had relayed
  the wrong version onward myself, having taken it from the ticket without opening the files.)*
  So the honest statement is a **stated absence**: *no swept system demonstrates working
  cross-canvas activation-to-region.* clover has the pieces and does not wire them. The embed gets it
  only because `resolveExhibitTarget` already existed, and it claims no precedent.
  **Closed:** the ticket carried the wrong version and would have re-propagated it; routed to the lead
  (`.seeds/` is not mine to edit) and fixed on `origin/main` in `09e8921`, which now states the
  `isContentState`/`isContentSearch` gap and warns off clover as a cross-canvas donor. *Verified by
  reading that commit's diff — this paragraph originally said the ticket was still wrong, which was
  true when written and false by the time it was committed. A prose claim about an artifact has to be
  re-checked against the artifact, not against when you learned it.*

### The pre-existing defect this uncovered

The travel assertion failed on its first run with a very specific signature: the reader title changed
to the target object, and **the note card stayed shut**.

`#applyFragment` calls `surface.setSelected(selectId)` + `fitBounds(selectId)`, which paint the halo
and move the camera. But `setSelected` is a *programmatic* state set and deliberately does not re-enter
the overlay's `onSelect` — that would be a feedback loop — so nothing ever showed the body.

This was never a finder bug. **Every `selectId` landing had it**, which means
`<archie-viewer target="#/<slug>/a/<id>">` — the entire cite-ladder note rung, the embed's primary
deep-link — arrived on the right region of the right object with an empty note pane. One fix covers
both, because both arrive through `#openObject`.

---

## Measurements

### `eagerGzKB`, per capability

Reconciled against `git show origin/main:packages/archie-viewer/bundle-size.json`, which reads
**38.9**. That is the committed *reference*; a fresh build of unmodified `origin/main` measures
**39.3**. Both numbers are real and they mean different things — the baseline is deliberately stale
until someone runs `pnpm bundle:baseline`, so it drifts behind. The brief quoted 39.3 as "the
baseline"; it is the measurement.

| step | eager gz | Δ | total gz |
| --- | --- | --- | --- |
| `origin/main`, measured | 39.3 | — | 275.4 |
| after note media + reading sheet | **39.1** | **−0.2** | 278.6 (+3.2) |
| after full-text search | **39.1** | **0.0** | 279.7 (+0.7) |

The decrease is not an accident. `note-card.ts` was a **static** import of `element.ts` although every
call site (`#openObject`, `#mountAside`, `av-player.ts`) was already past the reader boundary. Making
it a type-only import plus `await import()` took its whole graph off the page-load path, which more
than paid for everything the two capabilities added. This is `[[archie-viewer-eager-closure]]`'s own
advice — *keep code that only runs past the boundary in a module past the boundary*.

The baseline was **not** refreshed. Every build reports `baseline unchanged`.

### The boundary, verified against the artifact rather than the gate

`eagerGzKB` says the closure did not grow, but that is the gate marking its own homework. Walking the
built `dist/`'s own static `import` edges from the entry:

```
EAGER (static closure from entry):
   archie-viewer.js       31,295 B
   chunk-M2OYOL5S.js         412 B
   chunk-WWCTCNKS.js      74,642 B
LAZY:
   chunk-XGCUT3FC.js      10,727 B   <- all note-card/sheet/media code
   note-card-JCA55PFL.js     109 B
   reader-HM2VJ7VZ.js    822,106 B
   reader-chrome-PSQ7SB3K.js 223 B   <- searchExhibit
   …
```

### Artifact measurements

`grep -c` against the built bundle (not the source, not the test):

| string | `dist/chunk-XGCUT3FC.js` | `dist-single/…single.js` |
| --- | --- | --- |
| `archie-note-sheet` | 19 | 19 |
| `archie-note-media` | 10 | — |
| `Expand note to a reading sheet` | 2 | 2 |
| `Close reading sheet` | 1 | — |
| `figcaption` | 2 | — |
| `aria-modal` | 1 | — |

`node scripts/sync-dist.mjs --check` → *root `dist/` matches `packages/archie-viewer/dist/`*.

### Gates, with denominators

| gate | before | after |
| --- | --- | --- |
| `pnpm --filter @render/archie-viewer run test` | 201/201 (12 files) | **211/211** (12 files) |
| `recipes/smoke.mjs` hard assertions | 45/45 | **54/54** |
| `CONTRACTED_LABELS` | 44 | **53** |
| completeness check | 44/44 present | **53/53 present** |
| `tsc --noEmit` (TS 7 native) | clean | clean |
| `sync-dist:check` | match | match |
| `build.mjs --check` | ok | ok, baseline unchanged |

**Stability: 20 consecutive full smoke runs, 20 green / 0 red, 54/54 every time.** The
"unattributed flake" recorded in `smoke.mjs`'s header did not recur in this session; that is one
session's evidence and does not retire the note.

Run tests with `pnpm --filter`, not the root `vitest` binary — the latter misses the virtual-token
plugin and reports `tokens.test.ts` as a load failure (12 files vs 11).

### Red-green — every new assertion, proven

Ten injections. Source copied to `/tmp` first and every restore made from there; `git checkout --` and
`git restore` were never used, per `[[drive-must-not-recreate-the-thing-under-test]]`.

| injection | assertions that went red | caught |
| --- | --- | --- |
| media lift reverted (`renderMarkdown` alone) | tile · description · sheet-media | ✓ |
| description dropped from the tile label | description | ✓ |
| `⤢` does nothing | expand · sheet-media · hidden-not-unmounted | ✓ |
| sheet renders prose only (V60 restored) | sheet-media | ✓ |
| card unmounted instead of hidden | hidden-not-unmounted · Escape-restores-focus | ✓ |
| focus restore removed | Escape-restores-focus | ✓ |
| search scoped to the open object | across-the-exhibit (+2) | ✓ |
| locus line dropped (the `Archie-9eeb` shape) | locus (+2) | ✓ |
| hit travels to object but not to note | travel | ✓ |
| arrival does not open the note | travel | ✓ |

All nine new labels went red under at least one injection. Two notes on reading this table honestly:

- **One prediction of mine was wrong, and it was my expectation, not a gate hole.** I expected
  `⤢ does nothing` to also redden the Escape assertion. It did not, correctly: with the sheet never
  opening, "sheet closed / card up / focus on the expander" are all true. That assertion answers its
  own question and the `expand` assertion is what catches a dead expander.
- **One injection crashed the harness instead of failing cleanly.** Dropping the locus made the drive
  dereference a null and abort — 34 later assertions never ran and the suite reported `19/20`. It
  still exited 1, so it *looked* caught, but a crash and an assertion failure are not the same thing
  and the difference is invisible unless you read the totals. The drive is hardened and the injection
  re-run: it now reports **52/54 with all 53 contracted labels still present**.

---

## What a reviewer should look at hardest

- **The dropped row is the one to disagree with.** If you think a cite hovercard is worth having in an
  embed, the argument to attack is the payload analysis (`CiteCard.svelte:19-40`), not the mechanism —
  the mechanism is genuinely blocked, but a *different* hovercard that resolved the note's own body
  would be worth building, and the embed holds the data to do it. I did not build it because that is
  a new capability rather than a port, and nothing could gate it today.
- **The unfixed cite-link defect** in §3. It is real, it is in this package, and I left it.
- **`searchExhibit` is O(notes) per keystroke.** Exact and allocation-light, and the exhibit is already
  in memory, but there is no debounce. At the fixture's scale (12 objects, ~40 notes) it is
  imperceptible; a 500-object exhibit would want one. Not speculated on further — see
  `[[perf-measure-the-flow]]` on primitive benchmarks that are not evidence about a user flow.
- **Nothing outside `packages/archie-viewer/**`, `recipes/smoke.mjs` and the ADR rows was edited.**
  The `SearchOverlay`/`Archie-9eeb` finding and the `Archie-9eeb` ticket correction were both routed
  to the lead rather than acted on.
