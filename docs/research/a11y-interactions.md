# Keyboard equivalents and colour-independent coding — recommendations

Research for `Archie-d90f` (W24: drag-first interactions have no keyboard path; W25:
readings are colour-coded only). Covers the four surfaces named in the ticket. Each
section: the pattern, the concrete interaction spec, the WCAG criteria it satisfies,
and sources. Decision-ready, not encyclopedic — pick from these, don't re-derive them.

## What's already decided, so this doc doesn't re-litigate it

- **Archie-a9fc** (Overview canvas-mode decision) already named the list as *"the
  structured home for future keyboard reorder (a11y ticket)"* — that a11y ticket is
  this one. Canvas stays mouse/touch-primary; keyboard reorder ships in list mode only.
- **Archie-5e96** (editor scope/nav decision) already fixed the filmstrip rail's
  keyboard face to `[` / `]` prev/next. Nothing new needed there — noted for
  completeness, not re-specified.

## 1. Overview list — keyboard reorder (replaces plate/row drag)

**Current code:** `apps/studio/src/ExhibitOverview.svelte` list mode renders `<li>`
rows, each with a `⠿` grip button (`draggable`, HTML5 DnD), an open button, a
`✎` edit button, and (in select-mode) a checkbox (`ExhibitOverview.svelte:450-465`).
Canvas mode plate-drags the same reorder via `onreorder(orderedIds)`.

**Recommended pattern:** rows-with-interactive-children map to the **WAI-ARIA APG
Grid pattern**, not Listbox — the Listbox pattern's own docs rule this out: *"the
interaction model conveyed by the listbox role to assistive technologies does not
support interacting with elements inside of an option... To present a list of
interactive elements, see the Grid Pattern."* [WAI-ARIA APG Listbox — About This
Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) Give the `<ul class="list">`
`role="grid"`, each `<li>` `role="row"`, and its grip/thumb+label/edit-button spans
`role="gridcell"`. One row is in the page tab sequence at a time (roving tabindex);
arrow keys move focus between rows without leaving the grid.

**Reorder — "move mode" grammar** (space/enter lifts, arrows move, space/enter drops,
escape cancels). This is the canonical shape used by both the APG's own rearrangeable
listbox example and `dnd-kit`'s keyboard sensor — same grammar, independent sources:

- **APG:** ["Example Listboxes with Rearrangeable
  Options"](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/)
  — single- and multi-select listboxes with a toolbar to add/move/remove options.
- **dnd-kit** (default screen-reader instructions, verbatim — good starting copy):
  *"To pick up a draggable item, press space or enter. While dragging, use the arrow
  keys to move the item in any given direction. Press space or enter again to drop the
  item in its new position, or press escape to cancel."* [dnd-kit — Accessibility:
  Screen reader instructions](https://docs.dndkit.com/guides/accessibility)

**Concrete spec for the grip button (`role="button"`, `aria-roledescription="reorder handle"`):**
| Key | Action |
|---|---|
| `Space` / `Enter` (grip focused, not lifted) | Lift the row — enters move mode |
| `↑` / `↓` (move mode) | Move the row one position; live region announces new position |
| `Home` / `End` (move mode) | Move to first / last position |
| `Space` / `Enter` (move mode) | Drop — commits `onreorder`, exits move mode |
| `Escape` (move mode) | Cancel — restores original order, exits move mode |

**Live-region announcement grammar** (one `aria-live="polite"` region, reused —
`ExhibitOverview.svelte` already has this idiom at `.sel-count` and `.pct`):
- Lift: `"Picked up {label}, position {i} of {n}."`
- Each move: `"Moved to position {i} of {n}."`
- Drop: `"Dropped {label} at position {i} of {n}."`
- Cancel: `"Reorder cancelled. {label} is back at position {i} of {n}."`

Position-based (not drop-target-id-based) because the row's own `orderIndexOf` /
`{(orderIndexOf.get(o.id) ?? 0) + 1}` badge already computes this exact number
(`ExhibitOverview.svelte:388,457`) — reuse it, don't invent new state. This also
mirrors how a grid/listbox naturally exposes `aria-posinset`/`aria-setsize` to screen
readers, so the spoken position matches what's already programmatically true.
**Satisfies:** WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value (posinset/setsize),
2.4.3 Focus Order.

**Multi-select without marquee** (canvas-mode marquee has no keyboard equivalent):
adopt the APG Grid pattern's row multi-select keys directly — same source as above:

| Key | Action |
|---|---|
| `Shift+↓` / `Shift+↑` | Extend selection to the next/previous row |
| `Shift+Home` / `Shift+End` | Extend selection to first/last row |
| `Ctrl+A` | Select all rows |
| `Space` (on a row, no Shift) | Toggle that row's selection without moving focus |

[WAI-ARIA APG Grid — Layout Grids Keyboard
Interaction](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) (`Shift+Arrow` extends,
`Ctrl+A` selects all, bare `Space` toggles — the note explicitly calls this the
"commonly used" convention for cell/row selection in a layout grid). This composes
cleanly with the existing `selection: Set<string>` / `onselect(id, mods)` contract —
`Shift` and bare-`Space` are just new `ClickMods` variants alongside the existing
click-based ones. **Satisfies:** WCAG 2.1.1 Keyboard.

## 2. Editor filmstrip rail — object nav

Already decided in Archie-5e96: rail is the one nav scheme, `[`/`]` is its keyboard
face. No new research needed. For completeness, the rail should still expose
`aria-current="true"` on the focused/current object thumbnail and roving tabindex —
same mechanics as the grid above, not a new pattern (APG Grid, "Layout Grid Examples":
thumbnail-rail-shaped layout grids are explicitly one of the three worked examples).

## 3. Readings — colour-independent identification

**Current code:** `apps/studio/src/App.svelte` computes on-canvas marker style purely
from `reading.colour` (`readingMarkerStyle(colour, ...)`, `App.svelte:962-976`) — the
canvas dot/region has no non-colour differentiator. Two places already do better and
should be the model, not the gap: `ReadingLegend.svelte:38-39` pairs every swatch with
the reading's name text in a `role="radiogroup"`, and the notes-panel `.layer` chip
(`App.svelte:1833`) pairs a colour border with the reading name. **The gap is
specifically the on-canvas marker itself** — once drawn, it carries only colour.

**WCAG 1.4.1 Use of Color (Level A):** *"Color is not used as the only visual means of
conveying information... Use information in addition to color, such as shape or
text."* [Understanding SC 1.4.1](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html)
Two of its own worked examples are directly on-point for a legend-driven system like
readings:
- *Required-field form:* colour **and** an icon next to the label.
- *Chemistry diagram:* colour **and** a number next to each element, with a legend
  mapping both — "sighted users who cannot perceive all the color differences can
  still understand the image by relying on the numbers."

**Recommended pattern — combine both, cheaply, on existing surfaces:**
1. **Marker stroke pattern per reading** (solid / dashed / dotted / dash-dot, cycling
   before repeating): add a `dash` field to `readingMarkerStyle`'s output alongside
   `colour`, keyed off reading index — no new authoring UI, derives from the same
   array order the legend already iterates (`readings as r (r.id)`,
   `ReadingLegend.svelte:37`).
2. **Numbered badge**, same index, shown in the legend swatch (`ReadingLegend.svelte:38`,
   e.g. `① General` / `② {name}`) and optionally as a tiny corner glyph on the marker
   itself — the WCAG chemistry example's exact shape (colour + number + legend).
   Cheaper to ship than a full shape-per-marker system and scales past 4-5 readings,
   where distinct dash patterns alone stop being visually distinguishable.
3. Keep the legend's colour+name pairing and the notes-panel colour+name chip exactly
   as they are — they already satisfy 1.4.1; don't touch them.

**Satisfies:** WCAG 1.4.1 Use of Color (Level A); Technique
[G182](https://www.w3.org/WAI/WCAG21/Techniques/general/G182) (additional visual cues
alongside colour) is the specific sufficient technique this maps to.

## 4. Note markers on the deep-zoom canvas — selection/traversal without a pointer

**Why this is the hard one:** Annotorious 3 renders marks to a WebGL canvas via
PixiJS (confirmed locally — `ISSUES.md:453`, `.seeds/issues.jsonl` #74: "Annotorious 3
renders marks to WebGL canvas"). A WebGL canvas has no DOM nodes for a screen reader to
find — there is no marker-level ARIA to add, full stop. This matches what the repo's
own prior-art survey already concluded:

> *"No repo exposes a drawn Region or its viewport position to a screen reader...
> annotorious uses `role="application"`, which suppresses SR browse mode... A blind
> user cannot perceive 'where' a region is. **Pure greenfield.**"*
> — `.scratch/Prior Art/12-accessibility.md` (local; surveyed OpenSeadragon, Mirador,
> Annotorious, immarkus, clover-iiif, universalviewer, field-studio)

So: don't try to make the WebGL markers themselves focusable (`role="application"` is
the annotorious anti-pattern the survey already flags — it hides content from SR
browse mode rather than describing it). Instead, **traversal and selection happen
through a DOM-based list that's already 90% there**: the notes panel's present-notes
`<ul>` (`App.svelte:1817-1832`) already lists every note on the current object, in the
same order they'd be encountered on canvas, each as a `<button>` that sets `selected`
— which is exactly what drives the canvas highlight. It just isn't wired for roving
keyboard nav or announced position yet.

**Recommended pattern:** treat the notes list as the accessible parallel structure —
study, don't reinvent:
- **Mirador's `ThumbnailNavigation.jsx`** roving `ArrowRight`/`ArrowLeft` keyboard nav
  over a thumbnail list is the closest transferable *decision* (React/MUI code doesn't
  port, the role/keying choice does) — `.scratch/Prior Art/12-accessibility.md` §mirador.
- Add `role="listbox"` to the notes `<ul>`, `role="option"` + `aria-selected` to each
  `<li>` (this list has no nested interactive elements once the button *is* the row,
  so Listbox — not Grid — applies here, unlike the overview rows).
- `↑`/`↓` roves focus and moves `selected` together (single-select listbox convention,
  [APG Listbox Keyboard
  Interaction](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)); selecting a note
  already re-anchors the canvas view to it (existing `selected` → focus/zoom wiring),
  so this one wire gives both DOM-level *and* canvas-level traversal for free.
- Live-announce `aria-live="polite"`: `"{comment or "(untitled)"}, note {i} of {n}
  {reading name or "General"}."` — reuses the numbered-badge index from §3 so the
  same number identifies a reading in the legend, on the marker, and in the
  announcement.
- **OSD's own keyboard layer stays as-is and composes underneath this**, it's already
  shipped and free: canvas is focusable, `onCanvasKeyDown` gives arrow-pan / `+`/`-`
  zoom / `0` home natively (`.scratch/Prior Art/12-accessibility.md` §OpenSeadragon,
  citing `openseadragon.js:10785,8141,3635`) — this is pan/zoom of the *viewport*, a
  separate concern from marker traversal, and needs no new work, just documenting in
  the shortcuts sheet.

**Satisfies:** WCAG 2.1.1 Keyboard (marker selection reachable without a pointer),
1.3.1 Info and Relationships (list structure carries the same order as the visual
scatter), 4.1.2 Name/Role/Value. Creating a *new* note by keyboard (drawing a region
without a pointer) is explicitly out of scope here — flagged as the same open
greenfield gap the local survey names ("alt-text as WADM body" / region-drawing has no
prior art anywhere surveyed); worth its own ticket, not bundled into this one.

## What the 11 standing svelte-check a11y warnings do and don't cover

Ran `pnpm --filter @archie/studio run check` — still exactly 11 warnings, 4 files,
unchanged from the rule's baseline. All 11 are `a11y_interactive_supports_focus` /
`a11y_click_events_have_key_events` / `a11y_no_static_element_interactions` on **modal
dialog chrome** (`AddMapModal.svelte`, `ShortcutsHelp.svelte`, `TutorialModal.svelte`,
`CmdK.svelte` — dialog role missing tabindex, or a click handler without a matching
key handler). **None of the 11 touch drag-reorder, marquee select, or colour-only
coding** — svelte-check's a11y lint is a static-analysis rule set (missing
role/tabindex/key-handler pairs on elements); it has no way to detect "this
interaction has no keyboard path at all" or "this distinction is colour-only" because
both require judging the *interaction model*, not a single element's attributes. This
ticket's four recommendations are exactly the class of gap the lint layer structurally
cannot catch — closing them is manual/design work, and once shipped there's no
regression gate for them the way there is for the modal warnings. Worth a follow-up
note in the a11y rule file if that gate is wanted later (e.g. a targeted
Playwright-axe check per interactive surface), but out of scope for this ticket.

