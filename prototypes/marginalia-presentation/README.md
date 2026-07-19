# Marginalia presentation — three throwaway prototypes (Archie-f411)

**Throwaway.** Self-contained HTML, no build step — open any file with `file://`.
None of this is production code; it exists to be reacted to.

## The question

Archie can already anchor a note to a region of an image and *place* it in a margin
column beside that region — the engine survives, headless-tested and inert
(`render-core` `layoutMarginalia`, mount `markerScreenRects`, Canvas `rectIds`/
`onmarkerrects`, `render-svelte` `MarginColumn.svelte`). What was reverted on
2026-06-11 was the **presentation**: full note cards floating in the margin,
collision-stacked, with connector lines. The review verdict was blunt —
*"does not look good"* (`App.svelte:912`, ISSUES.md Direction 7). The app fell back
to the classic list + popover.

So the open question is **not** *can we place notes in the margin* — the solver does
that. It's: **what should margin-anchored notes look like so they beat the list+popover
the app reverted to?** These three prototypes are three genuinely different bets on
that, not one idea at three polish levels. Each uses the same fixture (one folio, six
notes of varying length, **two overlapping anchors** at y=0.44 / 0.47) and each handles
the four things that break a margin: **overflow** (more notes than vertical room),
**overlap** (anchors closer than a card is tall), **selection emphasis**, and a
**narrow-viewport fallback**.

## Prior art consulted

- **Google Docs / MS Word comment margin** — collision-avoiding stacked cards in the
  right margin, a connector to the anchored span, the active comment expands and
  displaces its neighbours. This is the direct lineage of `layoutMarginalia` (forward
  pass + backward relax + pinned focus item) and of the reverted UI. → Direction A.
- **Hypothes.is** — the sidebar collapses off-screen annotations into edge "buckets"
  (tick clusters on the viewport rim you hover to reveal); the page stays the focus. →
  Direction B.
- **Medium inline margin bubbles** — a small counted bubble in the margin that expands
  on demand, aggregating multiple notes on one line. → Direction C.
- **Sibling annotators in the repo's Prior Art**: `annomea`/`anvil`
  `AccordionAnnotationRow.svelte` is a selection-synced **accordion list** (one open at
  a time) — i.e. the list+popover shape the app *reverted to*; `tropy` keeps notes in a
  side **panel**, not a margin. Neither attempts spatial correspondence — that's the gap
  these prototypes probe.

---

## Direction A — Connector margin cards  (`a-connector-cards.html`)

The reverted lineage, refined: full cards in the margin, quieter, connector only on
attention, compact-until-selected.

```
 ┌───────────────────────────┐ ┌─────────────────────┐
 │ ▒▒▒▒ ▒▒▒▒▒▒ ▒▒▒            │ │ ┌─────────────────┐ │
 │ ▒▒▒▒▒▒ ▒▒▒                 │ │ │ A later hand …  │ │
 │ ░░░[region n1]░░░ ─────────┼─┼─┤ gloss · 15c     │ │
 │ ▒▒▒▒ ▒▒▒▒▒▒                │ │ └─────────────────┘ │
 │ ░░░[n3]░░░  ← overlap ─────┼╮│ ┌─────────────────┐ │
 │ ░░░[n4]░░░  ← pair         │╰┼─┤ Overlapping ①…  │ │  cord only to
 │ ▒▒▒▒▒▒                     │ │ └─────────────────┘ │  the attended card
 │ ▒▒▒▒ ▒▒▒▒                  │ │ ┌─────────────────┐ │
 │                           │ │ │ Overlapping ②…  │ │  (n3/n4 anchors
 └───────────────────────────┘ │ └─────────────────┘ │   collide → stacked,
                                │  ↓ 2 below          │   not evicted)
                                └─────────────────────┘
```

- **Overflow:** cards that can't fit collapse to `↑ N above` / `↓ N below` gutter chips
  (click to jump). Use the *Shrink column* button to force it.
- **Overlap:** the two near anchors resolve through the ported solver's forward-pass +
  backward-relax; the selected one pins (never self-evicts).
- **Selection:** pins the card, expands it to full text, draws the cord, lights the region.
- **Narrow (<760px):** margin drops below the image as a plain card drawer; cords hidden.
- **Bet:** *every note legible in place, and its vertical position tells you which region.*
  Maximum information, always on screen.

## Direction B — Collapsed tick rail  (`b-tick-rail.html`)

A near-invisible margin: just marks. One card, only when you reach for it.

