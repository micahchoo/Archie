# UX audit — Viewer vertical 5: The narrative (V80–V95)

Ticket `Archie-d143`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-24, real
Chromium at 1280×800 against the running stack (`http://localhost:5173/viewer/`).

**What this vertical asks:** does the narrative reading mode deliver an argument, or just a
differently-shaped grid?

**The short answer.** The argument is authored, loaded and correct — every section's prose, camera
region and object switch resolve. What fails is *delivery*: the spine is a 420 px column that shows
one beat at a time, its stated pacing (scroll) is not implemented, a section cite lands the camera
but not the prose, collapsing it is sticky and global, and the embed drops the prose entirely.
Six of the nine defects below are about the reader never seeing writing that the system already has
in memory.

Screenshots are `/tmp/narr-*.png`; each finding carries its repro so it can be re-shot. The only
narrative in the seeded corpus is `voynich-reading` (6 sections, 12 objects) — verified: no other
published exhibit has a `annotations/narrative.json`.

---

## The spine as a reading surface

### V80 — The canvas chrome is rendered on top of the spine, not on the canvas *(Severity: high — Look)*

**Surface:** `NarrativeReader.svelte:275-284` `.canvas-chrome-right` (the **▦ All objects** escape and
the **Zoom** readout).

**Weakness.** Measured at 1280×800: `main` (the canvas) occupies x 0–860. `.canvas-chrome-right`
renders at **x 1042–1260, y 52–83** — 182 px *inside* the 420 px spine, over the eyebrow. The eyebrow
`NARRATIVE · 6 SECTIONS · SECTION n OF 6` (top y ≈ 78) is pushed to wrap onto a second line and reads
underneath the "All objects" pill in every screenshot of this vertical.

The cause is one line: `.narrative { position: relative }` (`:373`) is the positioning container, and
`.narrative` is the **flex row containing both the canvas and the aside** — so `right: var(--space-5)`
resolves against the whole page, not the canvas. The comment directly above the rule (`:440-446`)
states the intended contract — *"anchor together, top-right of the canvas (the legend owns
top-left)"* — and is measurably not what ships. The legend, which really is anchored inside `main`,
proves the intended placement is achievable.

Two chrome elements land on the exhibit's most valuable typography: the title block a first-time
visitor reads first. `GOAL.md:20-24` ranks **Look** above everything.

**Repro:** `/viewer/#/voynich-reading` *(`/tmp/narr-02-narrative.png`, `/tmp/narr-11-s6.png`)*.

*(Principle: Look; visual hierarchy — chrome must not sit on content.)*

### V81 — "Read down the page … the image follows along" is not implemented *(Severity: high — Feel)*

**Surface:** the spine hint, `NarrativeReader.svelte:297-299`.

**Weakness.** The copy the reader is given as their instruction reads: *"Read down the page, or jump
to any section. The image follows along, zooming to what each section is about, and switching between
items as you go."* Measured — scroll the aside to its bottom (`scrollTop` 0 → 1417 of a 2217 px
scroll height, i.e. all the way):

| | before scroll | after scroll to bottom |
| --- | --- | --- |
| active section index | 0 | **0** |
| position indicator | Section 1 of 6 | **Section 1 of 6** |
| canvas | section 1's region | **section 1's region** |

Nothing follows anything. The active section changes on **click only** — there is no
`IntersectionObserver` and no `scrollIntoView` anywhere in `NarrativeReader.svelte`. A reader who
takes the first clause literally reads section 6's prose while looking at section 1's folio and
being told they are on section 1.

This is not "build scrollytelling". ADR-0016's rejected alternative (c) explicitly reserves
click-driven vs scroll-driven as **pacing**, a decision deliberately not taken. The defect is that
the copy takes it, and takes the side that isn't built. The corpus holds both halves of the
alternative: `juncture` couples a scrolled paragraph to a sticky viewer (its whole `ve-image` model),
and `scrollama` — sitting in the prior-art corpus for exactly this — is the IntersectionObserver +
`position: sticky` primitive that does it. Either implement the promise or withdraw the clause; the
cheap fix is the second.

**Repro:** `/viewer/#/voynich-reading`, set `aside.scrollTop = aside.scrollHeight`, re-read
`.spine-pos` *(`/tmp/narr-90-scrolled.png`)*.

