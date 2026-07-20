# UX critique — Exhibit Overview (2026-07-19)

Sources: wireframes on tldraw board `Archie` (5 screens: grid / list / select-tray /
details drawer / empty), two live screenshots of the "Artifacts" exhibit (52 media
items, multi-tab READ-ONLY state, ⚠ Retry save), `ExhibitOverview.svelte` +
`App.svelte` seams, and the prior audit `UX-AUDIT-studio-wireframes.md` (W1–W25).
Findings are numbered O1… to avoid colliding with W-numbers; where one extends a
W-item it says so.

## What has visibly improved since the W-audit

- **W10 resolved** — bulk remove no longer morphs the sort toolbar; it lives in a
  bottom selection tray with a two-step armed confirm (Archie-315e).
- **W12 improved** — the density slider became two buttons (Comfortable/Compact),
  though it still holds permanent toolbar space (see O10).
- **W9 decision holding** — plates lay out *in* reading order, drag is a real
  reorder, and reorder is disabled (with an explanatory hint) under search/sort.
  The zoom-cluster/legend chrome is gone; the grid is a plain scroll.
- **W3 resolved** — one grammar for details everywhere: ✎ + the same PropsDrawer.

## What's genuinely strong

- Reading-order-first mental model: numbered plates, drag affordance, and honest
  hints about *why* reorder is off when a search or non-order sort is active.
- Progressive disclosure: toolbar and narrative strip don't render at 0 items;
  density controls exist only in the mode they affect.
- Safety grammar: two-step destructive actions, aria-live counts, keyboard
  move-mode with SR announcements, per-exhibit scroll restoration.

## New findings

- **O1 — Read-only mode never reaches the affordances.** `writerLock.canWrite`
  gates writes at the store (`App.svelte` `setWriterGate`), but the read-only tab
  still shows live drag hints ("DRAG A MEDIA ITEM TO SET THE READING ORDER"),
  ＋ Add media, ＋ Start the narrative, Select, and armed Removes. The banner says
  changes "won't be kept" while the whole screen invites making them — a user can
  invest real work into a void the store will refuse. *(Visibility of system
  status; error prevention.)* Direction: derive an `inert`/muted state for every
  mutating affordance from the same gate, and swap the drag hints for "read-only —
  take over editing to reorder".
- **O2 — "⚠ Retry save" contradicts the READ-ONLY banner beside it.** SafetyState
  (mounted app-wide, Archie-c76d) offers a red retry CTA in a tab whose writes are
  refused by design; the save-health system and the writer-lock system don't know
  about each other in the header. Retry cannot succeed here — the honest state is
  "read-only; this tab doesn't save". *(Status clarity — same family as W19.)*
- **O3 — The caption row carries near-zero information at scale.** All 52 cards
  read `BHC006_GM… / 0 NOTES`. End-truncation amputates the only distinguishing
  part of a filename title (the suffix: …07a, …07b, …08a) — middle-ellipsis is a
  cheap fix. "0 NOTES" repeated 52× is noise; render the count only when > 0.
  "Search titles" inherits the weakness: with filename titles, every query prefix
  matches everything or nothing. *(Signal-to-noise.)*
- **O4 — The narrative invite splits label from action across the full viewport.**
  Explanation far left, the lone saturated-green CTA far right — ~1400 px of
  nothing between them at desktop width. W11's resolution (invite here, author on
  canvas) is right; the *placement* breaks proximity. Group them.
