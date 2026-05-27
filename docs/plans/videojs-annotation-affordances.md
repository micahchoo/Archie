# VideoJS-Annotation Affordances: Reference Study for Archie AvEditor

## Executive Summary

The videojs-annotation plugin (Contently's W3C Web Annotation player) demonstrates a **two-phase annotation workflow**: (1) **spatial + temporal capture** via draggable timeline markers and drag-to-draw video overlays, then (2) **composition** in a modal dialog. The affordances prioritize directness—click-and-drag on the timeline to set time, click-and-drag on the video to set the region—followed by a centralized comment box. Timeline markers show as **colored bars (ranged)** or **point markers** with hover previews; existing annotations autopause and reveal a **threaded comment panel** on the right. Mode switching is explicit (annotation mode toggle button) and the UI copy avoids jargon in favor of verbs ("CONTINUE", "EDIT", "SAVE").

---

## How Annotations Are Started (Affordance: "Add New")

**File:** `src/js/components/controls.js:158–186` and `src/js/templates.js:162–169`

### Flow
1. User clicks **"+ NEW"** button in controls bar (when not in adding state)
2. Video pauses immediately (`this.player.pause()` at line 161)
3. Annotation mode enabled (if not already) and UI state changes to `adding: true`
4. A red-tinted overlay (`vac-video-cover`) appears over the entire video with cursor style change to `crosshair` (CSS line 109)
5. A tooltip appears: **"Click and drag to select"** (template line 176)
6. A draggable marker is instantiated at the current playhead position (line 179)

### Key Affordances
- **Immediate pause:** removes ambiguity about "when does annotation start?"
- **Overlay + crosshair cursor:** clear visual mode change; red tint signals "capturing"
- **Single-sentence instruction:** "Click and drag to select" (not "set in/out points" or "mark range")
- **Marker starts at current time:** reduces need to manually scrub; user can adjust via drag

---

## Time Range Marking & Timeline Visualization

**Files:** 
- `src/js/components/draggable_marker.js` (drag interaction model)
- `src/js/components/marker.js` and `src/js/templates.js:42–78` (marker rendering)

### Time Range Marking
- **Single marker** initially pinned at `startTime` (line 19 in draggable_marker.js)
- User **drags left or right** from that pin point
- Marker updates to show **start ≤ range ≤ end** (line 90–99)
- If user drags *before* the pin, `start = dragPoint, end = pin`; if after, `start = pin, end = dragPoint`
- Supports **frame-accurate mode** via frameRate option (line 82–87): converts pixel drag to nearest frame

### Timeline Marker Display (Existing Annotations)
- **Ranged marker:** colored bar spanning from `left: startPercent` to `width: (endPercent - startPercent)` (template line 37, 59)
- **Point marker:** no width, just a vertical line (point-in-time) (line 43)
- **Classes for styling:** `vac-type-{annotationType}`, `{markerClass}` (line 60, 50) allow per-annotation color/style
- **Hover tooltip:** displays `[HH:MM:SS] - preview text` on hover (line 64–70)
- **Z-index stacking:** prevents overlapping markers from obscuring each other

### Range Display in UI
When adding, the UI shows **human-readable range** (e.g., "00:10 - 00:15") using helper functions `Utils.humanTime()` or `Utils.humanTimeFrames()` (controls.js line 128–130). This is shown in the comment form header (template line 199: `<b>New Annotation</b> @ ${rangeStr}`).

---

## Spatial Region (Box) Drawing & Display

**File:** `src/js/components/selectable_shape.js` (drag-to-draw interaction)

### Drawing Flow
1. **Mousedown** on video canvas (when in adding state)
   - Initial shape: `{ x1, y1 }` (starting corner)
   - User drags; shape recalculates to `{ x1, y1, x2, y2 }` (opposite corner)
2. **Drag behavior** (line 84–107):
   - Coordinates are **percentage-based** (0–100% of video width/height)
   - If user drags left of origin, `x1 = dragPercent, x2 = originX`; if right, reversed
   - Same for Y; shape always normalizes to `(x1 ≤ x2, y1 ≤ y2)`
3. **Click (no drag):** shape is cleared (line 67–70)
4. **Coordinate conversion:** uses `offset()` and `innerWidth()/innerHeight()` to convert document pixels to video percentages (line 110–123)

### Shape Display
- Shape is rendered as an SVG or canvas overlay (via `render()` inherited from Shape base class)
- Shape **persists on the video** during the add/edit flow
- On save, shape is serialized as `{ x, y, width, height }` in **percent coordinates** and stored in the annotation's target selector

### Visual Feedback During Drawing
- **Overlay cursor:** changes to indicate dragging state (class `vac-cursor-dragging` added to tooltip, line 57)
- **Shape element:** rendered in real-time as user drags (line 51)

---

## Annotation Form / Popover: Where, When, How It Appears

**Files:** `src/js/templates.js:195–209` (comment writing UI), `src/js/components/controls.js:188–208` (save flow)

### Location & Appearance
- **Modal dialog** overlaid on the video, centered (CSS `display: flex; align-items: center; justify-content: center`)
- **Dark overlay:** `rgba(black, 0.7)` behind the dialog (CSS line 126)
- **White box:** 80% width, max 400px, with heading and textarea (CSS lines 137–150)

### Contents
1. **Heading:** `<b>New Annotation</b> @ ${rangeStr}` (e.g., "New Annotation @ 00:10 - 00:15")
2. **Textarea:** placeholder "Enter comment..." (template line 201)
3. **Buttons:** "SAVE" (right-aligned) and "Cancel" link (right-aligned, hovers to red) (template line 203–204)

### When It Appears
- After user finishes drawing the range/shape, they click **"CONTINUE"** button in the controls panel
- UI state changes to `writingComment: true` (controls.js line 190)
- Modal appears with focus on textarea

### Dismissal & Saving
- **SAVE:** calls `saveNew()`, which reads textarea value and creates annotation (line 195–207)
- **Cancel:** calls `cancelAddNew()`, which tears down UI and restores normal state (line 149–155)
- **No validation UI:** if textarea is empty, save does nothing (TODO comment, line 197)

---

## Marker Display & Interaction: Selecting, Editing, Deleting

**Files:** 
- `src/js/components/annotation.js` (annotation open/close and interaction)
- `src/js/templates.js:103–121` (comment list UI)
- `src/js/components/controls.js:210–277` (edit/delete flows)

### Displaying Existing Annotations
- **During playback:** as video time passes through an annotation's range, the annotation is set as "live" (annotation_state.js line 162–200)
- **Live annotation auto-opens:** displays a **right-side comment panel** showing:
  - List of threaded comments
  - Range display: `<b>@</b> ${rangeStr}` (template line 115)
  - Action buttons: "EDIT" | "DELETE" | "CLOSE" (template line 106–117)

### Selecting / Opening an Annotation
1. **Click marker on timeline:** opens the annotation, pauses video, shows comment panel (annotation.js opens on click)
2. **Keyboard navigation:** arrow keys (left/right) navigate prev/next annotations (controls.js line 293–298)
3. **Live on playback:** automatically opens when playhead enters range

### Editing an Annotation
1. User clicks **"EDIT"** in comment panel
2. Marker is hidden, red overlay appears, draggable marker created with current range/shape (controls.js line 211–233)
3. User adjusts range/shape as in "add new"
4. Clicks **"SAVE"** to commit changes (line 236–260)

### Deleting an Annotation
- User clicks **"DELETE"** in comment panel
- Calls annotation teardown, removes from state (annotation_state.js line 147–160)
- No confirmation dialog

---

## Toolbar / Mode Model & Copy

**Files:** `src/js/components/player_button.js`, `src/js/templates.js:162–235` (controls template)

### Mode Model
- **Two modes:** "Annotation mode" (on/off), toggled by clicking the button in the player control bar
- **Annotation mode OFF:** playback controls active, markers hidden, play/pause/timeline work normally
- **Annotation mode ON:**
  - Markers visible
  - Playback disabled (play/pause hidden)
  - Comment panel shows for live annotations
  - "Add New" button enabled
  - Annotations auto-open on playback

### Control Panel Copy (Avoids Jargon)
- **"+ NEW"** (not "Start Annotation", "Add Range", "Set Marker")
- **"CONTINUE"** (not "Next Step", "To Comment")
- **"SAVE"** (not "Create", "Commit")
- **"EDIT"** (not "Modify", "Update")
- **"DELETE"** (not "Remove", "Discard")
- **"Prev" / "Next"** (for annotation navigation)
- **"-1 sec / +1 sec"** (for scrubbing the start time, not "adjust in point")
- **"-1 frame / +1 frame"** (if frame-accurate mode enabled)
- Instruction text: **"Click and drag to select"** (not "drag to set in/out points")
- Editing instruction: **"Click and drag to adjust"** (template line 215)

### Active State Indication
- **Button color change:** when annotation mode is on, the icon in the control bar turns teal (primary color) (CSS line 37–41)
- **Overlay color:** red tint when adding (CSS line 108)

---

## Key Design Patterns & Affordance Insights

### 1. **Directness Over Modes**
- User interaction is immediate and visible: drag → see range, drag → see shape, type → write comment
- No separate "select tool" vs "draw tool" buttons; context is implicit (are you adding or not?)

### 2. **Real-Time Feedback**
- All changes are reflected live: dragging marker updates range display, dragging shape updates visual preview

### 3. **Explicit State Transitions**
- Clear visual feedback for state changes: overlay color, button labels, UI panel content
- No ambiguity about "what happens next"

### 4. **Readable Copy for Non-Experts**
- "Click and drag" is universal; "Select shape + range" is a description of the step, not a jargon-filled instruction
- Button labels use imperative verbs, not nouns

### 5. **Marker Design**
- Ranged markers (bars) are visually distinct from point markers
- Hover tooltips provide previews without clicking
- Stacking and z-index prevent collisions

### 6. **Three-Step Workflow for Clarity**
1. **Select range + shape** (on video)
2. **Write comment** (modal dialog)
3. **Save and continue** (new annotation live)

---

## Appendix: W3C Media Fragments Format

Annotations are stored with selector:
```
t=10,15&xywh=percent:23.5,10,37.5,34
```
- `t=10,15`: time range (seconds)
- `xywh=percent:x,y,width,height`: spatial region (all percentages, origin top-left)

---
