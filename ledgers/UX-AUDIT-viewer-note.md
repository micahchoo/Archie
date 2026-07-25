# UX audit — Viewer vertical 4: The note (V60–V71)

Ticket `Archie-0f44`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-24, real
Chromium at 1280×800 (embed at 1280×900).

**What this vertical asks:** the note is the thing an Archie exhibit exists to deliver. How does it
arrive, how is it dismissed, and does it read well?

The surface is `NotePopup.svelte` — **one** component shared by `Reader.svelte` (grid / single) and
`NarrativeReader.svelte` (narrative) — plus `NoteMedia.svelte`, `NoteLightbox.svelte` and
`ReadingSheet.svelte`, the two surfaces a note escalates into. Screenshots are `/tmp/nt-*.png`.

---

## How the note arrives

### V60 — Selecting a note shows it twice; expanding it shows it three times *(Severity: medium — Look)*

**Surface:** `Reader.svelte`'s sidebar note list + the floating `NotePopup` + `ReadingSheet`.

**Weakness.** Selecting a note does not *move* it anywhere — it *duplicates* it. Measured on
`#/voynich` object 1: the sidebar's note card stays in place, highlighted, showing the note's first
~90 characters truncated with an ellipsis, while the same note's full text appears simultaneously in
the floating card bottom-left. Two renderings of one sentence, in two type treatments, 900px apart.

Press `⤢` and it becomes three: the reading sheet opens centred, and **both** the popup and the
sidebar card remain on screen behind the scrim, dimmed but legible — measured
(`.note-pop` still in the DOM with the sheet open) and plainly visible in
`/tmp/nt-10-reading-sheet.png`, where the same sentence is readable in three places at once.

The reader is never told which one is authoritative or why there are more of them after asking for
one. Prior art: `annomea`'s read-side is explicit that the popup *is* the note surface
(`embed/EmbeddedReader.svelte`, ADR-0007 "hybrid popup and drawer" — popup **or** drawer, one at a
time), not a second copy beside a list.

**Repro:** `/viewer/#/voynich` → open object 1 → click the first sidebar note → click `⤢`.
*(`/tmp/nt-41-popup-over-strip.png`, `/tmp/nt-10-reading-sheet.png`)*

*(Principle: Look; recognition over redundancy.)*

### V61 — A note opened from the image is announced to nobody *(Severity: medium — Feel / a11y)*

**Surface:** `NotePopup.svelte:43` — the card's root is a bare `<div class="note-pop">`.

**Weakness.** The sidebar tells the reader, in so many words, *"Select a note, or a marker on the
image."* Measured on the marker path: clicking the canvas opens the popup and
`document.activeElement` stays `.openseadragon-canvas`. The card that appeared has **no `role`, no
`aria-modal`, no `aria-label`, and no live region**, and its own controls sit far down the tab order
(measured: after the four reading toggles, HIDE ALL, the resize divider and the sidebar note cards).
So for a screen-reader user, activating a marker produces no announcement, no focus change, and
nothing within reach — the note simply exists, silently, somewhere later in the document.