- **O5 — List mode doesn't earn its viewport.** Rows occupy a ~600 px left column;
  the right half is empty except the drag hint floating in the void, detached from
  the rows it describes. As data, each row shows exactly what a grid card shows,
  minus the thumbnail size. A list view justifies itself with columns the grid
  can't afford — date added, media kind, dimensions/duration, which narrative
  sections reference the item. Give it that job or fold it (the "cost of two
  modes" from the W9 correction still stands). *(Match to task.)*
- **O6 — No wayfinding at 52 items.** Order chips are tiny corner labels; finding
  item 34 means reading chips one by one. No jump-to-number, no scrubber, no
  sticky "you are at item N" during scroll. Also a small status lie: the eyebrow
  permanently says "READING ORDER" even while the sort dropdown says Name.
  *(Recognition; status honesty.)*
- **O7 — The primary growth action sinks below the fold.** ＋ Add media is
  positionally last — after item 52 it's a scroll away in grid and invisible in
  the list screenshot. Correct in the empty state, buried at scale. A persistent
  add in the toolbar (or header) should accompany the trailing plate.
- **O8 — One micro-typography for every voice.** Eyebrow, hints, strip labels, and
  captions are all the same small grey caps: an *instruction* ("DRAG A MEDIA
  ITEM…") is typographically identical to *metadata* ("EXHIBIT NARRATIVE").
  Instructions styled as labels don't get read. *(Hierarchy.)*
- **O9 — ✎ targets are sub-minimum and, in list mode, orphaned.** ~20 px corner
  pencils inside plates; outside the row capsule in list mode, where the pencil
  floats unassociated with its row. Extends the W24 a11y cross-cut (44 px minimum
  target; grouping).
- **O10 — Ambient green wash reads as meaning.** In the 52-item screenshot a green
  radial glow tints the central cards; nothing in `ExhibitOverview.svelte` assigns
  it semantics (likely theme background). Tinted cards next to untinted ones read
  as selection/freshness state that doesn't exist. Decorative gradients shouldn't
  pass through content cards. *(No false signifiers.)*

## Resolution (2026-07-19, same day)

Fixed on `main` via two reviewed territory branches (`ux/shell-readonly-safety` merged
`42c0bc2`, `ux/overview-o-fixes` merged `cd083aa`, polish `style(studio)` follow-up):

- **O1 ✓** — `canWriteNow` derived in App gates every mutating affordance (drag/keyboard
  reorder via the reorder-message channel, adds, narrative start, select entry, tray
  Remove, keyboard ⌫⌫ bulk delete — the last found ungated by review), plus DetailsEditor
  `readonly` mode (fieldset-disabled) on the exhibit AND object drawers.
- **O2 ✓** — SafetyState shows a calm "Read-only" trumping all save-health states;
  refusal no longer leaks into LibraryHome's red alert; `becomeWriter()` clears the
  stale read-only refusal so no false "⚠ Retry save" after take-over.
- **O3 ✓** — width-adaptive two-span mid-truncation in grid captions (tail always
  painted; verified in real Chromium at both densities), `midEllipsis(40)` in list rows,
  zero note counts suppressed. Full title in `title=`; accname carries the full label.
- **O4 ✓** — narrative invite text and CTA grouped (dropped margin-left:auto).
- **O5 — open** (design decision): list mode still shows grid-card data in half the
  viewport; either gets metadata columns (date, kind, duration, referencing sections)
  or gets folded. Needs a decision, not a patch.
- **O6 ~** — eyebrow now reflects the active sort ("sorted by name" / "sorted by
  recently annotated"). Jump-to-order wayfinding at 50+ items still open (feature).
- **O7 ✓** — persistent "＋ Add media" toolbar chip, both modes; trailing plate kept
  as END drop target.
- **O8 ✓** — instruction hints restyled to sentence-case body voice; labels keep caps.
- **O9 ✓** — 44px hit areas on pencils/grips via ::after overlays (no target overlap,
  verified); list pencil visually inside the row capsule, ARIA grid untouched.
- **O10 ✓** — `.grid-scroll` no longer paints the raw focal-bloom gradient; content
  area uniform.

Known accepted trade-offs: disabled drawer fields aren't copyable in a read-only tab
(fieldset vs per-input readonly — `<select>` has no readonly); accname may insert a
space at the head/tail span boundary on some SR pairs (name stays complete and unique).

## If I could fix only three

1. **O1 + O2** — make read-only propagate: one derived gate muting every mutating
   affordance, and a SafetyState that yields to the writer lock. This is the only
   finding where the UI actively misleads about whether work is being kept.
2. **O3** — middle-ellipsis titles + suppress zero counts: two tiny changes that
   fix legibility of every large exhibit.
3. **O7 + O6** — persistent Add media + jump-to-order affordance: the two scale
   pains that grow linearly with exhibit size.
