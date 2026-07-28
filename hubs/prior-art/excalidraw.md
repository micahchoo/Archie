---
updated: 2026-07-28
---
# excalidraw (`canvases-annotations-sharing/excalidraw`)
> *Where does excalidraw's inverse-entry undo actually live — is `store.ts:40-73` the right citation?*

Verified 2026-07-28 against `canvases-annotations-sharing/excalidraw/packages/excalidraw/` on disk.
**The survey's citation is wrong** (`store.ts:40-73` is a different thing) — corrected below.

## Verified claims (line-cited)
- `store.ts:40-73` is the `CaptureUpdateAction` enum (`IMMEDIATELY`/`NEVER`/`EVENTUALLY`) — it
  classifies *when* an update should be captured for undo. It is real and load-bearing, but it is
  **not** the inversion logic the survey's "inverse-entry undo" headline describes.
- The actual inversion lives in `history.ts:173-176` `HistoryEntry.inverse()`, which calls
  `this.appStateChange.inverse()` and `this.elementsChange.inverse()` — and `history.ts:48` is where
  a popped entry is pushed onto the *other* stack as `entry.inverse()` (the undo/redo swap).
- `change.ts:437-439` `AppStateChange.inverse()` swaps a delta's `inserted`/`deleted` sides
  (`Delta.create(this.delta.inserted, this.delta.deleted)`); `change.ts:984-999`
  `ElementsChange.inverse()` does the same per-element-id, and deliberately swaps `added`↔`removed`
  while keeping `updated` self-paired (`:999` comment: "notice we inverse removed with added not to
  break the invariants").

## Stated absences
- No "inverse"/"invert" identifier exists anywhere in `store.ts` — grepped directly, zero hits.

## What citations of it may NOT support
- Don't cite `store.ts:40-73` for the inversion mechanism — cite `history.ts:173-176` +
  `change.ts:437-439,984-999` instead. `store.ts` is a legitimate donor for the capture-classification
  half of undo design, not the inversion half.