Both standard remedies are absent, not merely one: a non-modal popup opened by activation should
either move focus into itself or announce itself through a live region. The repo already owns the
first (`lib/dialog-a11y.ts`) and the second pattern shipped in Studio under `Archie-f260` ("one
mounted polite live region speaks the doc's grammar").

The sidebar path is fine, and measured so — a real click on a note card leaves focus on the card and
the popup's `⤢` / `×` are the very next two tab stops.

*(Principle: visibility of system status. The canvas's unnamed tab stops are already reported as
`V90` in the narrative ledger — shared code, do not re-report here.)*

---

## Dismissal

### V62 — Escape returns focus to the trigger; the card's own × drops it *(Severity: low — Feel)*

**Surface:** `Reader.svelte:293-294` (Escape) vs `NotePopup.svelte:48` (the `×` button).

**Weakness.** Measured, same note, two dismissals:

| Dismissal | Popup closes | Focus lands on |
| --- | --- | --- |
| `Escape` | yes | **the sidebar note card that opened it** — correct |
| clicking `×` | yes | `document.body` |

The `×` is a real tab stop two presses from the trigger, so a keyboard reader will reach and use it —
and be dropped at the top of the document, losing their place in a 12-object exhibit. The keyboard
path already does the right thing; the button path just never learned it.

*(Principle: user control and freedom; close-the-loop focus management.)*

### V63 — The reading sheet says `aria-modal="true"` and implements none of it *(Severity: high — Feel / a11y)*

**Surface:** `ReadingSheet.svelte:19-21`.

**Weakness.** The sheet declares `role="dialog" aria-modal="true"` and renders a scrim — and it does
**not** use `use:dialog`, the repo's shared modal action, even though that action's own header
comment names its users: *"shared by the NoteLightbox and the SearchOverlay."* The note's primary
expand surface is the third modal and was left out. Measured consequences, all three of the things
the action exists to provide:

| Promise of `aria-modal="true"` | Measured |
| --- | --- |
| focus moves into the dialog on open | **no** — focus stays on the popup's `⤢` button, behind the scrim |
| Tab is trapped inside | **no** — `⤢` → `×` (popup) → `sheet-close` → the finder pill → `BODY`; two presses and the keyboard is loose in the page behind the scrim |
| focus returns to the trigger on close | **no** — Esc closes the sheet and focus lands on `BODY` |

`aria-modal="true"` is not decorative: it tells assistive technology to treat everything outside the
dialog as hidden. Declaring it while the keyboard is still walking the page behind it is worse than
declaring nothing — the AT's model and the keyboard's reality disagree.

This resolves TEND-EXPLORE **I-V3** ("the shared modal focus-trap has no test on either guard axis")
in the sharpest possible way: **the shared trap works** — measured green on the lightbox, below —
and the finding is that the note's own expand surface isn't wired to it. The fix is an import, not a
design.

**Repro:** open a note → `⤢` → press Tab three times.
*(`/tmp/nt-10-reading-sheet.png`)*

*(Principle: WCAG 2.4.3 / 4.1.2; honest semantics.)*

### V64 — The expanded sheet carries less context than the card it came from *(Severity: medium — Look)*

**Surface:** `ReadingSheet.svelte`.

**Weakness.** The popup opens with an eyebrow that names its object
(`f85v–86r — Cosmological (the Rosettes foldout)`) or, in the narrative, its section and object
(`Herbal · f1r — Herbal (opening page)`). The reading sheet — the surface a reader escalates *to* in
order to read properly — is measured as: a paragraph, a `×`, and `aria-label="Note"`. No heading, no
object, no reading name, no section. The screen that is supposed to be the focused reading of a note
is the one that doesn't say what you are reading.

*(Principle: Look; orientation. Compare `quire`, whose expanded object/essay views lead with the
work's identity.)*

---

## The stepper inside the card

### V65 — The note card grows a stepper that steps something other than notes, only in a state the reader must discover *(Severity: medium — Feel / copy)*

**Surface:** `NotePopup.svelte:58-74`, wired by `Reader.svelte:413` and `NarrativeReader.svelte:350`.

**Weakness.** Both hosts gate the card's footer stepper on `asideCollapsed`. Measured on `#/voynich`
object 1: with the sidebar open the card has **no** stepper; collapse the sidebar and the same card
grows `‹ Prev   1 / 12   Next ›`. Pressing **Next** changes the card's eyebrow to
`f18v — Herbal (the sonified folio)` and its body to that folio's note — i.e. from inside a note
card, "Next" moves you to a different **object**.

In the narrative, the same control under the same gate steps **sections**
(`unit: "section"`, `navLabel: "Sections in this narrative"`). The visible text is identical in both
cases — `‹ Prev  N / M  Next ›` — because the unit word appears **only** in the `aria-label`. So a
sighted first-time visitor reading a note card that says `1 / 12` has every reason to read it as
"note 1 of 12", and no way to find out otherwise except by pressing it.

Two separate weaknesses, one control: the *discoverability* (a primary nav affordance that exists
only in a collapsed-sidebar state most visitors never enter) and the *label* (a bare fraction inside
a note card). The aria side is already honest — `SidebarObjectNav` reads "Object 2 of 12" in full;
the popup's visible text should match it.

**Repro:** open a note → collapse the sidebar (`›`) → read the card's footer → press Next.
*(`/tmp/nt-04-popup-sidebar-collapsed.png`, `/tmp/nt-05-after-popup-step.png`)*

*(Principle: match between system and the real world; consistency. Route the label through the
`product-copy` skill.)*

### V71 — An open note hides half the filmstrip *(Severity: low — Look)*

**Surface:** `NotePopup` (z 30) over `Filmstrip` (z 25).

**Weakness.** Measured with a note open on `#/voynich`: the card's rect overlaps the filmstrip band
by **74px** vertically and covers **6 of the 12** frames. The stacking itself is correct and
deliberately chosen (`NotePopup.svelte:82-88`, `Archie-b42d` — verified: `elementFromPoint` at the
card's bottom-left returns `.note-body`, so the strip cannot steal the click). The cost is that
opening a note silently removes half of the survey affordance the reader was just using, with no
reflow and no acknowledgement — and vertical 2's `V22` shows the finder pill taking two more frames
from the other end.

*(Principle: Look; three fixed layers claiming one edge of the screen.)*

---

## Media inside a note

### V66 — The author's alt text is deleted at the model boundary *(Severity: high — a11y / Look)*

**Surface:** `packages/render-core/src/note/media.ts:9` and `:57-63`.

**Weakness.** `NoteMediaItem` is `{ kind, url }`. `splitNoteMedia`'s `MD_IMAGE` regex —
`/!\[[^\]]*\]\(\s*([^)\s]+)…/` — matches the alt text and captures only the URL, so the description
the author wrote is discarded before anything downstream could use it.

The seeded corpus proves it end to end. `published/sampler/canvas/si1/annotations.json` contains
`![f1r — a related folio](https://collections.library.yale.edu/…/default.jpg)`. Measured in the
running app on the note that renders it:

| Where the alt should surface | Measured |
| --- | --- |
| the tile's accessible name | `"Open image"` |
| the tile's `<img alt>` | `""` |
| the lightbox's `<img alt>` | `""` |
| the lightbox's `aria-label` | `"Note"` |

A screen-reader user opening that note hears: *"Open image, button"* → *"Note, dialog"* → an
unlabelled graphic. The note's whole point — *"This note carries its own picture"* — is the part that
doesn't arrive.

This is not "Archie has no alt-text field". Markdown's alt **is** the field, authors are already
using it, and the regex is already matching it. One capture group is thrown away.

**Repro:** `/viewer/#/sampler` → third object → its note → the thumbnail.
*(`/tmp/nt-31-obj3-note.png`, `/tmp/nt-32-lightbox.png`)*

*(Principle: WCAG 1.1.1 Non-text Content. Prior art: `tropy` carries per-photo/selection metadata
through to its viewer rather than reducing an image to a URL.)*

### V67 — Every media tile in a note carries the same accessible name *(Severity: low — a11y, latent)*

**Surface:** `NoteMedia.svelte:23` — `aria-label={`Open ${m.kind}`}`.

**Weakness.** A note with four images produces four buttons all named "Open image", indistinguishable
to AT and to voice control ("click Open image" — which one?). Recorded as **latent**: every note
reached in this drive had at most one tile, so this is read off the code, not off a screen. It is
the same root cause as V66 — with the alt carried, the name writes itself.

*(Principle: WCAG 2.4.6 / 4.1.2.)*

---

## The embed

*Provenance: driven against `dist/archie-viewer.js` **dated 2026-07-24 19:52** (and
`packages/archie-viewer/dist/` 19:55) via `recipes/try.html` on a plain static server. A concurrent
session is actively editing `packages/archie-viewer/src/` (`reader.ts`, `reader-guards.ts` were
touched today). **V68 in particular must be re-verified against the build on disk before a fix ticket
is opened** — it is exactly the shape of thing a reader-guard refactor could have caused or fixed an
hour either side of this drive. Nothing under that package was modified by this audit.*

### V68 — In the embed, a note opens with the keyboard but not with the mouse *(Severity: high — Feel; PROVISIONAL, re-verify)*

**Surface:** `packages/archie-viewer` marker overlay (`render-mount`'s read seam).

**Weakness.** Measured on `The Rosettes` in the embed, four ways:

| Attempt | Note opens |
| --- | --- |
| `mouse.click` at the marker's centre | no |
| slow press–release (120ms) on the marker's stroke | no |
| slow press–release (120ms) inside the marker region | no |
| focus the marker `<svg role="button" tabindex="0">`, press **Enter** | **yes** |

The cause is visible in the hit test: `shadowRoot.elementFromPoint` at the marker's own coordinates
returns an unnamed `<div>`, not the marker — something is painted over the overlay, so pointer events
never reach the `role="button"` element that the keyboard reaches directly. The marker's `svg` is
correctly wired (`role="button"`, `tabindex="0"`, `aria-label` = the note's text) — `Archie-9413`'s
work is intact and is the only reason the note is reachable at all.

A first-time visitor with a mouse — which is to say, the reader `GOAL.md:11-13` describes — clicks
the annotated region of an embedded exhibit and nothing happens.

**Repro:** `http://localhost:8899/recipes/try.html` → The Rosettes → the folio → click inside the
marked region, then Tab to the marker and press Enter. *(`/tmp/nt-64-embed-mouse.png` vs
`/tmp/nt-62-embed-enter.png`)*

*(Principle: WCAG 2.1.1's converse — parity between input modes.)*

### V69 — The embed's marker is a 1.5px near-black hairline with no reading colour *(Severity: medium — Look)*

**Surface:** embed marker overlay.

**Weakness.** Measured computed style: `stroke: rgb(42, 35, 32)`, `stroke-width: 1.5px`,
`fill: rgba(0,0,0,0)` — a hairline in near-black ink over a beige parchment folio, and the same
colour for every note regardless of which reading it belongs to. The shell draws markers through
`readingMarkerStyle` and they read as coloured regions (`/tmp/br-12-voynich-reader.png` — the green
ring). In `/tmp/nt-52-embed-note.png` the three markers read as scratches on the scan.

Note this is **not** the roll-up's standing correction about colour-*only* coding: that concerns
shared code conveying reading identity by colour alone. Here the embed conveys it by **nothing** —
the readings are visually indistinguishable from each other and nearly indistinguishable from the
image. Marker rendering proper is vertical 3's ground; recorded here because with no note list in
the embed (V70) the marker is the reader's only door to a note.

*(Principle: Look; ADR-0019's "one engine, not a fork" — the sanctioned divergence is the marker
*layer technology*, not its visual language.)*

### V70 — The embed has no note list, so the invisible marker is the only door *(Severity: medium — Feel)*

**Surface:** embed object view.

**Weakness.** Measured, the object view's complete control set is `← The Rosettes` and `×`. There is
no notes sidebar, no reading legend, no finder — the shell offers all three. Combined with V68 and
V69, an embedded exhibit's notes are reachable only by finding a hairline you can barely see and
clicking it in a way that (in this build) doesn't work. Each of the three is survivable alone; they
compound.

*(Principle: consistency across consumers.)*

---

## Checked and cleared — do not re-report

- **The lightbox's focus trap works.** Measured green on both axes TEND-EXPLORE I-V3 flagged as
  untested: `role="dialog"` + `aria-modal="true"` + scrim; focus moves to **Close** on open; Tab is
  trapped (six presses, `document.activeElement.closest('.lb')` true throughout); `Escape` closes and
  **returns focus to the tile that opened it**; a scrim click does the same. `use:dialog` is sound —
  V63 is about a surface that doesn't use it.
- **Escape does not double-fire.** `Reader.svelte:293` correctly yields Escape to the lightbox/sheet
  while either is open; closing the lightbox leaves the note popup open beneath, as intended
  (measured).
- **Sanitization is sound and needs no finding.** `text/sanitize.ts` runs snarkdown → DOMPurify
  (html profile), plus an `afterSanitizeAttributes` hook that unwraps any anchor left without an
  `href` ("no dead anchors"), and `note/media.ts`'s `isSafeMediaUrl` allowlists only
  `http(s)`/`blob:`/typed `data:` before a URL may become a live `src`. Rendered note HTML in the
  drive was plain formatted text with hash-scoped `cite-card` anchors; nothing escaped.
- **The popup's z-order over the filmstrip is correct**, not a stacking bug — deliberate and
  documented (`Archie-b42d`), and verified by hit test. The *occlusion* is V71.
- **The popup's aria labels are honest per host** — `unit` / `navLabel` are threaded so the narrative
  says "section" and the grid says "object". V65 is about the **visible** text only.
- **Flip-and-read works.** Stepping objects from inside the card keeps the card open and re-mints it
  on the next object (measured: eyebrow and body both change, `.note-pop` never unmounts).

## Not reached, and why

- **Portable mode's note card.** The test library
  (`/mnt/Ghar/2TA/DevStuff/Annotators/Image/archie-library.archie.zip`) has two exhibits and neither
  yields a note: `assets` shows `0 NOTES` on both objects, and its `screenshots` narrative reports
  `NOTES · 0` on the landing section. The note card could not be exercised in portable mode. The
  shell code path is identical (same `NotePopup`, same host), and the one portable-specific hazard —
  `blob:` URLs in `NoteMedia` tiles — is already handled deliberately (`NoteMedia.svelte:12-17`
  keys the failed-tile set by URL rather than index precisely because portable URLs are `blob:`).
  A library with media-bearing notes would close this.
- **External links inside note prose.** No seeded note contains an `http(s)` link (only intra-library
  cites, which render as `cite-card` anchors with hash hrefs). Whether an external link in a note
  should carry `rel="noopener"`, or open in a new tab rather than navigating the host page out from
  under an **embed**, is therefore untested — and the embed case is the one that matters.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted, grid reader | yes (`#/voynich`, `#/voynich-rosettes`, `#/sampler`) | V60–V67, V71 |
| `apps/viewer` hosted, narrative reader | yes (`#/voynich-reading`) | V65 (section form confirmed) |
| `apps/viewer` portable | reached; no notes in the test library | none — see above |
| `packages/archie-viewer` (embed) | yes, local `dist/` @ 19:52 | V68, V69, V70 |
| `packages/render-mount` | yes — the embed's marker overlay is its read seam, and V68/V69 land on it | V68, V69 |
