# UX audit — Viewer vertical 2: Browsing an exhibit (V20–V31)

Ticket `Archie-57dc`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-24, all
four consumers, real Chromium at 1280×800 (embed at 1280×900).

**What this vertical asks:** once inside an exhibit, how does a reader find their way among its
objects — and does the structure they're shown match the one the author built?

The test exhibit is `#/voynich` ("The Whole Manuscript", 12 objects: 11 folios + one audio), the
library's only multi-object **grid** exhibit. `#/voynich-rosettes` is single-object (it opens
straight into the reader, no overview) and `#/screenshots` / `#/voynich-reading` are **narratives**
(vertical 5's ground) — a fact worth recording, because it means the grid overview this vertical
audits is exercised by exactly one seeded exhibit.

Screenshots are `/tmp/br-*.png`; every finding carries its repro.

---

## The exhibit overview

### V20 — The survey surface shows 3 of 12 items, and its default density is the one that shows fewest *(Severity: medium — Look)*

**Surface:** `ObjectGrid.svelte`, `#/voynich`.

**Weakness.** Measured at 1280×800: the header (eyebrow · title · summary · credit · density toggle)
ends at y=409 and the first card starts at y=449 — **more than half the viewport before the first
object**. Three cards are partly visible, three fully. The exhibit's own summary says it exists "to
browse side by side."

The `Compact` density fixes most of it — 4 columns instead of 3, 8 cards in view, document height
1925px → 1377px — but `Comfortable` is the default (`grid-density.ts`), so the first-time visitor
gets the narrowest survey and must find a toggle to widen it. The grid is also capped at
`max-width: 60rem` (measured 960px) inside a 1280px viewport: 320px of the widest axis is unused
while the vertical axis is the one under pressure.

**Repro:** `/viewer/#/voynich` *(`/tmp/br-10-voynich-grid.png` vs `/tmp/br-30-voynich-compact.png`)*.

*(Principle: Look — the survey surface should survey. Prior art: `tropy`'s `ItemGrid` is the whole
pane with size as a toolbar zoom, not a header block that has to be scrolled past.)*

### V21 — The loudest mark on the overview is a viewing preference *(Severity: low — Look)*

**Surface:** `ObjectGrid.svelte:104-113`, the COMFORTABLE / COMPACT segmented toggle.

**Weakness.** It is the only accent-filled element on the page (`background: var(--accent)`, white
text, uppercase, tracked) and it sits above the objects. system.md's depth strategy rations the
accent for the focal signal; here the one loud mark on an exhibit's front page is a per-device
display setting, competing with a 3rem display title for the same glance.

*(Principle: Look; rationed accent. Visible in `/tmp/br-10-voynich-grid.png` — the green pill reads
before the title does.)*

---

## Moving between objects

### V22 — The floating finder pill covers two of the twelve filmstrip frames *(Severity: medium — Look)*

**Surface:** `ExhibitView.svelte`'s `.finder-trigger` over `Filmstrip.svelte`.

**Weakness.** Measured in the reader: the pill's rect is (1102, 748)–(1260, 780); the strip's frames
run the full 1280px width at y 706–800. **Two frames intersect the pill**, including the audio
object's — the one object in this exhibit that is not a folio, i.e. the one a reader is most likely
to be hunting for. The strip does not scroll at 12 items (`scrollWidth === clientWidth === 1280`),
so those frames cannot be scrolled out from under the pill.

On the overview the same pill clips the bottom-right *corner* of the third card, which carries no
text — recorded so a fix ticket knows the grid case is cosmetic and the strip case is not.

**Repro:** `/viewer/#/voynich` → open any object *(`/tmp/br-12-voynich-reader.png`, right end of the
strip)*.

*(Principle: Look; two fixed layers claiming one corner.)*

### V23 — The four nav affordances agree about where you are and disagree about what you are looking at *(Severity: medium — Feel / copy)*

**Surface:** `ViewerShell.svelte` breadcrumb + top carousel, `SidebarObjectNav.svelte`,
`Filmstrip.svelte`, `ObjectGrid.svelte` header.

**What is right, measured first:** they agree on position. Reading object 2, the filmstrip's
`aria-current="true"` frame is index 1, the top carousel reads `‹ 2 / 12 ›`, the sidebar reads
`Object 2 of 12`. Stepping with any one of them moves all of them. The ticket's "do they agree about
where the reader is?" answers **yes**.

**Weakness.** They do not agree on what the twelve things are called:

| Surface | Word used |
| --- | --- |
| Grid header eyebrow | `Exhibit · 12 **items**` |
| Top carousel landmark | `aria-label="**Media** in this exhibit"` |
| Top carousel arrows | `"This is the first **item**"` (`ViewerShell.svelte:265,267`) |
| Filmstrip handle / list | `"Show all 12 **items**"` / `"Jump to an **item**"` |
| Sidebar landmark + stepper | `"**Objects** in this exhibit"` / `"Object 2 of 12"` / `"Previous **object**: …"` |

Three nouns — *item*, *media*, *object* — for one set, two of them inside the same screen and one of
them (`media`) exposed only to assistive technology, where a screen-reader user hears two landmarks
("Media in this exhibit", "Objects in this exhibit") and has no way to know they are the same twelve
things. Studio locked "Back to Exhibit" as the canonical up-level phrase for exactly this reason
(`SidebarObjectNav.svelte:25-27`, Archie-dba2/Archie-2cc1); the noun never got the same treatment.

*(Principle: consistency; match between system and the real world. Route the wording through the
`product-copy` skill — the fix is one noun, not five edits.)*

### V24 — The viewer reads an object address it never writes *(Severity: high — Feel)*

**Surface:** `ViewerShell.svelte`'s hash router; every in-exhibit nav affordance.

**Weakness.** `#/voynich/o/o5` resolves correctly — measured, it lands on "Object 5 of 12",
`f67r — Astronomical (foldout)". The grammar exists, is documented (ADR-0018), and works on arrival.
**Nothing in the app ever produces it.** Measured across a browse session:

| Step | `location.hash` | `history.length` |
| --- | --- | --- |
| Arrive at `#/voynich` | `#/voynich` | 2 |
| Open card 3 (Object 3 of 12) | `#/voynich` | 2 |
| Sidebar **Next** (Object 4 of 12) | `#/voynich` | 2 |
| Browser **Back** | `""` — the gallery | 2 |

The whole viewer contains exactly two hash writes, `ViewerShell.svelte:79` and `:156`, and both are
"reset to `#/`". So: a reader twelve objects deep has an address bar that still says where they came
in; **Back does not step back, it leaves the exhibit**; a reload returns to the overview; and the
link they copy to send a colleague points at the exhibit, never at the folio they are looking at —
even though the app would have honoured such a link perfectly.

**This is not the hash-vs-path question.** `Archie-33bf`'s 2026-07-20 correction settled that
hash-routed deep links are deliberate (`sitemap.xml.ts:1-2`, ADR-0013) and that the sitemap /
`getStaticPaths` enumeration difference is intended (Archie-77b2) — do not re-open either. The gap
is one layer down: the chosen grammar is **read-only**. It also re-frames TEND-EXPLORE I-V1's
reader-facing consequence — no rung below the exhibit is shareable, not merely unindexed.

**Prior art has both halves of this.** `annomea/docs/adr/0013-v2-url-addressing.md` records the same
gap as a known minus: *"No `replaceState` writeback of reader state to the URL yet; selecting an
annotation does not update the address bar."* Its parent, `anvil/docs/adr/0013-v2-url-addressing.md`,
already specifies the answer under **"URL writeback — `history.replaceState`, not `pushState`"**:
write the current page back on every page change, with `replaceState` precisely so the back button
still escapes the viewer cleanly instead of collecting one entry per object. That is the designed
shape, from the corpus, for the exact decision this finding raises.

**Repro:** `/viewer/#/voynich` → click a card → watch the address bar *(`/tmp/br-20-after-back.png`)*.

*(Principle: visibility of system status; user control and freedom. Compounds V2 — the shell already
has a router that doesn't re-render on `popstate`; this is the same router never writing.)*

### V25 — The keyboard object-step stops working the moment the reader touches the image *(Severity: medium — Feel)*

**Surface:** `ExhibitView.svelte:192-205` (`←`/`→` object stepping).

**Weakness.** Measured: with focus on the body, `ArrowRight` steps *Object 3 of 12 → Object 4 of 12*.
With focus on `.openseadragon-canvas` — where it lands as soon as the reader clicks the folio they
came to look at — `ArrowRight` pans the image and the position does not change.

The cede is deliberate and documented in that comment block ("OSD owns the arrows"), and it is the
right call for a deep-zoom canvas. The weakness is that **nothing tells the reader which mode they
are in**: the same key does two different things depending on an invisible focus state, with no
focus ring on the canvas, no hint, and no alternative key (Studio's rail uses `[` / `]` for exactly
this reason — `Archie-5e96`, `a11y-interactions.md:91`). A first-time visitor who presses → twice,
gets one step and then nothing, learns that arrows are unreliable.

**Repro:** open an object, press `→` (steps), click the image, press `→` (pans).

*(Principle: consistency and standards; visibility of system status.)*

### V26 — There is no Escape ladder inside an exhibit *(Severity: low — Feel)*

**Surface:** `Reader.svelte:293-294`.

**Weakness.** Escape in the reader is bound only to "close the selected note". With no note open,
measured: Escape does not close the filmstrip, does not return to the overview, does nothing at all
(hash `#/voynich`, still "Object 2 of 12"). The only way up a level is the `BACK TO EXHIBIT` button
in the sidebar — which is invisible when the sidebar is collapsed. This is the same shape as V1's
inert Escape in the empty hall: the viewer has an Escape *binding* per surface but no *ladder*.

*(Principle: user control and freedom.)*

---

## The filmstrip

### V27 — The filmstrip is twelve consecutive tab stops, in a repo that ratified roving tabindex for this exact component *(Severity: medium — Feel / a11y)*

**Surface:** `Filmstrip.svelte:30-42`.

**Weakness.** Measured tab traversal of the reader: 33 stops, of which **12 are filmstrip frames**
(positions 20–31). Every frame carries `tabindex` null, i.e. all twelve are in the page tab
sequence. Inside the strip, `ArrowRight` does not move focus and `Home` does not move focus; Escape
does not close it. A keyboard reader who wants the control *after* the strip presses Tab twelve
times.

This is not a pattern question anyone still has to answer here. `docs/research/a11y-interactions.md`
§2 (`:89-95`) prescribes, for a filmstrip rail, "`aria-current="true"` on the focused/current object
thumbnail **and roving tabindex** — same mechanics as the grid above, not a new pattern (APG Grid,
'Layout Grid Examples': thumbnail-rail-shaped layout grids are explicitly one of the three worked
examples)". `Archie-f260` then shipped it in Studio: *"(4) Filmstrip tiles rove with aria-current,
activation explicit, works collapsed."* The viewer's filmstrip took the `aria-current` half and left
the roving half — the decision was made once and propagated to one of the two surfaces, which is the
thesis this map exists to test.

**Prior art, independent of the repo's own research:** `tropy` puts the *container* in the tab
sequence once (`src/components/item/iterator.js` `get tabIndex()`) and moves a cursor inside it with
arrows / `Alt+Arrow` for first-last / `Enter` to open (`res/keymaps/renderer.en.yml`, `ItemGrid` and
`SelectionGrid`) — a shipping image-annotation app with the same rail-of-thumbnails problem.
`a11y-interactions.md:160` additionally cites Mirador's `ThumbnailNavigation.jsx` as the closest
transferable decision.

**Repro:** open an object, focus the first frame, press `→` (nothing), then count Tabs to leave.

*(Principle: consistency with the repo's own ratified pattern; WCAG 2.1.1 in spirit — reachable, but
at twelve times the cost.)*

### V28 — The filmstrip's frames are unlabelled and, for a manuscript, near-identical *(Severity: medium — Look)*

**Surface:** `Filmstrip.svelte:34-38` + `MediaThumbnail.svelte:35`.

**Weakness.** A frame is an 88px plate and nothing else: no caption, no note count, `<img alt="">`,
and identity available only as a `title` tooltip on hover (which touch readers never get). On this
exhibit that yields twelve beige rectangles of the same manuscript in the same lighting —
`/tmp/br-12-voynich-reader.png` shows the strip, and the only frame distinguishable at a glance is
the audio one, which is the one the finder pill sits on (V22).

The grid overview solves the same problem properly, one screen earlier: label + note count under
every plate. The strip is described in its own header comment as the "light, always-glanceable"
survey affordance; at this scale there is nothing to glance at.

*(Principle: Look; recognition rather than recall.)*

---

## Media plates

### V29 — Video is the only object type whose plate can render blank, and its one guard cannot fire *(Severity: medium — Look)*

**Surface:** `MediaThumbnail.svelte:37-44`.

**Weakness.** Three of the four plate types are drawn by the app and cannot fail: audio gets a
waveform, map a graticule and pin, image an `onerror` chain ending in the honest "Couldn't load this
image". Video is the exception — it mounts a real `<video preload="metadata">` and relies on the
browser painting the first frame. Measured in the portable library's `assets` exhibit:
`readyState: 4`, `videoWidth: 0`, `error: null` → a 304×228 empty rectangle carrying only the
`▶ VIDEO` badge. The plate's only failure guard is `onerror`, which a decode-to-nothing never
triggers.

**Caveat, stated rather than hidden:** this drive was headless Chromium, whose codec set is smaller
than a shipping browser's, so this particular file might paint elsewhere. That does not remove the
finding — "the reader's browser can't decode this codec" is a *normal* outcome for a published
exhibit, and it is exactly the case the guard misses. Confirm the specific file in a codec-complete
browser before sizing the fix; the missing `videoWidth === 0` / `loadedmetadata` check stands either
way.

**Repro:** Open another library → `archie-library.archie.zip` → `assets`
*(`/tmp/br-34-portable-exhibit.png`, right-hand card)*.

*(Principle: Look; honest system status — the code already knows how to say "couldn't load", on
three of four paths.)*

---

## The embed

*Provenance: driven against `dist/archie-viewer.js` **dated 2026-07-24 19:52** (and
`packages/archie-viewer/dist/` 19:55) via `recipes/try.html` over a plain static server on :8899. A
concurrent session owns `packages/archie-viewer/src/`; re-verify V30/V31 against the build on disk
before opening fix tickets. Nothing under that package was modified by this audit.*

### V30 — The embed offers no way to move between objects at all *(Severity: high — Feel)*

**Surface:** `packages/archie-viewer` object view.

**Weakness.** Measured, the entire chrome of the embed's object view is two controls:
`← The Whole Manuscript` and `×`. No stepper, no filmstrip, no carousel, no breadcrumb landmark
(`document.querySelectorAll('nav')` returns **0** on both the embed's exhibit and object views).
Reading folio 1 and then folio 2 requires a round trip out to the grid and a fresh click. The shell
gives the same reader four ways to do it; the embed gives zero.

ADR-0019 specifies "a thin shell over the SAME `@render/core` — one engine, not a fork", and the
divergence it sanctions is the marker layer, not object navigation. `element.ts:9-10` records the
cause the same way V9 did: the markup was **ported, not imported**. A curator who embeds a 12-folio
exhibit in their CMS ships a reader that can only be operated one object at a time.

**Repro:** `http://localhost:8899/recipes/try.html` → The Whole Manuscript → f1r
*(`/tmp/br-52-embed-object.png`)*.

*(Principle: consistency across consumers; Feel.)*

### V31 — The embed's card grid has ragged bottoms; the shell's does not *(Severity: low — Look)*

**Surface:** embed exhibit grid vs `ObjectGrid.svelte`.

**Weakness.** Measured per row: the shell's card heights have a spread of **0px** in every row (the
2-line `-webkit-line-clamp` at `ObjectGrid.svelte:131` exists precisely so "the gallery wall reads
even"). The embed's rows measure `[266, 288, 266, 266]` — a **22px** spread wherever a title wraps to
two lines. Same library, same titles, one wall even and one ragged.

**Repro:** `/tmp/br-51-embed-exhibit.png`, first row.

*(Principle: Look; V9's family — the port carried the structure and dropped the craft.)*

---

## Checked and cleared — do not re-report

- **The overview grid's twelve tabbable card buttons are not an a11y defect.** APG's Grid pattern
  applies to grids whose cells hold interactive children or that support reorder — which is why
  `Archie-f260` applied it to Studio's *editor* list. A gallery of card buttons is the standard web
  pattern, and `a11y-interactions.md` names the **filmstrip** (§2), not the reader's overview. V27
  is the real gap; do not widen it to the grid.
- **The three nav affordances do not disagree about position.** Measured directly (V23) — filmstrip
  `aria-current`, carousel counter and sidebar stepper all read the same object, and stepping any one
  moves all three. The disagreement is vocabulary only.
- **The shell's cards are not uneven.** Row height spread measured 0px on three consecutive rows.
  (The embed's are — V31.)
- **The filmstrip does not overflow or mis-scroll at this scale.** `scrollWidth === clientWidth ===
  1280` with 12 frames, and the current frame is in view at both ends of the set (object 12 measured
  `currentInView: true`). There is no scroll-into-view bug to report at 12 items; whether one appears
  at 40 is untested.
- **Portable mode is not a reduced browse surface.** A dropped `.archie.zip` renders the grid, the
  density toggle, the breadcrumb, the top carousel, the sidebar stepper and the filmstrip — all
  present, `Object 1 of 2` correct. V8's chrome loss is a gallery-level finding and does not extend
  inward.
- **The `sitemap` / `getStaticPaths` route-set difference (TEND-EXPLORE I-V1).** Deliberate, twice
  documented (`sitemap.xml.ts:1-2` + Archie-33bf's 2026-07-20 correction). Its reader-facing
  consequence is folded into V24; it is not a separate defect.
- **Density is remembered.** Compact survives a reload (`grid-density.ts` localStorage) — verified,
  not a gap.
- **Astro dev toolbar.** Filtered from every query in this drive, per the index.

## Correction to vertical 1 — V7 is misdiagnosed

V7 reports "no cover fallback: an exhibit without an explicit cover renders as a text placeholder".
Measured, all three clauses are wrong:

1. The exhibit **has** a cover — `published/exhibits.json` declares
   `"cover": "screenshots/assets/o1-e1-embed.png"` for `screenshots`.
2. The file **exists** — `apps/viewer/public/published/screenshots/assets/o1-e1-embed.png`, 61 KB.
3. The **fallback already exists and fired correctly** — `Gallery.svelte:83-86` renders an `<img>`
   with `onerror` → `.cover-fallback` showing the title, which is exactly what the reader sees.

What actually happens: the relative cover path is resolved against the page URL instead of the
published base, so the browser requests
`http://localhost:5173/viewer/screenshots/assets/o1-e1-embed.png` and gets **404** (captured on the
response listener during this drive). Every other card's cover is an absolute IIIF URL, which is why
only this one card is blank.

A fix ticket opened from V7 as written would build a first-object fallback that already exists and
leave the bug. The real fix is base-path resolution for relative `cover` values. V7's *symptom*
(first card, top-left, blank) and its Look severity stand.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted | yes (`#/voynich`, 12 objects) | V20–V28 |
| `apps/viewer` portable | yes (`archie-library.archie.zip` → `assets`) | V29; browse chrome confirmed at parity |
| `packages/archie-viewer` (embed) | yes, local `dist/` @ 19:52 | V30, V31 |
| `packages/render-mount` | reached only as the embed's canvas + SVG overlay | none — object *navigation* never enters its seam; its surface is vertical 3's |
