# Wave-1 Editing: Prior-Art Evidence Report

**Date:** 2026-05-25  
**Context:** ADR-0006 locks marker-anchored editable popover + WaveSurfer for audio. This report surveys donor codebases for implementation patterns and greenfield gaps.

---

## Q1: Marker-Anchored Popup/Popover Positioning & Re-Anchoring on Pan/Zoom

### Verdict: ADOPT + ADAPT

**Primary Finding:**  
`annomea/src/viewer/popup.ts` (lines 80–187) implements **live anchor repositioning** using a virtual reference backer for `floating-ui/dom`. The architecture solves OSD pan/zoom re-anchoring — the exact pattern needed for Wave-1.

#### How It Works (annomea)
- **Virtual anchor (not a DOM node):** `PopupAnchor` interface (line 85) exposes `getBoundingClientRect()` backed by live getter, not a fixed element. This avoids `autoUpdate` observer triggers that never fire on OSD canvas transforms.
- **Explicit reposition on OSD events:** Line 288 `reposition()` function is wired by the viewer to OSD `update-viewport`/`animation` events (consumer pattern; not shown in this file but referenced in audit notes). Each pan/zoom calls `reposition()`.
- **floating-ui middleware chain:** Lines 166–176 compute placement with `offset(16)`, `flip()`, `shift()` — browser fallback if popup hits viewport edges.
- **Leader line from region center to popup edge:** Lines 96–163. SVG line connects annotation region center to popup's nearest edge; line coords recalculated on each reposition (line 175).

#### Key Code Citations
- **Live anchor getter:** `popup.ts:85–87` (PopupAnchor interface)
- **Reposition function (called on pan/zoom):** `popup.ts:288–290`
- **floating-ui compute + leader redraw:** `popup.ts:165–176`
- **Integration point (viewer wires event):** `popup.ts:120–122` comment explains the contract