## Prioritized adoption order

1. **Overview list keyboard reorder + multi-select** (§1) — the ticket's core ask,
   already has a named home (Archie-a9fc), highest-traffic surface (every exhibit
   with >1 object), and the grid/move-mode pattern is the most load-bearing precedent
   (two independent sources agree on the same key grammar).
2. **Note markers via the notes-list roving nav** (§4) — closes the other drag-first
   gap (canvas marker selection), and is cheap because the DOM list already exists and
   already drives `selected`; mostly wiring, not new UI.
3. **Readings colour-independent coding** (§3) — the numbered-badge step is cheap and
   ships with #1/#2's work anyway (same index touches legend, marker, and
   announcements); the dash-pattern step is a nice-to-have, do it if #1/#2 already
   touch `readingMarkerStyle`.
4. **Filmstrip `aria-current` + roving tabindex polish** (§2) — no new pattern
   decision needed, just apply the same grid mechanics as §1; lowest priority because
   the nav *keys* are already decided and working, this is pure SR-semantics polish.

## Resolution paragraph (for Archie-d90f)

Resolved: keyboard reorder in the overview list adopts the WAI-ARIA APG Grid pattern
(rows contain interactive children, so Listbox doesn't apply) with a move-mode grammar
— space/enter lifts, arrows move, space/enter drops, escape cancels, live-announced by
position (`orderIndexOf`-derived, matching the existing on-plate order badge) — the
same grammar independently used by the APG's own rearrangeable-listbox example and
dnd-kit's keyboard sensor. Marquee multi-select gets a keyboard equivalent via the
Grid pattern's row-selection keys (Shift+Arrow extends, Ctrl+A selects all, bare Space
toggles). Canvas-mode plate drag and the filmstrip's `[`/`]` nav are unchanged — both
already decided elsewhere (Archie-a9fc, Archie-5e96). Note markers get keyboard
traversal not by making the WebGL/PixiJS canvas layer focusable (confirmed
architecturally impossible — no DOM nodes exist per-marker, and Annotorious's own
`role="application"` pattern actively suppresses SR browse mode, per this repo's prior
Annotorious survey) but by promoting the existing notes-panel list to a proper
`role="listbox"` with roving arrow-key nav, live position announcements, and its
existing `selected` wiring already round-tripping to the canvas highlight. Readings
move off colour-only identification by adding a shared numbered index across the
legend, the on-canvas marker, and announcement text (WCAG 1.4.1's own worked example
for exactly this — colour-coded diagram + numbers + legend), plus an optional
per-reading dash pattern on the marker stroke itself. Confirmed via `svelte-check` that
none of studio's 11 standing a11y warnings overlap this work — they're all modal-dialog
focus/keyboard-handler gaps, orthogonal to the four surfaces above — so this closes
clean with no risk of masking an unrelated regression. Full spec, key tables, and
citations: `docs/research/a11y-interactions.md`.
