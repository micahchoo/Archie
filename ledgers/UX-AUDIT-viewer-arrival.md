# UX audit — Viewer vertical 1: Arrival (V1–V12)

Ticket `Archie-0cf5`. Index: [UX-AUDIT-viewer.md](UX-AUDIT-viewer.md). Drive date 2026-07-24, all
four consumers, real Chromium at 1280×800.

**What this vertical asks:** what does a first-time visitor meet in the first ten seconds, across
every way of arriving, and where does it fail them?

Screenshots referenced below are `/tmp/arr-*.png` from the drive; the reproduction steps are in each
finding so they can be re-shot.

---

## Getting out of where you landed

### V1 — The empty hall is a one-way door *(Severity: high — Feel)*

**Surface:** `EmptyHall.svelte`, reached by the **OPEN ANOTHER LIBRARY** link in `ViewerShell`'s
top-right corner.

**Weakness.** Clicking it from inside an exhibit replaces the entire app with the drop screen, and
the app's only control there is a single **Open a library…** button. Measured in the light DOM with
the Astro dev toolbar filtered out: **one** control, total. `Escape` is inert. There is no cancel, no
"never mind", no route back to the library that was open a second ago.

ADR-0008 added this affordance to *both* data modes in a 2026-05-27 user override, reasoning that it
must be anchored in persistent chrome "so a single-exhibit collapse can't trap the reader." As built,
the mitigation is itself the trap — and it sits in the highest-value real estate on the page, top
right, where it is the most prominent interactive element a first-time visitor sees while serving the
rarest thing they could want.

**Repro:** `/viewer/` → click any card → click OPEN ANOTHER LIBRARY. *(`/tmp/arr-07-emptyhall.png`)*

*(Principle: user control and freedom — a clearly marked emergency exit.)*

### V2 — Browser Back restores the address but not the view *(Severity: high — Feel)*

**Surface:** the shell's hash router, `ViewerShell.svelte`.

**Weakness.** From the empty hall, pressing Back sets the address to `#/voynich-rosettes` — and the
drop screen stays on screen. The URL claims the reader is in an exhibit; the pixels say they are
nowhere. Only a full reload recovers (verified: reload at that same hash restores the exhibit, so the
hall state is session-only, not persisted).

This is why V1 has no workaround. The reader's instinctive escape — Back — appears to do nothing,
which is the canonical "this app is broken" moment. Two findings rather than one because the fixes
differ: V1 wants an exit control, V2 is a router that doesn't re-render on `popstate`.

**Repro:** as V1, then `page.goBack()`. *(`/tmp/arr-08-back-disagree.png`)*

*(Principle: visibility of system status; consistency between address and view.)*

---

## Arriving at a link that no longer resolves

ADR-0021 mandates that an unresolvable `target` **degrades upward and never errors**. It does. What
it doesn't do is behave the same way twice.

### V3 — Two of three ladder rungs announce the degrade; the slug rung is silent *(Severity: high — Feel)*

**Surface:** deep-link arrival, all rungs.

**Weakness.** Measured:

| Arrival | What the reader is told |
| --- | --- |
| `#/no-such-exhibit` | **nothing** — the gallery appears as if that had been the link all along |
| `#/{slug}/o/no-such-object` | "That item isn't in this exhibit — showing the exhibit instead · DISMISS" |
| `#/{slug}/a/no-such-note` | "That note isn't here anymore — showing the exhibit instead · DISMISS" |

A visitor who followed a colleague's link to a specific exhibit lands on a gallery of six and has no
way to know they didn't arrive where they were sent. The notice component already exists and already
works — this is one rung not using it, not a missing capability. Studio's equivalent decision
(`Archie-02ae`, ADR-0024) paired nearest-ancestor fallback **with** a notice; the viewer took the
fallback and left the notice.

**Repro:** `/viewer/#/no-such-exhibit` *(`/tmp/arr-04-bad-slug.png`)* vs `/viewer/#/voynich-rosettes/o/no-such-object` *(`/tmp/arr-05-bad-object.png`)*.

*(Principle: visibility of system status; consistency.)*

### V4 — After degrading, the dead address stays in the address bar — on two rungs, but not the third *(Severity: medium — Feel)*

**Surface:** same.