#### Prior Art Dependencies
- `@floating-ui/dom` (computePosition, offset, flip, shift) — **framework-agnostic**, reusable
- OSD event hook pattern (consumer's responsibility to wire `reposition()` to OSD events)

#### Evidence from OSD Ecosystem
The `/Prior Art/01-deep-zoom-viewer.md` audit (lines 34–35) confirms liiive's `live-cursors.tsx:34` uses `addHandler('update-viewport', …)` → `viewport.imageToViewerElementCoordinates()` to recompute peer-cursor screen position on every pan/zoom. **This is the structural template**: viewport event → image-to-screen coordinate transform → DOM reposition. Annomea wires the same pattern to annotation popups instead of cursors.

---

## Q2: Editable Annotation Form as Reusable Component

### Verdict: ADOPT (with caveat: sidebar-coupled in anvil; position-agnostic in annomea)

**Primary Finding:**  
Two donors offer form components; annomea's is superior for popover reuse.

### annomea: AnnotationForm (POSITION-AGNOSTIC)
**File:** `annomea/src/editor/AnnotationForm.svelte` (lines 1–50 sampled; full component is ~130 LOC)

**Structure:**
- **Inputs:** `Props { annotation, index, onupdate }` (lines 12–16)
  - `annotation: WadmAnnotation`
  - `onupdate` callback fires on any field change
- **Fields (3-tier progressive disclosure per ADR-0010):**
  - **Tier 1 (always visible):** Name (title), Note (describing TextualBody), Language
  - **Tier 2 (show-more toggle):** Tags, Motivation, Creator
  - **Tier 3 (advanced toggle):** Alt text (accessibility)
- **Data write logic:** Delegated to `@annomea/data` pure functions (`setName`, `setDescribing`, `setTagsFromCsv`, etc.); component just wires state + callbacks.
- **Media bodies:** Handled by child component `MediaBodyEditor.svelte` (not shown but referenced line 10)

**Why This Works for Wave-1 Popover:**
- **No layout assumptions:** Component receives `annotation` and fires `onupdate`; doesn't assume sidebar, doesn't position itself.
- **Boundary-clean:** All write logic is external; form is a pure presenter.
- **Reusable fields:** Can be dropped into a popover, a sidebar, or an inline editor without modification.

**Citation:** `annomea/src/editor/AnnotationForm.svelte:1–50` (component skeleton; full file is 632 LOC)

### anvil: PropertiesEditor (SIDEBAR-COUPLED)
**File:** `anvil/app/src/editor/PropertiesEditor.svelte` (sampled first 50 lines)

**Issue:**  
File is 964 LOC and couples theme/preset logic (line 22 `config = $bindable()`, lines 32–47 undo stack + save state machine) with form fields. Not portable to a popover without extraction.

**Citation:** `anvil/app/src/editor/PropertiesEditor.svelte:1–50`

### Adoption Path
- **ADOPT:** annomea's `AnnotationForm.svelte` component (plus its data builders from `@annomea/data/annotation-edit`)
- **ADAPT (Wave-1 scope):** Simplify to Tier 1 only (name + note + language); defer Tier 2/3 to post-Wave-1 polish

---

## Q3: WaveSurfer.js Usage & Regions Plugin Integration

### Verdict: ADOPT (WaveSurfer 7.8.6 + Regions plugin, proven in field-studio)

**Primary Finding:**  
field-studio's `AudioWaveform.svelte` is a production-grade WaveSurfer integration with regions plugin already wired for time-range editing. Directly adoptable for Wave-1 audio annotation.

### Implementation (field-studio)
**File:** `field-studio/src/features/media/ui/molecules/AudioWaveform.svelte`

**Imports (dynamic, to avoid bundle bloat):**
```typescript
// Lines 128–137: Promise.all dynamic import
const [
  { default: WaveSurfer },
  { default: RegionsPlugin },
  { default: TimelinePlugin },
  { default: HoverPlugin },
] = await Promise.all([
  import('wavesurfer.js'),
  import('wavesurfer.js/dist/plugins/regions.js'),
  import('wavesurfer.js/dist/plugins/timeline.js'),
  import('wavesurfer.js/dist/plugins/hover.js'),
]);
```

**Region Plugin Integration (lines 140–152):**
```typescript
const regions = RegionsPlugin.create();
regionsPlugin = regions;
const plugins: any[] = [regions];
// ... timeline + hover plugins
```

**Instance Creation (lines 154–167):**
```typescript
const instance = WaveSurfer.create({
  container: waveformEl,
  url: src,
  waveColor: fieldMode ? '#eab308' : '#64748b',
  progressColor: fieldMode ? '#fbbf24' : '#22c55e',
  cursorColor: fieldMode ? '#fbbf24' : '#3b82f6',
  barWidth: 2, barGap: 1, barRadius: 2,
  normalize: true,
  plugins,
});
```

**Region Change Handler (line 196–198):**
```typescript
function handleRegionChange(region: any) {
  if (region.id?.startsWith('user-'))
    onTimeRangeChange?.({ start: region.start, end: region.end });
}
```

**State Syncing (lines 170–195):**
- `ready`, `loading`, `timeupdate`, `play`, `pause`, `finish` events wired to reactive state
- Time updates throttled to 250ms (line 180) to avoid excessive re-renders

### Prior Art / Prototypes
**File:** `osd-audio-video/audio-canvas.html:291–385` (the temporal-annotation prototype)

**Pattern (WaveSurfer 7.8.6, CDN imported):**
- Region create/drag/resize → WADM `Sound` target with `t=start,end` selector
- Draft region vs. persisted region lifecycle
- Playback with stop-at-end (line 583–596)

**Citation:** `audio-canvas.html:291-385` (region→WADM mapping)

### Adoption for Wave-1
- **Version:** WaveSurfer 7.8.6 confirmed in field-studio; use matching version
- **Regions plugin:** Already in use; stable API
- **Minimal additions for Wave-1:**
  - Wire region create/update to popover form's `onTimeRangeChange` callback
  - Map `timeRange: {start, end}` → WADM `Sound` target builder (from osd-audio-video's pattern, lines 494–511)

**Citation:** 
- **Active integration:** `field-studio/src/features/media/ui/molecules/AudioWaveform.svelte:128–198`
- **Regions plugin version:** Line 134 (import path)
- **Time-range → annotation mapping pattern:** `osd-audio-video/audio-canvas.html:494–511` (PURE builder, trivial to lift)

---

## Summary Table

| Question | Verdict | Primary File | Key Function/Component | Adoption Effort |
|----------|---------|--------------|------------------------|-----------------|
| **Q1: OSD pan/zoom re-anchoring** | ADOPT | `annomea/src/viewer/popup.ts` | `PopupAnchor` interface + `reposition()` (lines 85–290) | Low — integrate into Wave-1 viewer glue |
| **Q2: Editable form component** | ADOPT (annomea) | `annomea/src/editor/AnnotationForm.svelte` | Progressive disclosure form (Tier 1) | Low — copy component; simplify to Tier 1 |
| **Q3: WaveSurfer + regions** | ADOPT (v7.8.6) | `field-studio/src/features/media/ui/molecules/AudioWaveform.svelte` | Dynamic import + RegionsPlugin (lines 128–198) | Low — wrap as Wave-1 audio popover molecule |

---

## Greenfield Gaps (What Donors Don't Solve)

1. **Anchor re-projection on region select + fitBounds:** Donors supply viewport-event-recompute primitives but NOT the "select annotation → pan/zoom to region → keep anchor live" end-to-end flow. Annomea audit (01-deep-zoom-viewer.md, line 54–55) flags this explicitly. Wave-1 must build it.
2. **Popover positioning within Astro static-render context:** annomea/anvil are vanilla/Svelte; Archie Studio is Astro. The virtual-anchor pattern (floating-ui) is framework-agnostic, but wiring OSD event hooks into Astro runes is a Wave-1 integration task.
3. **WADM form↔popover state sync:** Neither donor shows form change → annotation patch → OSD region redraw → anchor reposition in a loop. Wave-1 authoring UX requires this flow.

---

## Recommended Wave-1 Roadmap (ADR-0006 follow-up)

1. **Month 1: Adopt & integrate**
   - Port `annomea/src/viewer/popup.ts` (PopupAnchor + floating-ui) to Studio viewer glue
   - Wire OSD `update-viewport` event to popover `reposition()`
   - Wrap `field-studio`'s `AudioWaveform.svelte` as `@studio/AudioAnnotationPopover`
   - Port `annomea`'s `AnnotationForm.svelte` Tier 1 fields into popover molecule

2. **Month 2: Image annotations (no new surfaces)**
   - Reuse popup positioning for image annotation editing (popover anchored to marker)
   - Integrate Annotorious's marker-drag → popover-reposition

3. **Month 3: Audio & video (temporal/spatio-temporal)**
   - Wire regions → WADM `Sound`/`Video` target builders (lift from osd-audio-video)
   - Spatio-temporal selector test with video overlay (video-canvas.html pattern, lines 600–682)

---

## Files Referenced

- **Popup positioning & re-anchoring:** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/annomea/src/viewer/popup.ts`
- **Annotation form (Tier 1 adoptable):** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/annomea/src/editor/AnnotationForm.svelte`
- **WaveSurfer integration (proven):** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/field-studio/src/features/media/ui/molecules/AudioWaveform.svelte`
- **OSD coordinate re-projection audit:** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/Prior Art/01-deep-zoom-viewer.md`
- **Audio/video temporal patterns:** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/Archie/Prior Art/04-multimedia-av.md`
- **Temporal region authoring (prototype):** `/mnt/Ghar/2TA/DevStuff/Annotators/Image/osd-audio-video/audio-canvas.html` (lines 291–511)