*(Principle: match between system and the real world — don't describe behaviour you don't have. Route the copy fix through `product-copy`.)*

### V82 — A section cite lands the camera but strands the prose off-screen *(Severity: high — Feel)*

**Surface:** section-rung arrival, `ExhibitView.svelte:120-130` → `NarrativeReader` `arrivalSection`.

**Weakness.** `#/voynich-reading/s/s6` resolves perfectly *underneath*: `activeIndex` 5, eyebrow
"Section 6 of 6", canvas on f116v fitted to that section's `start` region. But the spine is never
scrolled. Measured on arrival:

| | value |
| --- | --- |
| active section index | 5 |
| active card's viewport `y` | **1966 px** (viewport height 800) |
| `aside.scrollTop` | **0** |
| prose actually on screen | **section 1's** |

So the reader who followed a colleague's link to the closing beat sees the *opening* beat's prose,
unhighlighted, beside a picture that belongs to neither. Card heights measured 404 / 227 / 243 / 416
/ 215 / 215 px — only **3 of 6** cards fit the column at once, so this is not a near-miss; the target
is a page and a half below the fold with nothing indicating a scroll is owed.

ADR-0021's contract is that a deep link lands **at** the target. It holds for the canvas and the
chrome, and fails for the one surface that carries the argument. A single `scrollIntoView` on the
active card closes it.

**Repro:** `/viewer/#/voynich-reading/s/s6` *(`/tmp/narr-11-s6.png`)*. Compare
`/viewer/#/voynich-reading/s/s1`, which is correct only because index 0 is already at the top.

