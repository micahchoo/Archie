# Editor chrome prototype

Throwaway HTML/CSS/JS mockup of Archie Studio's redesigned annotation-editor chrome. No build
step — open `index.html` directly in a browser. Sample data ("Herbal quires" exhibit, 6 objects,
one audio object) is hardcoded in `app.js`; nothing here talks to the real app or `sd`.

## Decided contracts this embodies

Four `sd` tickets closed the open questions this prototype is built to answer. Read them with
`sd show Archie-5e96 Archie-a9fc Archie-da38 Archie-0b7b`. What each one fixed, and where it
shows up here:

- **Archie-5e96** (editor scope + one nav scheme) — the left sidebar is two labeled, visually
  distinct zones: "Exhibit — Herbal quires" (Narrative) above "This object — {label}" (Readings,
  Notes, To place, Detail). Zone headers are `position: sticky` so the boundary holds while you
  scroll. The filmstrip rail is the *only* object-nav scheme — `[` / `]` drive the same rail, and
  the rail carries no `+Media`/`+Map` buttons and no toasts.
- **Archie-a9fc** (canvas stays primary, chrome trimmed) — the canvas is never obstructed by a
  floating panel in either variant; both readings placements and the status strip live outside
  it. (This prototype doesn't model the pan/zoom light-table interaction itself — that ticket's
  scope was the overview canvas, not the editor — but it's the reason the canvas here is treated
  as inviolable territory.)
- **Archie-da38** (narrative beats are deep links) — clicking a beat in the Narrative panel jumps
  the active object to that beat's target and flashes the beat row; the status strip announces
  the jump. No second authoring surface for narrative exists here — beats are read-only links, as
  decided.
- **Archie-0b7b** (one save vocabulary) — the header has exactly one save/status indicator
  (`#safetyState`, "Saved"), not a Save button plus a dirty dot plus a lock banner. It's a static
  placeholder here (no real persistence to model), but it occupies the one slot the real chrome
  would use.

## The two variants

Toggle with the **A / B** switch in the header (styled as a dashed-off "prototype controls"
segment — that switch itself is tooling for this comparison, not a proposed part of the shipped
header, which per Archie-5e96/0b7b stays: back, crumb, safety state, Publish, `?`).

**Variant A** — Readings lives as a compact panel inside the "This object" zone, above Notes. The
reading you're filing into is the pen icon; visibility/counts sit inline. Advantage: readings sit
next to the notes they file into, in the same reading flow as the sidebar. Cost: one more panel
in an already-stacked zone.

**Variant B** — Readings collapses to a header-level chip (color dots + "Readings") at the top of
the canvas area; clicking it opens a popover with the same rows. Advantage: readings stay near
the canvas where the colored markers are being read, and the sidebar is shorter. Cost: it's a
menu you have to open rather than a panel that's just there.

Both variants share the status strip (a slim bar between the rail and the canvas — this is where
mode messaging and toasts now live, per Archie-5e96's "rail sheds non-nav cargo") and the docked
note editor (right edge, fields: comment, tags, reading, emphasis, save/delete). Selecting a note
in the sidebar list *or* a marker on the canvas opens the same dock; "to place" notes open it too,
with an "Not yet placed" badge instead of a marker position.

## What works

- Rail click or `[` / `]` switches the active object; the "This object" zone re-labels; the
  canvas plate swaps (including to a waveform placeholder for the one audio object, folio 8r).
- The rail's collapse control shrinks thumbnails to ticks and back.
- Clicking a note/to-place row or a canvas marker populates the dock; Save/Delete mutate the
  in-memory sample data and re-render.
- The A/B switch swaps the readings placement instantly; the popover opens/closes and closes on
  outside click.
- Sidebar zone headers stay stuck to the top of their zone while the "This object" content
  scrolls underneath.

Verified with a scripted Puppeteer pass driving keyboard nav, rail collapse, note/marker
selection, and the variant toggle end to end — zero console errors, and the default view lands on
folio 2r with 4 notes / 1 to-place exactly as specified.

## Questions for you to react to

1. **Readings home, A vs B** — does readings belong in the sidebar next to what it labels (A), or
   near the canvas where the color-coded markers actually live (B)? Or does it depend on reading
   count (B fine for 2-3 readings, A better once there are many)?
2. **Rail default state** — should the filmstrip start expanded (as built) or collapsed by
   default, given it's now pure navigation and the canvas is the main event?
3. **Dock width** — is 320px enough for a comment field that might run to a paragraph plus tags
   plus two selects, or does the note editor want more room than the "stable right-edge element"
   framing implies, even at the cost of canvas width?
4. **"To place" — panel or fold-in** — it's a separate panel here mirroring Notes 1:1. Does an
   unplaced note actually need its own zone, or is a badge on a Notes row ("● unplaced") enough
   once the count is usually 0-1?
5. **Status strip when idle** — right now it always shows *something* ("Draw mode — filing into
   General notes") rather than going empty/blank between events. Is a permanent mode line useful
   chrome, or does it read as noise the rail's collapse control was supposed to remove?