**Weakness.** The object and note rungs degrade the *view* but leave the hash at
`#/voynich-rosettes/o/no-such-object`. The reader who copies that URL propagates the broken link they
were just rescued from, and every reload re-fires the notice. The slug rung does the opposite — it
rewrites the hash to `#/`. Two rungs of one ladder, two opposite policies on whether the address
follows the degrade.

*(Principle: consistency; match between system and the real world.)*

### V5 — "That note isn't here anymore" asserts a cause it can't know *(Severity: low — copy)*

**Surface:** the note-rung degrade notice.

**Weakness.** "Isn't here **anymore**" claims the note was deleted. The system knows only that it
didn't resolve — which is equally consistent with a typo, a link to a different library, or a note
that never existed. The object rung's wording ("That item isn't in this exhibit") is accurate about
exactly the same class of failure; the note rung should match it.

*(Principle: honest system status. Route through the `product-copy` skill.)*

---

## The gallery itself

### V6 — Mode-dependent search shipped on the read side *(Severity: medium — Feel)*

**Surface:** `Gallery.svelte` — the EXHIBITS / ALL IMAGES toggle and the adjacent search field.

**Weakness.** Flipping the toggle silently changes what the search box searches. The only signal is
the placeholder: `"Search exhibits…"` → `"Search images…"`. A reader who types before noticing
searches the wrong corpus and reads an empty result as "this library doesn't have it."

This is **Studio's W7, verbatim**, on the read side. W7 was fixed in Studio by `Archie-2308`'s
unified grouped search (lens browses, search finds everything) and merged in `2c47bdb`; the viewer
kept the split. Direct, measured evidence of what happens when a decision is made on one surface only
— which is the thesis this whole map was created to test.

*(Principle: visibility of system status.)*

### V7 — No cover fallback: an exhibit without an explicit cover renders as a text placeholder *(Severity: medium — Look)*

**Surface:** `Gallery.svelte` cards.

**Weakness.** In the hosted gallery, five of six cards show a real IIIF thumbnail and the sixth —
**"Archie, Annotated", which sits first, top-left, where the eye lands** — has no `<img>` element at
all, just its title in a blank box. Verified in the DOM: `hasImg: false`, not a failed load. That
exhibit contains 21 objects, any of which could have stood in.

Studio does this correctly: `LibraryHome` renders "explicit cover **else** first object's thumb via
`readThumbUrl`" (decision `Archie-2308`; spec `docs/plans/SCALE-GALLERY-PLAN.md` P3b). The viewer has
no such fallback, so the first thing a first-time visitor sees is the emptiest cell on the page.

`GOAL.md` ranks **Look** first, above everything.

**Repro:** `/viewer/` *(`/tmp/arr-01-gallery.png`)*.

*(Principle: Look; consistency with the authoring surface.)*

### V8 — The shell's chrome changes with its data mode *(Severity: medium — Feel)*

**Surface:** `Gallery.svelte` under hosted vs portable sources.

**Weakness.** The hosted gallery carries the EXHIBITS / ALL IMAGES toggle. The portable gallery — the
same shell, same component, a dropped `.archie.zip` instead of a baked tree — shows the search field
alone, no toggle. ADR-0008's whole commitment is *one shell whose only difference is where the data
came from*; a reader handed a `.archie.zip` gets a quietly smaller app, and nothing tells them a
capability is absent rather than moved.

**Repro:** compare `/tmp/arr-01-gallery.png` (hosted) with `/tmp/arr-09-portable.png` (portable).

