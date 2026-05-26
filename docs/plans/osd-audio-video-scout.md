# Scout Report: osd-audio-video Donor

**Date:** 2026-05-25  
**Status:** VERDICT → **ADAPT (with heavy caveats)**

---

## 1. What Is It?

**Not a library. A vanilla-JS prototype suite** (three HTML/JS demos in `/mnt/Ghar/2TA/DevStuff/Annotators/Image/osd-audio-video/`):
- `video-canvas.html` — full spatiotemporal annotation UI for video with W3C WADM model
- `audio-canvas.html` — temporal-only annotation UI for audio (time-range selection)
- `multi-canvas-strip.html` — OSD reference strip + overlaid audio/video on top (architecture sketch for combining media types)

These are **not Archie plugins or OSD extensions**. They are **standalone HTML prototypes** demonstrating a **canvas-centric (not OSD-centric) annotation pattern** using vanilla DOM + media `<video>`/`<audio>` elements with Web API event handlers. No OSD tile-source integration, no Annotorious compatibility, no framework.

---

## 2. Temporal + Spatiotemporal Model

**YES and YES — fully implemented and production-ready model.**

### Temporal (`t=`):
- `audio-canvas.html:31–100` — waveform wrapper + transport (play, scrub, current time display)
- Timeline interaction: click to scrub, drag to create time-range regions, handles for resize
- Storage format: `t=start,end` (seconds, three decimals): `t=12.340,45.670`

### Spatiotemporal (`xywh=&t=`):
- `video-canvas.html:39–100` (spatial overlay) + `video-canvas.html:600–681` (render logic)
- Drawing: click+drag on video frame to create a bounding box; box stored in percent coords
- Time-bounded: box is only rendered when `video.currentTime >= a._start && video.currentTime <= a._end` (line 670)
- **Full selector:** `t=12.340,45.670&xywh=percent:15.50,20.30,30.00,40.00`
  - Code: `video-canvas.html:773–775` (selectorValue construction)
- Representation in memory: `{ start, end, xywh: { x, y, w, h } }` — spatial coords stored in percent (line 633–638)

**This directly matches Archie's `xywh=&t=` video goal.**

---

## 3. Dependencies

**Minimal and clean:**
- **WaveSurfer.js:** NOT used. Audio waveform display is absent from `audio-canvas.html` — only a placeholder wrapper (`#waveform-wrap`, line 31–35).
- **OSD:** NOT used. Plain `<video>` and `<audio>` HTML5 media elements.
- **Annotorious:** NOT used. Custom sidebar list + inline JSON model.
- **Framework:** None. Vanilla DOM, ES6 modules, `localStorage` for persistence.
- **W3C Spec:** Uses `FragmentSelector` with W3C Media Fragments (`http://www.w3.org/TR/media-frags/`) — standard.

**Dependency footprint: ~30 KB uncompressed (single HTML file), no external libraries.**

---

## 4. Adoptability into Archie's `@render/mount`

**POOR FIT for a direct drop-in. Good reference; requires significant adaptation.**

### Why it won't plug in:
1. **Canvas-centric, not OSD-centric**: These prototypes treat video/audio as standalone media, not OSD tile-sources or image-like canvases. Archie's mental model is OSD-as-universal-canvas (image → tiles, audio/video → timeline + frame?).
2. **No Annotorious reuse**: Prototypes have their own sidebar, their own interaction model (drag-to-select on timeline/frame), their own JSON model. Archie's `createOSDAnnotator` expects Annotorious popovers that follow the marker pattern (popover appears at anchor, closes on blur).
3. **Framework-agnostic but DOM-coupled**: The code is vanilla JS, but it's tightly wired to HTML element IDs (`getElementById`) and internal state machines (`draft`, `annotations[]` in localStorage). Moving this into Archie's Svelte `AvEditor` mount would require refactoring the state machine and UI bindings.

### What it does offer:
- **Proven selector model** (use the `t=` and `xywh=&t=` format + serialization, `video-canvas.html:565–572, 772–775`)
- **Clear temporal + spatial interaction pattern** (timeline scrubbing + frame-drawing) you can port
- **W3C WADM structure** (ready for round-trip with Archie's annotation JSON, `video-canvas.html:788–805`)

---

## 5. VERDICT

**ADAPT, not ADOPT.** Use as **reference implementation** for selector model and UI flow; do not port the code wholesale into Archie.

### Why ADAPT:
1. **Selectors are solid.** The `t=start,end&xywh=percent:x,y,w,h` format is proven, W3C-compliant, and directly unblocks Archie's video annotation. Copy this format + serialization logic (`video-canvas.html:565–572, 772–775`) into Archie's video model layer.
2. **Interaction pattern is sound.** Timeline drag-to-select + frame click-to-draw is intuitive and aligns with Archie's "marker at the anchor" philosophy (temporal anchor on timeline, spatial anchor on frame). But integrate it into the **same popover/marker UI** as images (not a separate `AvEditor`), so annotators see one consistent flow.
3. **Waveform absence is a feature, not a bug.** The donor does NOT use WaveSurfer, proving you don't need it. A raw `<audio>` element + hand-rolled timeline (like this demo) is sufficient for temporal annotation. WaveSurfer would add unnecessary complexity and size; stick with HTML5 media + custom timeline.

### Why NOT ADOPT:
1. **Canvas fragmentation.** Adopting this whole prototype would force Archie to have two completely separate annotation flows: one for images (OSD + Annotorious popover) and one for audio/video (custom timeline + spatial overlay). This violates the "one marker model" principle.
2. **OSD integration is missing.** Archie's whole architecture is OSD-centric. Audio/video should eventually live in OSD's viewport too (as synthetic tile-sources or overlaid canvases), not as separate side-by-side media panes.

### Single Most Important Artifact:
- **`video-canvas.html:565–572` (selector serialization)** — the `t=` + `xywh=` formula.
- **`video-canvas.html:772–775` (full selector construction)** — proof of concept that works.

---

## Actionable Next Steps

1. **Copy the selector model.** Port `rebuildSelector()` logic into Archie's video-annotation service layer.
2. **Design AvEditor as a marker popover, not a side-panel.** Use the timeline + frame-drawing as the **content inside the popover**, not a separate UI tier. Annotators tap the marker on the timeline (or frame), and the popover appears with the same "add body + save" flow as image annotations.
3. **Stub the waveform.** Don't add WaveSurfer. The `<audio>` element is fine; invest in a cleaner timeline scrubber if audio UX is a bottleneck later.
4. **Validate W3C round-trip.** Before shipping, test that Archie's audio/video annotations serialize to W3C WADM, survive export, and re-import correctly (like Archie already does for images).

