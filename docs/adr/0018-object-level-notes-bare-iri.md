---
status: accepted
date: 2026-06-20
---

# A whole-object Note is a bare-IRI target (no selector), not a flag on a full-canvas region

- **Closes:** the long-half-shipped locked frame "Annotations at **both** project level and image level" (CONTEXT §14). The target-scope ladder — Library / Exhibit / **Object** / region / time — was locked vocabulary (CONTEXT §39, §82, §269) but Studio only ever authored region/time targets, and the Viewer rendered a bare-Object note **invisible** (`selectorOf → null → spatialCoverage → 0 → isWholeObject(0, undefined) → false`). This round ships the **Object and Exhibit rungs**; the Library rung is named as a follow-on.
- **Reaffirms (untouched):** ADR-0003 append-only log + version-DAG (`target` is a per-version field, so a whole-object note is an ordinary record and re-targeting is an ordinary edit); ADR-0007 Readings (a whole-object note carries the optional `reading` id like any note); ADR-0003 three-tier interop (a pure consumer reads the bare-IRI target natively).
- **Prior art (cited — directory mandate):**
  - W3C Web Annotation Data Model — a `target` that is a **bare IRI** means the annotation is about the *entire* resource; a `SpecificResource` + `selector` means "about this part." (`annomea/docs/adr/0001-adopt-w3c-web-annotation-data-model.md`; `Archie/.scratch/Prior Art/03-annotation-data-model.md`.) Already encoded: `W3CTarget = string | W3CSpecificResource` (`wadm/types.ts:121`).
  - IIIF Presentation 3.0 — a whole-Canvas annotation targets the **Canvas IRI**; a region targets `canvas#xywh=…`. A full-canvas `xywh=0,0,W,H` fragment is *not* the IIIF idiom for "whole canvas" — a pure viewer (Mirador) would draw it as a rect. (`iiif-demo/IIIF-generator/Presentation API 3.0 — IIIF ….md`.)
  - IIIF Image API 3.0 — a region crop is a free server-side URL (`{id}/{x,y,w,h}/!{size}/0/default.jpg`), the basis for the IIIF branch of build-time cite previews. (`iiif-demo/IIIF-generator/Image API 3.0 — IIIF ….md`; `field-studio/src/shared/lib/iiif-image-api.ts`.)
- **Source:** grilling 2026-06-20 ("the cite and by-image feature feels broken across studio and viewer — what is the ideal shape"). The decisive reframe: "whole-image note" was never a new concept; it is the locked **Object-level Note**, and "image" was a word doing two jobs (a note's target scope *and* a citation lookup mode). The user settled identity on "what is most compatible with WADM/IIIF."

## Context

Two seams made the feature feel broken. (1) A note targeting the whole Object rendered invisible (above). (2) `coverage.ts` reads an `archie:wholeObject` override that **has no const, no `AnnotationRecord` field, and no writer** — the frame border could only fire by *accidental* ≥75 % coverage. The earlier session-decision "explicit flag + coverage fallback" had conflated two different things: an **Object-level Note** (structural: the target *is* the whole Object, zero geometry) versus a **rendering preference** on a region note that happens to be large.

## Decision

**A whole-object Note's canonical on-disk form is a bare resource IRI target with no selector.** An Object-level Note is `target: "<canvasIRI>"`; the Exhibit-level Note is the same shape one level up, `target: "<manifestIRI>"` (WADM permits any resource as a target; pure IIIF *presentation* viewers harmlessly ignore a Manifest-level annotation — the three-tier contract). No `xywh`, no `t=`, no `geo` — so the form is **medium-agnostic by construction**: "the whole thing" reads identically for image, audio, video, and map.

Consequences that lock in:

- **`isWholeObject()` returns `true` when there is no spatial selector** (`coverage.ts:56`) — the fix for the invisible-note seam. The bare-IRI target is now the **primary** whole-object signal.
- **`archie:wholeObject` is demoted to a region-override.** It earns a real const (`ARCHIE_WHOLE_OBJECT`), an `AnnotationRecord` field, and a serializer/deserializer — but its *only* job is to force the frame on a note that **does** carry a region selector, regardless of size. Bare-IRI notes need no flag. The ≥75 % coverage heuristic survives as the soft auto-detect for region notes. Three render paths converge on "frame the whole object": no-selector · selector+flag · selector+≥75 %.
- **Per-medium render of a whole-object Note:** image & map → a **frame border** around the canvas/extent; audio & video → a **full-width track band** over the waveform/timeline. All open the same note popover and are reachable from the linear index (Q-5, keyboard surface).
- **Create affordance:** a medium-agnostic **whole-object toggle** present in every editor (image canvas beside Box/Outline; AvEditor beside the time-region tool; map beside the geo Box/Outline). The toggle also **converts** a selected region note (drops its selector → bare IRI); **redrawing** is the equally-first-class inverse (Box/Outline on a selected whole-object note adds a selector). Conversions are ordinary versioned edits on `target`.
- **Lifecycle:** deleting an Object tombstones its region *and* whole-object notes uniformly (both carry the Canvas IRI). A merge where one side is a region and the other whole-object differs in `target` → the existing version-DAG conflict card; no special case.

## Rejected alternatives

- **(a) Full-canvas region selector (`xywh=0,0,W,H`) + `archie:wholeObject:true`.** Keeps every note region-shaped so no new render branch is needed — but it is a *fake* region: it requires knowing W/H at author time, breaks when a Map extent is reframed (ADR-0015), and a pure IIIF viewer draws a phantom rect. Not the IIIF idiom for "whole canvas." Rejected on compatibility.
- **(b) Bare IRI **and** `archie:wholeObject:true` (belt-and-suspenders).** Structurally honest but redundant on the Object rung — the bare IRI already *is* the signal; duplicating it invites the two signals to disagree.
- **(c) Drop the flag entirely (whole-object = bare-IRI only).** Simplest data model, but discards the established ≥75 %-coverage frame heuristic and any author override for "treat this big region as the whole object." Rejected — the override is cheap and the heuristic already shipped.
- **(d) Ship only the Object rung, defer Exhibit.** Smaller, but leaves the locked "project level" frame half-done again; the Exhibit rung is the *same* bare-IRI shape one level up, so the marginal data-model cost is ~zero (only the authoring/reading host differs). Deferred Library only.
