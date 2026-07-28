---
updated: 2026-07-27
---
# tropy
> *Does a corpus IIIF viewer ship its canvas chrome docked or overlaid — and did tropy choose?*

Tropy (photo-annotation tool) was cited in ADR-0019 as choosing docked-by-default. It was cited
backwards; the correction below is what actually ships. Source: `ledgers/REVIEW-canvas-chrome-dock-2026-07-26.md`.

## Verified claims (line-cited)
- `main/tropy.js:59` — `frameless: true` (only `frameless: false` is the print window, `:398`).
- `item/container.js:106` — `hasOverlayToolbar={this.hasOverlayToolbars}` passed EXPLICITLY (never
  falls to the `:11` default param).
- `item/container.js:43-46` — resolves to `settings.overlayToolbars && layout !== SIDE_BY_SIDE`.
- `reducers/settings.js:38` — `overlayToolbars: ARGS.frameless`; `:22` — `layout: STACKED`, so the
  SIDE_BY_SIDE exclusion never fires.
- `_esper.scss:179-184` — `.esper.overlay-mode :is(&) { position:absolute; left:0; top:0; width:100% }`
  vs `flex: 0 0 auto` in the non-overlay branch: a real structural row-vs-overlay switch.
- `_toolbar.scss:139-150` — solves the contrast cost of overlaying with a blurred plate + auto-hide.

**Net: tropy ships overlay toolbars ON by default**, and had the same row-vs-overlay choice Archie
faced — it picked overlay.

- **EDTF fuzzy-date parse/format** (verified 2026-07-27, source: local clone) — `src/format.js:1`
  imports `edtf`/`format as edtfFormat` from the `edtf` npm package; `:11` `edtf(value)` parses,
  `:17` `edtfFormat(date, ARGS.locale, options)` formats — the only corpus source treating fuzzy
  scholarly dates as first-class. Confirmed PURE (wraps the external `edtf` lib, no tropy-specific
  coupling in this function).
- **Undo/redo is in-memory only, never persisted** (verified 2026-07-27, source: local clone) —
  `src/selectors/history.js:3-13` reads `state.history.past`/`.future`; the paired reducer
  `src/reducers/history.js:8-33` mutates only a `{ past: [], future: [] }` object via
  `HISTORY.UNDO`/`REDO`/`TICK` — no `db`/`localStorage`/write call anywhere in that reducer. Load-
  bearing for the negative claim behind ADR-0026: tropy's history is session command-history, not
  document versioning, and does not survive reload/export.
- **ALTO OCR ingest, no OCR engine** (verified 2026-07-27, source: local clone) —
  `src/commands/transcription/create.js:2` imports `Document` from `alto-xml`; `:28`
  `text = Document.parse(data).toPlainText()`. `grep -rli tesseract src/` and `grep -rli "ocr.*engine"
  src/` are both empty — tropy ingests ALTO XML produced by an external engine/plugin; it never runs
  OCR/HTR itself.

## Stated absences
- None recorded — every trace here resolved to a positive default (overlay), not an absence.

## What citations of it may NOT support
- `container.js:11`'s `hasOverlayToolbar = false` is a **default-parameter fallback that is never
  reached** (the prop is always passed explicitly). Citing that line alone for "tropy makes overlay
  opt-in" is the exact "grep where it's DEFINED, not where it's USED" failure —
  [[prior-art-citation-discipline]]. Cite the full chain above, or don't cite tropy for opt-in overlay.
