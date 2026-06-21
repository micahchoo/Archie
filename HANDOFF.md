# HANDOFF — Object-level Notes + citation system (studio + viewer)

_Last updated: 2026-06-21. Branch: `main`. Last push: `5d501a8` (Merge: Object-level Notes + rich citation rendering, ADR-0018)._

## State right now

**Shipped + pushed (`83b7b25` → `5d501a8`):** the whole Object-level Notes + rich citation feature — render-core
WADM/`archie:wholeObject` model + read/write seam, viewer cite-cards/CiteCard/ProseCites + whole-track AV band,
studio cite-picker Search/Browse merge, Scope-control convert affordance, dogfood seeds. 668 render-core / 39 viewer tests.

**Uncommitted on `main` (7 files, all verified green — READY TO COMMIT):**
- `packages/render-mount/src/frame-overlay.ts` — whole-object frame now an **OSD overlay anchored to the image
  bounds** (`viewer.addOverlay({element, location: world.getItemAt(0).getBounds()})`), so it tracks the object
  through pan/zoom instead of sticking to the viewport edge. Restyled to a quiet thin border (halo + 1.5px colour
  line, `non-scaling-stroke`, click-to-select); corner L-brackets removed.
- `packages/render-mount/src/mount.ts` — `createFrameOverlay(viewer)` (was `(host)`).
- `apps/studio/src/App.svelte` — studio canvas frame derives (`studioFrame`/`canvasAnnotations`, mirrors viewer
  `frameFor`) passed to CanvasComp; **co-located note cycler** (`bboxIoU >= 0.5` → `coLocated`, `cycleCoLocated`);
  Scope wiring (`setNoteScope`, `createWholeObjectNote`, onCreate retarget branch).
- `apps/studio/src/NoteEditor.svelte` — Scope field (region↔whole-object convert + Redraw/Draw region) + stack-nav
  ("‹ N of M here ›") for co-located notes.
- `packages/render-mount/src/fitbounds.ts` + `fitbounds.test.ts` + `gate.test.ts` — **fitBounds auto-zoom cap
  REVERTED** (see below). Back to the bare-oracle fit. 44 render-mount tests green.

Verified this session: render-mount **44 tests green**, studio build **green (4.07s)**.

## ⚠ The fitBounds 50% cap — tried, reverted, DEFERRED

User asked: "an auto-zoomed annotation should not fill more than 50% of the viewport." First attempt added
`padForContext` (expand the fit rect ×2 about its centre) at the shared `applyFitBounds` dispatch. **This broke
fitBounds — "does not work at all."** Root cause: expanding the rect zooms *out*, but OSD's viewport constraints
(`visibilityRatio` / `constrainDuringPan`) refuse to show area past the image edge; for any non-tiny annotation the
doubled rect spills past the image, OSD clamps it, and the view barely moves. **Rect-expansion fights OSD's own
constraints — wrong mechanism.**

Reverted fully (removed `padForContext`/`CONTEXT_DIVISOR`, restored the 6 characterization assertions to the bare
oracle). The correct reimplementation is a **max-zoom ceiling**, not a rect expansion, and is only verifiable in a
live OSD (headless can't confirm). If revisited: after `viewport.fitBounds(...)`, cap the resulting zoom so the
annotation's on-screen size ≤ 50% — and test against OSD's constraint settings, not a mock. Live path is
`MountSurface.fitBounds(id)` → `dispatchFitBounds` → `applyFitBounds` (mount.ts ~285, image branch).

## Open items (not blocking)
- **[SNAG] cite-degradation seed:** the 3 Voynich exhibits share one RNG seed → `voynich`/`voynich-reading` mint
  identical logicalIds → `buildLinkIndex` first-seen-wins → cites to `voynich-reading`/`voynich-rosettes` degrade.
  Preferred fix: validate non-note cites against the exhibit-slug set, not the note index. NOT fixed.
- Dead `requestVisualCite` / MediaPicker cite path in App.svelte (★ unused — candidate for deletion).
- Deferred build-time OffscreenCanvas crops for local objects + CiteCard `data-crop` publish step.
- Pre-existing CmdK a11y warnings.

## Next session
1. Commit the 7-file batch (frame anchoring+restyle, co-located cycler, fitBounds revert). User chose
   "Everything in the working tree" last time — confirm scope before committing (commit-only-when-asked).
2. If the 50% cap is still wanted: implement as a post-fitBounds max-zoom ceiling, verify in the packaged app.
