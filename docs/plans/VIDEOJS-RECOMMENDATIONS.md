# Archie AvEditor: Affordance Adoption From VideoJS-Annotation

## Quick Reference: 6 Concrete Improvements for Archie

### 1. **Rename "Set in" → "Mark Start" / "Start Range" (Copy Clarity)**
**Donor:** `videojs-annotation/src/js/templates.js:176, 199`  
**Rationale:** "Click and drag to select" (line 176) + "Select shape + range" (line 181) is plain language. "Set in" is mixing verbs and jargon. Archie should use **"Mark Start"** (when initializing) or show an instruction like **"Click timeline to start range"** to be equally direct.  
**Implementation:** Replace markbar label text and add a one-line instruction inline (not buried in a tooltip).

---

### 2. **Add Red Overlay on Active Capture (Visual Mode Signal)**
**Donor:** `videojs-annotation/src/css/annotations.scss:101–115` + `src/js/templates.js:173–178`  
**Rationale:** When in annotation-adding mode, a semi-transparent red overlay (`rgba(255,0,0,.15)`) + `cursor: crosshair` signals "capturing" state. Archie's markbar doesn't have this affordance.  
**Implementation:** On "Mark Start" click, render a red overlay div over the video canvas. CSS: `background: rgba(255,0,0,0.15); cursor: crosshair;` Remove on cancel/save.

---

### 3. **Show Range Dynamically as "HH:MM:SS – HH:MM:SS" in Markbar (Live Feedback)**
**Donor:** `videojs-annotation/src/js/components/controls.js:128–130` + `src/js/templates.js:199`  
**Rationale:** As the user drags the end handle, the markbar should display the computed range (e.g., "00:10 – 00:15") live, not just store it invisibly. Makes the intent clear.  
**Implementation:** Update a `.vac-range-display` div as `marker.range` changes; use `Utils.humanTime(range)` helper (or Svelte computed) to format.

---

### 4. **Use "CONTINUE" → "NEXT" for Step 2; "SAVE" → "Save Note" for Step 3 (Action Clarity)**
**Donor:** `videojs-annotation/src/js/templates.js:183, 203, 221`  
**Rationale:** Button labels use imperative verbs + object: "CONTINUE" (step 1→2), "SAVE" (step 2→3). Archie says "Add note" and doesn't split the flow visually.  
**Implementation:** Replace markbar button with **"NEXT"** after range+shape are set. Replace note form button with **"Save Note"** (not "Add"). Clarifies intent at each step.

---

### 5. **Timeline Markers: Use Colored Bars for Ranges, Not Just Points (Spatial Clarity)**
**Donor:** `videojs-annotation/src/js/templates.js:35–37, 43–78` + `src/css/annotations.scss:200+`  
**Rationale:** VideoJS renders existing annotations as **bars** (`.left: startPercent; width: endPercent – startPercent`) not just vertical lines. Users instantly see the span and can drag to edit. Archie may only show point markers.  
**Implementation:** On the timeline/progress bar, render annotation markers as rectangles spanning their time range. Add `vac-type-{category}` classes for per-annotation color (e.g., red for "review", green for "approved").

---

### 6. **Add Keyboard Navigation + Hover Previews on Timeline Markers (Discoverability)**
**Donor:** `videojs-annotation/src/js/components/controls.js:293–298` + `src/js/templates.js:64–70`  
**Rationale:** Arrow keys (left/right) jump between annotations; hover shows `[HH:MM:SS] - preview text`. Reduces clicks and accidental pauses.  
**Implementation:** 
  - Bind `keyup` → left/right → `nextAnnotation()` / `prevAnnotation()` 
  - On timeline marker hover, show tooltip: `<b>00:10 – 00:15</b> - [first comment body]`

---

## Why These 6?

1. **Copy (Rec 1, 4):** Users were confused by "Set in", "region", "playhead" → use action verbs
2. **Visual affordances (Rec 2, 5):** Red overlay and ranged bars = "this is a range, not a point"
3. **Live feedback (Rec 3):** Seeing the range update as you drag removes ambiguity
4. **Navigation (Rec 6):** Keyboard + hover = power-users stay focused; casual users get previews

---

## Implementation Priority

1. **High (Ship in next release):** Recs 1, 2, 3 (copy + visual mode + live feedback)
2. **High:** Rec 5 (bar markers; critical for understanding existing annotations)
3. **Medium:** Rec 4 (button label clarity; can be quick rename)
4. **Medium:** Rec 6 (keyboard nav; nice-to-have if time)

---

## Files to Reference in Archie

- **Copy/buttons:** `apps/studio/src/AvEditor.svelte` → update all labels to verbs + objects
- **Visual overlay:** Add CSS for red capture mode; bind in Svelte reactive
- **Range display:** Compute in `<script>` block; render inline in markbar
- **Timeline markers:** Modify progress-bar rendering to show bars (not points) for ranges
- **Keyboard/hover:** Bind `keydown` on player element; add Svelte transitions for tooltip