*(Principle: visibility of system status; ADR-0021's landing contract.)*

### V83 — Hiding the spine is sticky, global, and near-irreversible *(Severity: high — Feel)*

**Surface:** `ResizeDivider` collapse (`ASIDE_COLLAPSED_KEY = "archie.narrativeAsideCollapsed.v1"`,
`NarrativeReader.svelte:26-28`, persisted by `saveAside`).

**Weakness.** Collapse the spine, then press `Escape` to close the note card — the state measured is:
`aside.collapsed = true`, `inert = true`, no note popup, no eyebrow, no position indicator. What
remains on screen is a full-bleed folio, the Readings legend, "All objects", "Zoom 1.2×" and "Find a
note". **Nothing on the page contains the words *narrative*, *section* or one word of the authored
prose.** The only route back is a ~2 px hairline chevron at the extreme right edge (x ≈ 1274) — no
label, no text, no affordance a first-time visitor would read as "your reading is behind this".

The state is written to `localStorage` and is **not scoped to the exhibit**. Verified: after
collapsing once, a fresh load of `#/voynich-reading` reads `collapsed: true`; so does a fresh load
after visiting a different exhibit and returning. One accidental click and every narrative in every
library opens, forever, as a picture with no writing — the exact opposite of ADR-0016's keystone
("≥1 sections → the narrative **leads**").

The `inert` treatment of the collapsed aside is correct and deliberate (`:289-292`) — this finding is
about the discoverability of the way back and the persistence scope, not about `inert`.

**Repro:** `#/voynich-reading` → aria-label `Hide narrative` → `Escape` *(`/tmp/narr-33-after-esc.png`)*;
then reload *(`/tmp/narr-42-collapse-persist-reload.png`)*.

*(Principle: user control and freedom; §223 anti-trap — an exit that is technically present but visually absent isn't one.)*

### V84 — Stepping out to the index and back loses your place, and the index has no address *(Severity: high — Feel)*

**Surface:** the `▦ All objects` escape (`:276-280`) and the index's `‹ Back to the reading`.

**Weakness.** Two measurements, one cause.

1. **Place is lost.** Activate section 4 (`activeIdx: 3`) → **All objects** → **Back to the
   reading** → measured `activeIdx: 0`, eyebrow "Section 1 of 6". The reader is returned to the
   beginning of a six-beat argument they were two-thirds through. The narrative remounts and
   `arrivalSection` recomputes from a null `initialSection`/`initialSelected`.
2. **The index has no address.** The hash before, during and after the excursion is
   `#/voynich-reading`, unchanged. So the index cannot be linked to, browser Back does not return
   from it, and a reload from it silently re-enters the narrative.

Both follow from the same fact: the narrative's position lives only in component state. The grammar
to fix it already exists and is already parsed — `#/<slug>/s/<id>` (`route.ts:50-53`) — the narrative
simply never writes to it. Cross-reference `Archie-33bf` (Studio map), which owns the URL-grammar
decision; this is the reader-side evidence that the address is under-used, not a proposal.

Prior art: `quire`'s `page-buttons.js` renders prev/next as **real `<a href>` to addressable URLs**
on every page — position is in the URL, so leaving and returning is free. Archie's equivalent is
in-memory only.

**Repro:** section 4 → All objects → Back to the reading *(`/tmp/narr-14-index.png`,
`/tmp/narr-20-return-from-index.png`)*.

*(Principle: user control and freedom; consistency between address and view — the mirror image of V2.)*

### V85 — The prose column shows one beat at a time and never numbers them *(Severity: medium — Look)*

**Surface:** `ol.sections` (`:308-317`), width `clamp(360px, 32vw, 620px)`.

**Weakness.** Measured card heights at 1280×800: **404, 227, 243, 416, 215, 215 px** in a 800 px
column — 3 of 6 visible, and the two longest beats each occupy half the reading area alone. The
markup is an `<ol>` with `list-style: none` and `counter-reset: none`, and the element that carries
the section label is literally called `.num` (`:424`) yet renders **no ordinal**. So the chrome says
"Section 4 of 6" while the list the reader is scanning offers nothing to count against; the only
"you are here" signal is the active card's orange left edge, which is off-screen whenever the active
beat is (see V82).

A six-beat argument that can only ever be seen three beats at a time, unnumbered, reads as a stack of
cards rather than a sequence. `juncture`'s essays put the prose in the page's main measure and the
viewer in the margin; Archie inverts that ratio for a mode whose defining content is the prose.

*(Principle: Look; recognition over recall.)*

### V86 — The section label collides with the object label, and repeats itself *(Severity: low — copy/Look)*

**Surface:** `.num` (`:312`).

**Weakness.** Rendered: `HERBAL· F1R — HERBAL (OPENING PAGE)`. Two defects in one string —
(a) no space before the separator, because the `<span class="obj">` leading space is trimmed at
compile time, leaving `Herbal· f1r` at `letter-spacing: 0.16em`; (b) the section title ("Herbal") and
the object label ("f1r — Herbal (opening page)") both carry the division name, so the reader is told
"Herbal" twice in eleven words. Same shape at every beat: `Astronomical· f67r — Astronomical
(foldout)`, `Cosmological· f85v–86r — Cosmological (the Rosettes foldout)`.

*(Principle: Look; typographic care. Route the de-duplication through `product-copy`.)*

### V87 — The floating finder occludes the last card in the spine *(Severity: medium — Look)*

**Surface:** the persistent **⌕ Find a note ⌘K** button.

**Weakness.** Measured rect **x 1102–1260, y 748–780** — inside the spine column (x 860–1280), over
its bottom edge. On the default view it lands on section 1's embedded cite card and cuts its
`→ open object` link mid-word (visible in `/tmp/narr-02-narrative.png` and `/tmp/narr-11-s6.png` as
`→ open obj|`). The spine has no bottom padding reserving that space, so whatever the reader scrolls
to the bottom is partly under the button.

*(Principle: Look; the same class as V80 — floating chrome over content.)*

---

## The narrative in the other consumers

### V88 — The embed drops the narrative entirely: prose in, thumbnail grid out *(Severity: high — Look/consistency)*

**Surface:** `packages/archie-viewer` (embed) against the same published tree.

**Weakness.** Driven with `src="/apps/viewer/public/published/"` and `target="#/voynich-reading"`,
the embed renders **a title and a 4-up grid of 12 thumbnails**. Measured in the shadow root: no
`ol.sections`, no `[class*=prose]`, zero characters of any section's text, no exhibit description, no
credit line. `hasSections: false`. The exhibit whose entire reason to exist is six paragraphs of
argument renders as a file listing.

This is structural, not a load failure: `packages/archie-viewer/src/target-resolve.ts:134-139` is the
only place the embed touches `sections` — it looks a section up **solely to translate it into
`{ kind: "object", objectId, fragment }`**. The prose is read and discarded by design. Confirmed by
drive: `target="#/voynich-reading/s/s4"` opens the Rosettes foldout framed on s4's region, with the
words that make it a section nowhere on screen.

ADR-0019 sanctions exactly one divergence — the marker layer (Annotorious/PixiJS → DOM-SVG overlay).
Discarding the reading mode is not that. A curator who publishes a narrative and embeds it in their
CMS ships their argument as a contact sheet. This is V9's thesis measured at its most expensive
point.

**Repro:** `/tmp/narr-85-embed-narrative.png` (list), `/tmp/narr-86-embed-section-cite.png` (cite
lands on the object).

*(Principle: consistency; Look; ADR-0019's "one engine, not a fork".)*

### V89 — A bad section cite degrades identically in the shell and silently in the embed *(Severity: low — Feel)*

**Surface:** `#/<slug>/s/<unknown>` in both consumers.

**Weakness.** The shell is correct (see *Checked and cleared*). The embed resolves the same target to
`{ kind: "exhibit", degraded: "section-not-found" }` (`target-resolve.ts:135-137`) and renders the
plain exhibit list with **no notice of any kind** — measured, no banner text in the shadow root. The
degrade information is computed and then dropped at the render seam. Same fix shape as V3's slug
rung: the value exists, nothing displays it.

**Repro:** `target="#/voynich-reading/s/no-such"` *(`/tmp/narr-87-embed-bad-section.png`)*.

*(Principle: visibility of system status; consistency across consumers.)*

### V90 — Two unnamed tab stops sit on the canvas *(Severity: low — a11y; shared code, not narrative-specific)*

**Surface:** the OSD/Annotorious canvas as mounted by `@render/svelte/Canvas.svelte`.

**Observation.** Measured `[tabindex="0"]` on the narrative screen, dev toolbar filtered:

| element | role | accessible name |
| --- | --- | --- |
| `div.openseadragon-canvas` | — | **none** |
| `svg` (coverage frame) | `button` | "View whole object" ✅ |
| `svg.a9s-annotationlayer.a9s-osd-drawinglayer` | — | **none** |
| `div.resize-divider` | `separator` | "Resize narrative" ✅ |

Two of four focusable elements announce nothing. Archie's own two are labelled correctly; the two
unnamed ones are OpenSeadragon's container and Annotorious's drawing layer, i.e. **library-owned and
shared with the Reader** — filed here at low severity, and flagged as *not* a narrative-parity issue
for the same reason the marker-colour gap in the standing corrections isn't one. Whoever fixes it
fixes both readers at once.

*(Principle: a11y — every focusable thing has a name.)*

### V91 — One place, three names *(Severity: low — copy)*

**Surface:** the narrative ⇄ index seam.

**Weakness.** The spine calls itself **Narrative**; the control that leaves it says **▦ All objects**;
the control that returns says **‹ Back to the reading**; the screen you arrive at calls itself
**EXHIBIT · 12 ITEMS**. Four labels for two places, none of which uses the other's word. A first-time
visitor has no way to know "All objects" and "Back to the reading" are the two directions of one door.

*(Principle: consistency and standards. Route through `product-copy`.)*

---

## Checked and cleared — do not re-report

- **The section-rung degrade notice.** An early probe of mine (class-name based) reported silence for
  `#/voynich-reading/s/no-such-section` and I nearly wrote it up as a fourth silent rung beside V3.
  Re-measured with a text probe: the shell **does** announce it — *"⚐ That section isn't in this
  exhibit — showing the exhibit instead · Dismiss"*, identical in shape to the object rung, for both
  an unknown id and an out-of-range one (`/s/s99`). `ExhibitView.svelte:122-129` sets `sectionMissing`
  and raises the chrome for 8 s. The section rung is the *best-behaved* rung of the ladder, not the
  worst. It does keep the dead address in the bar, which is V4's already-recorded behaviour, not a new
  finding.
- **The in-app search jump into a narrative.** Also nearly written up. Driven: ⌘K → "starred
  paragraphs" → click the result → measured `activeIdx: 5`, eyebrow "Section 6 of 6", note popup open
  on the right note. The re-selection seam (`:118-128`) and `ownerObjectOf` work exactly as
  documented, including landing the spine on the owning section. What it does *not* do is write the
  address — that belongs to vertical 6, not here.
- **The note deep link `#/voynich-reading/a/<id>` landing on section 1.** It does, but not for the
  reason it looked like: the note never resolves at all. Both candidate id forms — the bare ULID and
  the percent-encoded full annotation IRI — produce *"That note isn't here anymore"*. This is a
  cite-ladder defect, not a narrative-landing defect; handed to vertical 6, where it is
  [V100](UX-AUDIT-viewer-leaving.md).
- **The collapsed-spine section stepper.** Works well and is worth keeping as the model: the note
  card grows `‹ Prev · 2 / 6 · Next ›` with per-direction labels ("Next section: Balneological"),
  carries the reading across the step so the card stays open, and steps the object when the spine
  crosses one. Measured across two steps. The only complaint is that this — the sole真 sequential
  sequential control in the narrative — exists **only** in the collapsed state.
- **The broken-reference guard.** `activeObject` deliberately returns `undefined` rather than falling
  back to `objects[0]`, and the render gate shows "This section points to an item that's no longer in
  the exhibit" (`:235-238`). Correct by construction; not reachable from the seed.
- **The index-escape contract (ADR-0016 §137/§223).** `narrative-escape.test.ts` guards the AV branch
  structurally, and the drive confirms the image branch: `▦ All objects` → grid → `‹ Back to the
  reading` exists and works. The escape is present; V84 is about *state and address*, not about the
  door existing.
- **Astro dev toolbar links.** Filtered from every query in every drive (`e.closest('astro-dev-toolbar')`).
- **The CORS/tile errors in the console.** `collections.library.yale.edu` intermittently refuses
  `info.json` (measured once on f1r, then loaded on retry). Environmental, not an app defect — but it
  is what produced `/tmp/narr-02-narrative.png`'s "COULDN'T LOAD THIS MEDIA ITEM." panel. Vertical 3
  owns the canvas failure state; noted here only so the screenshot isn't misread.

## Not reached, and why

| Not reached | Why |
| --- | --- |
| the narrative in **portable** mode | `archie-library.archie.zip` contains two exhibits (`assets`, `screenshots`) and **no narrative** — measured, gallery reads "Gallery · 2 exhibits". Nothing in the available corpus can exercise `NarrativeReader` from a dropped zip. Needs a fixture, not a drive. |
| the **AV section** branch (`isAV`, `MediaPlayer` in a spine) | none of `voynich-reading`'s 6 sections points at the exhibit's sound object; `sections[].objectId` covers o1, o5, o8, o9, o10, o11 only. `narrative-escape.test.ts` guards the *index*-AV branch structurally; the *spine*-AV branch has neither a test nor a fixture. |
| `packages/render-mount` beyond the canvas it mounts | its surface in this vertical is the canvas the spine drives; what the drive surfaced there is V90, and the marker layer belongs to vertical 3. |

## Provenance caveat on the embed findings (V88, V89)

The embed was driven against `dist/archie-viewer.js` dated **Jul 24 19:52** (and
`packages/archie-viewer/dist/archie-viewer.js` at **19:55**) — the same bundles the arrival ledger
flagged, still being rewritten by a concurrent session editing `packages/archie-viewer/src/` during
this audit. V88 rests on `target-resolve.ts:134-139`, which was read from the working tree at the
same time, so source and bundle agree as of the drive. **Re-verify against the current build before
opening a fix ticket.** The shell findings (V80–V87, V90, V91) are unaffected — `apps/viewer` was not
touched.

Driver page and scripts used: `.audit-embed-driver.html`, `.audit-narr-leaving-*.mjs` (repo root,
deleted after the drive); the embed was served from a plain `python3 -m http.server` on port 8909, so
no Vite instance was started and the shared `apps/viewer/node_modules/.vite/deps` cache was never
touched.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted | yes | V80–V87, V89 (shell half), V90, V91 |
| `apps/viewer` portable | attempted — no narrative in the test library | none; see *Not reached* |
| `packages/archie-viewer` embed | yes, local `dist/` (Jul 24 19:52) | V88, V89 |
| `packages/render-mount` | yes, as the canvas the spine drives | V90 |
