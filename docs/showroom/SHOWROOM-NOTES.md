# Showroom — extra ways to show off Archie

Per-row "extra feature" hints live inline in each CSV's `_showoff` column. This file holds the
**cross-cutting** showmanship — moves that span screens or work at the exhibit level.

## The showroom dogfoods itself (lead with this in the exhibit summary)

The showroom is built *out of* the features it documents — say so:
- **Built by CSV bulk-import** (the S10 contributor feature) — these 87 notes loaded from
  `csv/*.csv`, not hand-drawn one by one.
- **Is a narrative exhibit** (S5) — the tour spine is the very feature it's describing.
- **Uses readings as feature tracks** (S4) — `studio` / `viewer` / `embed` / `power`. A reader
  can filter the legend to take four different guided tours of the same screenshots.
- **Published via the publish flow** (S11) — the live showroom is itself a published static site,
  and can be **embedded** (E1) on the project's landing page. Archie demonstrating Archie.

## Things CSV can't carry — draw these few by hand

The importer covers comment/tags/reading/region. These need a manual touch in Studio:
- **Whole-object notes** (S3, V2) — set the wholeObject flag; shows the thin border behaviour.
- **Emphasis** (S3) — toggle strong/muted on one mark so a reader sees the visual weight change.
- **Geo extent** (S7) — lat/lng truth, not a pixel box; frame it on the map.
- **AV markers** (S6a/S6b) — regions are image-only; author audio/video moments in the editor.

## Capture dynamic states, not just static screens

The harness today grabs settled views. The features that *move* read better mid-action — add a
second capture for:
- `Saving…` save-status pill (S1) vs the resting `Saved`.
- Publish dialog `working` step (S11) vs idle.
- Collapsed / mid-drag sidebar (V2) to show the resizable divider.
- Hover-solo on a note (V2) and an active transcript line during playback (V4).

## Cross-cite the tour (uses the live-cite feature, S8 → V7)

Wire the sections together with real in-library cites so the tour links itself and every hover
pops a preview card: S3→S4 (readings), V2→V7 (expand sheet), S8→V7 (hovercard), S5→V3 (narrative
authored → narrative read). The cites are both navigation AND a live demo of the cite feature.

## Invisible behaviour — caption, don't box

Mount/tile internals have no pixels of their own. Rather than an awkward box over blank canvas,
let them ride as `power`-reading callouts (already tagged): zoom clamp (S3), remote deep-zoom
CORS+60s timeout (S10), DZI auto-detect + safe-skip of malformed selectors (E1), touch-scroll
isolation (V2), deep-link-lands-paused (V4). Toggling the `power` reading reveals "behind the
glass" — a nice reveal for a technical audience.

## Fixtures the harness will need

For the `(new)` viewer captures, the seed data must include: a **narrative** exhibit (V3), a
**multi-object AV** exhibit (V4 sibling nav), a note carrying **media** (V6), and an exhibit with
**multiple readings** (V7 legend). The Voynich/Bidar/AV seeds may already cover most; confirm a
narrative + a media-bearing note exist before the capture run.

## Coverage

42 user stories → 21 screens + power-reading callouts. Mapping: see
[`../plans/SHOWROOM-EXHIBIT-PLAN.md`](../plans/SHOWROOM-EXHIBIT-PLAN.md) coverage matrix.
