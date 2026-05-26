# ADR-0006: Editing happens at the locus; selector dimensionality matches the medium

## Status

Accepted (2026-05-26). Refines the editing-surface clause of CONTEXT §121; extends the
AV model of CONTEXT §82. Supersedes the bottom-of-sidebar WADM-form placement built in
Phase 2. Builds on ADR-0005 (narrative section model). Grilled via `/grill-with-docs`.

## Context

The Studio's first editing surface was a single scrolling sidebar: the notes list, then a
**detached WADM edit form at the bottom**. With many notes this is tiresome — you scroll
past the whole list to edit, and a newly-added note lands below the fold. Separately, the
just-shipped narrative **section cards edit in place**, so notes and sections already
disagreed on how editing works. And CONTEXT §82 modeled **all AV uniformly as temporal**
(`t=`), which cannot express video — a region on a *frame* over a *time window*.

## Decision

**1. Editing happens AT the annotation's locus, not in a detached form.** There is ONE
editing-form definition (comment / tags / layers / time + ⌘K cite). It **anchors to the
marker** for the author — an editable popover on the canvas — and **renders inline** for
the reader (annomea popup, already adopted, CONTEXT §79/§123). This *refines* CONTEXT §121
("zero new editing surfaces") to: **the editing form has one definition; it may anchor to
the marker (author) or render inline (reader).** The sidebar list survives as the
scannable **navigation index** — click → `fitBounds` (§83) → popover; draw → popover opens
at the new marker (which also makes *add* a draw→type gesture, killing the add-scroll pain).

**2. Notes vs Sections — point vs beat.** A **Note is a point**: its locus is the marker →
edit in the canvas popover. A **Section is a reading beat**: its locus is the reading
column → its prose is edited in the **sidebar narrative spine** (which mirrors the reader's
prose column) and gains the same ⌘K; its camera is still **framed on the canvas** (ADR-0005).
The asymmetry is principled — it mirrors how the reader renders each (markers vs prose spine).

**3. Selector dimensionality matches the medium's.**

| Medium | Dimensionality | Locus ("marker") | Selector | Draw surface |
|---|---|---|---|---|
| Image | 2-D spatial | xywh region | `xywh=…` | OSD + Annotorious rect |
| Audio | 1-D temporal | region on the waveform | `t=…` | **WaveSurfer regions** |
| Video | 2-D × 1-D **spatiotemporal** | frame region over a time window | **`xywh=…&t=…`** (combined W3C media fragment) | frame-box **+** timeline |

This extends CONTEXT §82 (AV-as-temporal-only) to a spatiotemporal **video** model. You
always edit at the locus; the locus's dimensionality is the medium's.

**4. The model is locked now; the build is staged.**
- **Wave 1** (the stated pains + audio): note popover + ⌘K · section prose in the spine + ⌘K · audio on WaveSurfer regions.
- **Wave 2** (video): the combined `xywh&t` selector in `@render/core` · a frame-draw-over-video surface · a timeline.
Each wave ships usable.

## Consequences

- Kills scroll-to-edit and scroll-to-add; add becomes draw→type at the marker.
- The popover MUST be mitigated: **offset** so it never covers its own marker; **draggable**;
  **dismiss-or-detach on pan/zoom** rather than chasing the marker pixel-for-pixel (§83 live
  re-anchor is the costly part).
- **Honest fallback (the overview's 1a/1b retreat pattern):** if marker re-anchoring proves
  too costly at build time, a **pinned sidebar inspector** (list scrolls, editor pinned and
  always visible) solves the same scroll pain without occlusion or re-anchor cost.
- New core work for Wave 2: parse/serialize the combined `xywh=&t=` fragment (today
  `parseTimeFragment` handles `t=` only; `rectSel` writes `xywh=` only).
- **WaveSurfer + its regions plugin** is the audio draw surface. Prior-art check done
  (`docs/plans/osd-audio-video-scout.md`): the `osd-audio-video` donor proves plain `<audio>` + a
  hand-rolled timeline already does `t=` annotation, so WaveSurfer is kept for the **visual waveform
  aid** (user call 2026-05-26), NOT capability — and is **dynamically imported** so it's a lazy
  code-split chunk (~17 kB gz, loads only when an audio object opens; main bundle unaffected).
- **Wave-2 video selector** is no longer greenfield: the same `osd-audio-video` donor implements the
  spatiotemporal selector `t=start,end&xywh=percent:x,y,w,h` serialized to WADM (reference to ADAPT).
- ⌘K must route to the **focused** field (note-popover comment OR section prose).

## Alternatives considered

- **Pinned sidebar inspector** — solves the scroll pain equally, no occlusion, no re-anchor
  cost, cleanest §121 fit. Rejected as *primary* because it loses spatial directness (edit
  where you look; draw→type). **Retained as the explicit fallback.**
- **A genuinely new/richer canvas editor** (beyond the WADM form) — rejected: would override
  §121, owe more, and split the editor into two definitions to keep in sync.
- **Video temporal-only for v1** (defer spatial-on-video) — rejected: revisits the model
  later anyway; the spatiotemporal need is real now (so: locked in the model, staged in the build).
