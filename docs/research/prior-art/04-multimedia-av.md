# Axis 04 — multimedia-AV (audio + video)

## Focused question
How do prior-art repos present `Sound`/`Video` alongside `Image`, attach annotations to time-based media (temporal + spatio-temporal selectors), render WADM AV bodies, and let OSD coexist with AV viewers?

## Sources surveyed
- `osd-audio-video/audio-canvas.html` — THE temporal-annotation prototype — **opened (full)**
- `osd-audio-video/video-canvas.html` — THE spatio-temporal prototype — **opened (full)**
- `osd-audio-video/multi-canvas-strip.html` — THE OSD-coexists-with-AV probe — **opened (full)**
- `BIIIF/videojs-annotation` — user's own hard fork; W3C + IIIF AnnotationPage converters — **opened (w3c.js, iiif.js)**
- `BIIIF/Videojs` — empty stub dir (no usable code) — **opened (confirmed empty)**
- `quire/.../figure/{video,audio}` + `figureMedia` — publication AV embeds — **opened**
- `juncture/components/Video.vue` — Vue visual-essay video — **opened (grep)**

## Findings by source

### osd-audio-video — three from-scratch prototypes, all WADM-native, zero framework
- **Audio temporal region → WADM `Sound` target** — `osd-audio-video/audio-canvas.html:494-511` — PURE — builds full `Annotation` with `target.type:'Sound'`, `selector.type:'FragmentSelector'`, `conformsTo` media-frags, `value:\`t=start,end\``. Exactly our `Sound` body/target story. This is the canonical reference.
- **Three time-entry modes (drag / MM:SS / tap-during-playback)** — `audio-canvas.html:208-234, 432-475` — PURE — `parseTS`, `ensureDraftFromTimestamps`, tap-at-playhead. Authoring-UX gold for temporal regions.
- **Region playback with stop-at-end** — `audio-canvas.html:583-596` — PURE — `ws.setTime(start); play(); timeupdate→pause at end`. Maps to "play this annotated segment."
- **wavesurfer.js regions = temporal draw/resize/loop** — `audio-canvas.html:291-385` — COUPLED(wavesurfer) — region create/update/click wired to WADM target rewrite. Lift the *pattern*, not the dep.
- **Video spatio-temporal selector `t=…&xywh=percent:…`** — `video-canvas.html:565-572, 768-805` — PURE — `rebuildSelector` composes temporal + percent-space xywh; saves `target.type:'Video'`. Directly our `Video` + combined selector need.
- **Hand-rolled timeline (ticks, playhead, drag-create/resize regions)** — `video-canvas.html:451-598` — PURE — no lib; pure DOM/percent math. Lift wholesale if avoiding wavesurfer.
- **Spatial overlay on video frame, percent coords, time-gated visibility** — `video-canvas.html:600-682` — PURE — boxes render only when `currentTime` within `[start,end]`. Our spatio-temporal anchor recompute.
- **OSD `sequenceMode` + `showReferenceStrip` as mixed-media navigator** — `multi-canvas-strip.html:307-329` — COUPLED(OSD) — image+audio+video as one OSD page sequence; baked thumbs per type.
- **Client-side thumb baking: waveform PNG + video poster frame** — `multi-canvas-strip.html:232-297` — PURE — `decodeAudioData`→canvas waveform; `<video>` seek→`drawImage` poster. Lets AV pages live in an image-only strip.
- **Overlay-swap pattern: AV viewer covers OSD canvas, sits above strip** — `multi-canvas-strip.html:378-426` — COUPLED(OSD) — `page` event swaps overlay; `positionOverlaysAboveStrip` brittle (greps `.referencestrip` class across OSD versions — flagged in-file). The honest verdict: OSD *tolerates* AV but its zoom/pan chrome is nonsensical for non-image pages (see the file's own `findings` list, `:200-208`).

### BIIIF/videojs-annotation — user's own fork; the only reusable AV↔WADM library
- **`parseMediaFragment` / `buildMediaFragment`** — `BIIIF/videojs-annotation/src/js/lib/w3c.js:15-56` — PURE — round-trips `t=start,end&xywh=percent:…` ↔ `{range, shape}`. Reusable AV-selector codec.
- **`toW3C` / `fromW3C`** — `lib/w3c.js:64-201` — PURE — internal↔WADM `Annotation`; replies become `motivation:'replying'` child annotations targeting parent id (threaded comments as WADM).
- **`toIIIFAnnotationPage` / `upgradeToCanvasTarget`** — `lib/iiif.js:24-70` — PURE — wraps annotations in IIIF Pres-3 `AnnotationPage`, dual `@context`, upgrades `target.source` string→`{id,type:'Canvas'}`. Matches our AnnotationPage export contract.
- **Frame-accurate ranged markers on timeline** — `src/js/templates.js:37-74`; README — COUPLED(video.js) — `vac-ranged-marker` left/width %, plus shapes-on-video. Full in-player annotation UI if we adopt video.js.

### quire — AV as publication figure, NOT annotatable
- **Video figure: native `<video>` / vimeo / youtube iframe** — `quire/packages/11ty/_includes/components/figure/video/element.js:25-83` — COUPLED(11ty) — poster + caption + embed; print fallback = poster image (`print.js:42-47`).
- **Audio figure: SoundCloud iframe ONLY** — `.../figure/audio/element.js:20-44` — COUPLED(11ty) — no native `<audio>`, no `Sound` body, no time selectors. Embed-only.

### juncture — video = whole-object embed, no annotation
- **`ve-video`: youtube / video.js / plyr embed** — `juncture/components/Video.vue:5-87` — COUPLED(Vue) — picks player by `videoId`/`source`; no temporal selector, no WADM, no captions.

### papadam — BEST AV donor: only real ASR transcript pipeline in the corpus
- **Whisper ASR → WebVTT with real timestamps** — `papadam/transcribe/worker.py:28-52,96` — PURE — `whisper.load_model` + `model.transcribe` + `_segments_to_vtt` emitting `HH:MM:SS.mmm --> …`. The transcript-*generation* half no other repo has (hyperaudio-lite is sync-only). NOTE: `ARCHITECTURE.md`/`STATE.md` wrongly call this a "stub — VTT passthrough only"; the code is real.
- **Transcript store + caption-track render** — `papadam/api/papadapi/archive/views.py:375-402`; `papadam/ui/src/lib/components/MediaPlayer.svelte:166` — COUPLED(Django/Svelte) — POST VTT → stored as `transcript_vtt_url` URLField (NOT a WADM `supplementing` body) → `<track kind="captions">`. Closes gap-D's *generation+sync* half; WADM-body half still open.
- **Temporal media target** — `papadam/api/papadapi/annotate/models.py:64`; HLS player segment loop `MediaPlayer.svelte:117-120` — COUPLED — `media_target="t=22.5,37"`; play-segment-stop-at-end. Less rich than osd-audio-video's authoring UX, but server-persisted + collaborative.

## Pure-logic extractables (the gold)
| Capability | Source `file:line` | Pure? | Depends on | Effort | Maps to our need |
|---|---|---|---|---|---|
| WADM `Sound` temporal annotation builder | `audio-canvas.html:494-511` | PURE | crypto.randomUUID | trivial | `Sound` target + FragmentSelector `t=` |
| Combined `t=…&xywh=percent:` selector builder | `video-canvas.html:565-572` | PURE | none | trivial | `Video` spatio-temporal selector |
| Media-fragment codec (parse+build, round-trip) | `videojs-annotation/src/js/lib/w3c.js:15-56` | PURE | none | trivial | canonical AV selector ser/deser |
| internal↔WADM + IIIF AnnotationPage wrap | `w3c.js:64-201` + `iiif.js:24-70` | PURE | none | low | AnnotationPage export, Canvas target |
| Hand-rolled video timeline (ticks/playhead/regions) | `video-canvas.html:451-598` | PURE | DOM | low | timeline without wavesurfer |
| Waveform-PNG + poster-frame thumb baking | `multi-canvas-strip.html:232-297` | PURE | AudioContext, canvas | low | AV thumbs in an image strip |
| Time-gated spatial-box visibility | `video-canvas.html:652-682` | PURE | DOM | low | spatio-temporal anchor recompute |
| Three time-entry modes (drag/MM:SS/tap) | `audio-canvas.html:432-475` | PURE | none | low | temporal authoring UX |

## Gaps — what NO surveyed repo solves
1. **Transcript / caption as a first-class annotation body.** NOTHING surveyed treats captions/transcripts as WADM annotations. No `<track>`/WebVTT, no transcript-line↔time linking, no `supplementing` motivation. quire/juncture only embed; the prototypes only do user-drawn regions. **This is the biggest hole on the axis.**
2. **`target.source.type` is NOT emitted by the only library.** `videojs-annotation` `toW3C` writes `target.type:'SpecificResource'` and a bare-string source — it never tags the source as `Video`/`Sound` (`w3c.js:155-166`). Only the throwaway OSD prototypes set `type:'Sound'`/`'Video'` (and only as a flat target, not SpecificResource). **No source reconciles both** (SpecificResource wrapper *and* typed AV source).
3. **OSD + AV is unsolved, only probed.** `multi-canvas-strip` is an honest experiment that concludes OSD's chrome is wrong for AV pages and the reference-strip selector is version-brittle. No repo cleanly integrates a deep-zoom image viewer with AV playback in one canvas sequence.
4. **No `Choice` (multi-lang) on AV bodies; no multiple-bodies-per-annotation (Bidar pattern) for AV** anywhere surveyed — every AV body is a single `TextualBody`.

## Verdict for our build (lift / study / avoid)
- **LIFT:** `videojs-annotation/src/js/lib/w3c.js` + `iiif.js` — the only framework-agnostic AV↔WADM↔AnnotationPage codec in the corpus, and it's the user's own MIT-ish fork. Patch the missing `target.source.type` for `Sound`/`Video` before use.
- **LIFT (as reference impl):** the three `osd-audio-video` HTML files — copy the selector builders, timeline, thumb-baking, time-entry modes verbatim into pure modules. They already speak our exact data model.
- **STUDY:** `multi-canvas-strip.html` as the cautionary tale on OSD+AV coexistence — its in-file findings argue *against* forcing AV through OSD's strip; prefer a media-type-aware viewer swap.
- **AVOID:** quire/juncture AV components — embed-only, framework-locked, no annotation or temporal model. Nothing to lift.
- **BUILD (no prior art):** transcript/caption-as-annotation; typed-AV-source-in-SpecificResource; AV `Choice`/multi-body. These are greenfield for our tool.