*(Principle: consistency; ADR-0008's stated contract.)*

### V12 — Arrival says nothing about what the reader has arrived at *(Severity: low — judgment, not defect)*

**Surface:** hosted `/viewer/` first paint.

**Weakness.** The page opens on `GALLERY · 6 EXHIBITS` / `Archie Library` / a search box / cards.
There is no sentence saying what this collection is, who assembled it, or what an "exhibit" will be
when opened. `GOAL.md:11-13` wants a first-time visitor to find it "obviously trustworthy" — trust on
a scholarly artifact usually starts with provenance, and the read-side donors in the prior-art corpus
(`quire`, `juncture`) lead with a statement of the work.

Recorded as judgment rather than defect: it is a design position, and the library-level description
field may simply be unset in the seed. Verify against a library that sets one before acting.

*(Principle: match between system and the real world; orientation.)*

---

## The embed, arriving

### V9 — The embed and the shell are visually unrelated products *(Severity: high — Look)*

**Surface:** `packages/archie-viewer` vs `apps/viewer`, same library, side by side.

**Weakness.** The shell renders a green atmospheric gradient, a custom display face, warm-paper cards
with soft shadows. The embed renders white, `system-ui`, an orange accent, square hairline cards. Not
a subtle drift — a curator who publishes an exhibit and then embeds the same library in their CMS
ships two different-looking products under one name.

ADR-0019 specifies "a thin shell over the SAME `@render/core` — one engine, not a fork", and the
divergence it *sanctions* is the marker layer (Annotorious/PixiJS dropped for a DOM-SVG overlay).
Typography, palette and card treatment are not that. `element.ts:9-10` records the cause: the markup
was **ported, not imported**.

`GOAL.md` ranks **Look** first.

**Repro:** `/tmp/arr-01-gallery.png` vs `/tmp/arr-11-embed-src.png`.

*(Principle: consistency; Look.)*

### V10 — The embed handles a broken source better than the shell handles a broken target *(surplus, not a defect)*

**Surface:** `<archie-viewer src="…">` pointing at a 404.

**Observation.** The embed shows, in place and in plain language: *"Couldn't open the library. The
link may be broken or the file unavailable."* — directly beneath the still-usable **Open a library…**
button, so the reader is told what happened and handed the recovery in one view.

That is precisely what V1 and V3 are missing on the shell side. **The fix for V3 already exists in
this repo**; it is a matter of using it, not designing it. Recorded here so the fix ticket doesn't
start from a blank page.

**Repro:** `/tmp/arr-12-embed-badsrc.png`.

### V11 — The embed's gallery renders no thumbnails at all *(Severity: medium — Look)*

**Surface:** embed gallery, zip-sourced library.

**Weakness.** Both cards render as title-only placeholders. Compare the hosted shell, which resolves
IIIF thumbnails for five of six. Distinct from V7 (which is a missing *fallback* for one uncovered
exhibit): here the cover path resolves nothing at all when the library came from a zip. Whether this
is the same absent fallback or a broken blob-URL rewrite for covers (ADR-0010's `loadPortableExhibit`
rewrites `object.source` and `/assets/` tokens — covers may not be in that set) is the fix ticket's
first question.

**Repro:** `/tmp/arr-11-embed-src.png`.

*(Principle: Look.)*

---

## Checked and cleared — do not re-report

- **"Report a Bug" / "Feedback" / "Inspect" / "Audit" links.** Astro's **dev toolbar**, not app
  chrome; the hrefs point at `withastro/astro` and `withastro/roadmap`. They do not ship. Filter
  `astro-dev-toolbar` out of every DOM query.
- **The "assets" card in the zip-sourced gallery.** Not an internal directory leaking into the
  reader's view. `exhibits.json` in that library genuinely declares
  `{"slug":"assets","title":"assets","order":0}` with a two-item manifest — the viewer is faithfully
  rendering what was published. What survives is V7 (no cover fallback), not a leak.
- **A single 400/404 in the console on gallery load.** Known-benign per the `run-app` skill; one
  remote IIIF fetch, no content missing.

## Provenance caveat on the embed findings (V9, V10, V11) — re-verify before acting

The embed was driven against the **`dist/archie-viewer.js` build dated Jul 22 00:18**. While this
audit was being written, a **concurrent session** edited `packages/archie-viewer/src/`
(`element.ts`, `index.ts`, `reader.ts`, new `reader-guards.ts`) and rebuilt the bundle twice —
`dist/` at 19:52 and `packages/archie-viewer/dist/` at 19:55 on 2026-07-24, i.e. after the drive.

V9 (visual divergence from the shell), V10 (failed-`src` copy) and V11 (no zip-sourced thumbnails)
therefore describe the Jul 22 bundle, not necessarily the one on disk now. Nothing about a
reader-guard refactor obviously touches typography or cover resolution — but that is a guess, and
this ledger doesn't trade in guesses. **Re-drive the embed against the current build before opening
fix tickets for V9/V11.** The shell findings (V1–V8, V12) are unaffected: `apps/viewer` was not
touched.

## Consumer coverage

| Consumer | Driven | Findings |
| --- | --- | --- |
| `apps/viewer` hosted | yes | V1–V7, V12 |
| `apps/viewer` portable | yes | V8, and V1/V2 confirmed in both modes |
| `packages/archie-viewer` embed | yes, local `dist/` | V9, V10, V11 |
| `packages/render-mount` | not reached at arrival | none — its surface is the object canvas (vertical 3) |