```
 ┌───────────────────────────┐ ┬  ← rail is ~34px
 │ ▒▒▒▒ ▒▒▒▒▒▒                │ ▲2   off-screen bucket
 │ ░░[n1]░░                   │ ─    tick (width = length)
 │ ▒▒▒▒▒▒                     │ ──
 │              ┌───────────┐ │
 │ ░░[n3]░░ ◄───┤Overlapping│ │ ═    ← selected tick (fat)
 │ ░░[n4]░░     │① root …   │ │ ─    (n3/n4 ticks nudge
 │              └───────────┘ │ ─      apart 8px — points
 │ ▒▒▒▒ ▒▒▒▒                  │ ─      don't fight for room)
 │                           │ ▼1   off-screen bucket
 └───────────────────────────┘ ┴
```

- **Overflow:** ticks are 1-D points — they never overflow the column; they nudge apart
  by a min-gap. Off-screen notes gather into `▲N` / `▼N` edge buckets. *Shrink height*
  pushes notes off-screen into the buckets.
- **Overlap:** the n3/n4 ticks separate by 8px and stay distinct; the on-demand card
  clamps into view.
- **Selection:** the tick fattens and colors; its single card stays open (pinned).
- **Narrow (<760px):** rail becomes a horizontal tick strip; the card becomes a bottom sheet.
- **Bet:** *the image is the hero.* The margin costs almost no visual weight until touched,
  and you only ever see one card — no floating column to look ragged.

## Direction C — Density-aware clustering  (`c-density-clusters.html`)

Near notes merge into one counted chip; a heat band shows where notes pile up.

```
 ┌───────────────────────────┐ ┌───────────────────┐
 │ ▒▒▒▒ ▒▒▒▒▒▒        heat▏   │ │ (1) A later hand… │
 │ ░░[n1]░░           ▏       │ │───────────────────│
 │ ▒▒▒▒▒▒             ▏       │ │ (1) The scribe …  │
 │ ░░[n3]░░  ← 2 notes ▉ dark │ │───────────────────│
 │ ░░[n4]░░    here    ▉ band │ │ (2) Overlapping ① │ ◄ click →
 │ ▒▒▒▒ ▒▒▒▒          ▏       │ │   • Overlapping ① │   expands
 │ ░░[n5]░░           ▏       │ │   • Overlapping ② │   the stack
 │ ░░[n6]░░           ▏       │ │───────────────────│
 └───────────────────────────┘ │ (1) Star diagram… │
                                └───────────────────┘
```

- **Overflow:** past a chip budget the tail folds into a `+ N more clusters` super-chip
  (click to tighten the merge); the margin never renders 40 loose cards. *Tighten
  clustering* merges more.
- **Overlap:** the n3/n4 pair is the headline case — it becomes one `(2)` chip you expand
  into a two-row stack.
- **Selection:** selecting a note opens its cluster, highlights the row, rings its heat band.
- **Narrow (<760px):** clusters become a horizontal chip row over a bottom sheet.
- **Bet:** *survive crowding and reveal concentration.* Where an exhibit has dozens of
  notes, aggregation is the only thing that scales, and the heat band turns note density
  into a reading signal about the image itself.

---

## What the revert evidence argues against

The revert killed **Direction A's family specifically**: always-visible full cards,
floating and collision-stacked, with connectors. The failure mode that reading suggests
is visual — a ragged column of variable-height cards that reflows as the canvas pans,
competing with the image for attention and never sitting still. Direction A here is the
*refined* form (quieter cards, cord only on attention, compact-until-selected), but it is
still the shape the user already looked at and rejected; shipping it again is betting the
problem was polish, not the premise.

**Directions B and C attack the premise instead of the polish.** B removes the floating
column entirely (the thing that looked bad) and keeps only marks + one card. C removes the
"one loose card per note" scaling problem and adds a reading signal (concentration) the
list+popover can't give.

## Recommendation

Lead with **B (tick rail)**, hold **C (clustering)** as the density hedge, and treat **A**
as the control the evidence argues against.

Reasoning grounded in the revert: the reverted verdict was *"does not look good,"* and the
concrete thing that looked bad is the always-on floating card column — variable heights,
constant reflow, a second visual center of gravity beside an image that should be the whole
point of an *image* annotator. B is the smallest possible departure that removes exactly
that object: the margin becomes marks, the canvas stays the hero, and the two properties
the list+popover lacks — spatial correspondence (a mark beside its region) and
zero-effort overview (glance the rail, see where notes are) — survive at almost no visual
cost. It also reuses the surviving engine most cheaply: ticks are just the anchor Ys the
`onmarkerrects` stream already emits, and the one-card popover is the pinned-item path the
solver already guarantees. C is the right answer once an exhibit gets crowded (the solver's
overflow gutters are a symptom that loose placement doesn't scale), so it's the hedge, not
the opener. A stays in the set only as the honest control — it's what "just make the
reverted thing prettier" looks like, and the point of showing it is to make the case for
*not* doing that.
