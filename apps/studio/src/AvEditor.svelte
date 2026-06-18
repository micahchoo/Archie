<script lang="ts">
  // Studio AV authoring surface (CONTEXT §81 + archie-av Q-1; ADR-0006). Annotate audio/video BY HAND — the
  // temporal analogue of the OSD draw tool. AUDIO: a WaveSurfer WAVEFORM (drag = a `t=` cue; donor field-studio).
  // VIDEO: a plain <video> + a frame-draw OVERLAY — draw a box on a frame (the `xywh`, in PERCENT, donor
  // osd-audio-video/video-canvas.html) combined with the markbar's time window into a SPATIOTEMPORAL selector
  // `t=…&xywh=percent:…` via core `mediaFragmentValue`. Notes edit in the marker popover (App); browser-only.
  import { parseMediaFragment, activeNoteIndex, type W3CAnnotation, type TimeRange } from "@render/core";
  import { matches, typingInField } from "./shortcuts.js";

  type Box = { x: number; y: number; w: number; h: number };

  let {
    source,
    label,
    mediaType,
    annotations = [],
    selected = $bindable(null),
    oncreate,
    onimport,
    onmarkerrect,
  }: {
    source: string;
    label: string;
    mediaType?: "image" | "sound" | "video";
    annotations?: W3CAnnotation[];
    selected?: string | null;
    /** Create a time note (audio/video), optionally with a spatial frame region (video → spatiotemporal). */
    oncreate: (start: number, end: number, box?: Box) => void;
    onimport?: (text: string) => void;
    /** Screen-rect (VIEWPORT coords; host popover is position:fixed) of the selected cue's locus — an audio
     *  waveform region, or a video frame box. Null when nothing's selected / not resolvable (ADR-0006). */
    onmarkerrect?: (rect: { left: number; top: number; right: number; bottom: number } | null) => void;
  } = $props();

  let mediaEl = $state<HTMLMediaElement | null>(null); // video only
  let waveformEl = $state<HTMLDivElement | null>(null); // audio waveform container
  let overlayEl = $state<HTMLDivElement | null>(null); // video frame-draw overlay
  let currentTime = $state(0);
  let markedIn = $state<number | null>(null); // pending in-point (visible + abandonable)
  let isPlaying = $state(false);
  let wsReady = $state(false);
  let wsError = $state<string | null>(null); // decode/CORS failure (external URLs may block; local files don't)

  const isVideo = $derived(mediaType === "video");
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  // Parse the (possibly spatiotemporal) selector — one source for both the time range and the frame box.
  const fragOf = (a: W3CAnnotation) => {
    const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
    return v ? parseMediaFragment(v) : {};
  };
  const rangeOf = (a: W3CAnnotation): TimeRange | null => fragOf(a).time ?? null;
  const boxOf = (a: W3CAnnotation): Box | null => fragOf(a).box ?? null;

  const cues = $derived(annotations.map(rangeOf));
  const activeIdx = $derived(activeNoteIndex(cues, currentTime));
  const activeText = $derived.by(() => {
    const a = annotations[activeIdx];
    if (!a) return "";
    const b = Array.isArray(a.body) ? a.body[0] : a.body;
    return (b as { value?: string } | undefined)?.value ?? "";
  });
  // Plain-language label for the create button — states exactly what the note will cover, no "playhead"/"5s"/"in"
  // jargon. "0:12 → 0:42" (a span you marked) or "at 0:42" (a moment here); "box · " prefix when a video region is set.
  const addLabel = $derived.by(() => {
    const span = markedIn !== null ? `${fmt(markedIn)} → ${fmt(currentTime)}` : `at ${fmt(currentTime)}`;
    return `Add note (${isVideo && draftBox ? "box · " : ""}${span})`;
  });

  // --- VIDEO frame-draw (donor: video-canvas.html). The overlay box is PERCENT of the frame (resolution-
  // independent). Saved boxes show only while currentTime ∈ their [start,end]; the draft box previews the next. ---
  let spatialDrawing = $state(false); // toggled by "+ Add region on frame"
  let draftBox = $state<Box | null>(null); // the pending region for the next note
  let spatialDrag: { startX: number; startY: number } | null = null;
  const frameBoxes = $derived.by(() => {
    const out: { box: Box; sel: boolean }[] = [];
    for (const a of annotations) {
      const f = fragOf(a);
      if (f.box && f.time && currentTime >= f.time.start && currentTime <= (f.time.end ?? f.time.start)) {
        out.push({ box: f.box, sel: a.id === selected });
      }
    }
    return out;
  });
  // Video annotation TIMELINE (videojs-annotation affordance): each timed note is a range BAR on a strip
  // under the video — click to seek+select, the active one (currentTime ∈ range) lit, a playhead shows
  // position, hover shows the note text. Gives video the temporal map audio gets from its waveform.
  let duration = $state(0);
  const noteLead = (a: W3CAnnotation): string => {
    const b = Array.isArray(a.body) ? a.body[0] : a.body;
    return ((b as { value?: string } | undefined)?.value ?? "").trim();
  };
  const videoMarkers = $derived.by(() => {
    const out: { id: string; start: number; end: number; lead: string; sel: boolean; active: boolean }[] = [];
    for (const a of annotations) {
      const t = fragOf(a).time;
      if (!t || a.id == null) continue;
      const end = t.end ?? t.start;
      out.push({ id: a.id, start: t.start, end, lead: noteLead(a) || "(untitled)", sel: a.id === selected, active: currentTime >= t.start && currentTime <= end });
    }
    return out.sort((x, y) => x.start - y.start);
  });
  function selectMarker(id: string, start: number) { seek(start); selected = id; }
  // Arrow keys (←/→) step between annotations in time order — discoverability (videojs affordance).
  function stepMarker(dir: -1 | 1) {
    if (videoMarkers.length === 0) return;
    const i = videoMarkers.findIndex((m) => m.id === selected);
    const at = i < 0 ? (dir > 0 ? -1 : videoMarkers.length) : i;
    const next = videoMarkers[Math.max(0, Math.min(videoMarkers.length - 1, at + dir))];
    if (next) selectMarker(next.id, next.start);
  }
  // Click the timeline background → seek to that time (scrub the strip).
  function timelineSeek(e: MouseEvent, el: HTMLElement) {
    if (!duration) return;
    const r = el.getBoundingClientRect();
    seek(Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)));
  }
  function overlayDown(e: MouseEvent) {
    if (!spatialDrawing || !overlayEl) return;
    const r = overlayEl.getBoundingClientRect();
    spatialDrag = { startX: ((e.clientX - r.left) / r.width) * 100, startY: ((e.clientY - r.top) / r.height) * 100 };
    e.preventDefault();
  }
  function overlayMove(e: MouseEvent) {
    if (!spatialDrag || !overlayEl) return;
    const r = overlayEl.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const x = clamp(((e.clientX - r.left) / r.width) * 100);
    const y = clamp(((e.clientY - r.top) / r.height) * 100);
    draftBox = { x: Math.min(spatialDrag.startX, x), y: Math.min(spatialDrag.startY, y), w: Math.abs(x - spatialDrag.startX), h: Math.abs(y - spatialDrag.startY) };
  }
  function onWindowMouseUp() {
    if (spatialDrag) { spatialDrag = null; spatialDrawing = false; } // auto-exit drawing after one box (donor)
  }

  // --- WaveSurfer (audio only): the waveform IS the temporal draw surface. Regions = the `t=` cues. ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamically-imported browser lib (glue, not core)
  let ws: any = null;
  let wsRegions: any = null;
  let addingRegions = false; // guard: ignore `region-created` while we add EXISTING cues programmatically

  const playhead = (): number => (isVideo ? (mediaEl?.currentTime ?? currentTime) : (ws?.getCurrentTime?.() ?? currentTime));
  function seek(t: number) {
    if (isVideo) { if (mediaEl) mediaEl.currentTime = t; }
    else ws?.setTime?.(t);
  }
  function renderRegions() {
    if (!wsRegions || !wsReady) return;
    addingRegions = true;
    wsRegions.clearRegions();
    for (const a of annotations) {
      const r = rangeOf(a);
      if (r) wsRegions.addRegion({ id: a.id, start: r.start, end: r.end ?? r.start + 0.1, drag: false, resize: false, color: "rgba(240,99,28,0.14)" });
    }
    addingRegions = false;
  }
  // The selected cue's screen rect for the popover anchor (VIEWPORT coords). Audio → from the cue's time
  // fraction across the waveform container; Video → from the note's frame box across the <video> rect (the
  // box position is fixed in the frame, independent of playback time). Never strands at the page corner.
  function emitRegionRect() {
    if (!onmarkerrect) return;
    if (isVideo) {
      if (!mediaEl || selected == null) { onmarkerrect(null); return; }
      const vr = mediaEl.getBoundingClientRect();
      const box = (() => { const a = annotations.find((n) => n.id === selected); return a ? boxOf(a) : null; })();
      if (box) onmarkerrect({ left: vr.left + (box.x / 100) * vr.width, top: vr.top + (box.y / 100) * vr.height, right: vr.left + ((box.x + box.w) / 100) * vr.width, bottom: vr.top + ((box.y + box.h) / 100) * vr.height });
      else onmarkerrect({ left: vr.left, top: vr.top, right: vr.left + 8, bottom: vr.top + 8 }); // time-only note → top-left of the frame
      return;
    }
    if (!waveformEl || selected == null) { onmarkerrect(null); return; }
    const wf = waveformEl.getBoundingClientRect();
    if (wf.width === 0) { onmarkerrect(null); return; }
    const a = annotations.find((n) => n.id === selected);
    const r = a ? rangeOf(a) : null;
    const dur = ws?.getDuration?.() ?? 0;
    if (!r || !dur) { onmarkerrect({ left: wf.left, top: wf.top, right: wf.left + 8, bottom: wf.bottom }); return; }
    const sf = Math.max(0, Math.min(1, r.start / dur));
    const ef = Math.max(sf, Math.min(1, (r.end ?? r.start) / dur));
    onmarkerrect({ left: wf.left + sf * wf.width, top: wf.top, right: wf.left + ef * wf.width, bottom: wf.bottom });
  }

  // Initialise WaveSurfer for an audio object (dynamic import — never runs for video or during SSR).
  $effect(() => {
    if (isVideo || !waveformEl || !source) return;
    wsReady = false;
    wsError = null;
    let disposed = false;
    let disableDrag: (() => void) | null = null;
    (async () => {
      const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/dist/plugins/regions.js"),
      ]);
      if (disposed || !waveformEl) return;
      const regions = RegionsPlugin.create();
      const instance = WaveSurfer.create({
        container: waveformEl,
        url: source,
        height: 96,
        waveColor: "#8593A8",
        progressColor: "#F0631C",
        cursorColor: "#B86450",
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        plugins: [regions],
      });
      ws = instance;
      wsRegions = regions;
      instance.on("ready", () => {
        wsReady = true;
        renderRegions();
        disableDrag = regions.enableDragSelection({ color: "rgba(240,99,28,0.20)" });
        emitRegionRect();
      });
      instance.on("error", (err: unknown) => { wsError = err instanceof Error ? err.message : String(err); });
      instance.on("timeupdate", (t: number) => { currentTime = t; });
      instance.on("play", () => (isPlaying = true));
      instance.on("pause", () => (isPlaying = false));
      instance.on("finish", () => (isPlaying = false));
      regions.on("region-created", (region: { start: number; end: number; remove: () => void }) => {
        if (addingRegions) return;
        const { start, end } = region;
        region.remove();
        oncreate(start, Math.max(end, start + 0.1));
      });
      regions.on("region-clicked", (region: { id: string; start: number }, e: MouseEvent) => {
        e.stopPropagation();
        instance.setTime(region.start);
        selected = region.id;
      });
    })();
    return () => {
      disposed = true;
      disableDrag?.();
      ws?.destroy?.();
      ws = null;
      wsRegions = null;
      wsReady = false;
    };
  });

  // Re-render audio regions on cue-set change; re-anchor the popover on selection / readiness / time.
  $effect(() => { void annotations; if (wsReady) { renderRegions(); emitRegionRect(); } });
  $effect(() => { void selected; void wsReady; void currentTime; emitRegionRect(); });

  // Seek the player when a note is selected from the shared sidebar list (audio WS + video).
  let prevSelected: string | null = null;
  $effect(() => {
    if (selected && selected !== prevSelected) {
      const r = (() => { const a = annotations.find((n) => n.id === selected); return a ? rangeOf(a) : null; })();
      if (r) seek(r.start);
    }
    prevSelected = selected;
  });

  async function loadTranscript(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file && onimport) onimport(await file.text());
    input.value = "";
  }
  function setIn() { markedIn = playhead(); }
  // Create a note: time window (marked in → here, or 5s at the playhead) + the draft frame box (video → spatiotemporal).
  function addNote() {
    const now = playhead();
    const start = markedIn ?? now;
    const end = markedIn !== null ? Math.max(now, markedIn + 0.1) : now + 5;
    markedIn = null;
    const box = isVideo && draftBox ? draftBox : undefined;
    draftBox = null;
    oncreate(start, end, box);
  }
  function togglePlay() {
    if (isVideo) { if (mediaEl) { if (mediaEl.paused) void mediaEl.play(); else mediaEl.pause(); } }
    else ws?.playPause?.();
  }
  // AV keyboard shortcuts (registry-driven). Active whenever this editor is mounted (an AV object is open).
  // Space / ← → defer to the native <video> controls when the video element itself is focused.
  function onAvKey(e: KeyboardEvent) {
    if (typingInField(e)) return;
    const onMedia = e.target === mediaEl;
    if (matches(e, "Space") && !onMedia) { e.preventDefault(); togglePlay(); }
    else if (matches(e, "←") && !onMedia) { e.preventDefault(); stepMarker(-1); }
    else if (matches(e, "→") && !onMedia) { e.preventDefault(); stepMarker(1); }
    else if (matches(e, "I")) { e.preventDefault(); setIn(); }
    else if (matches(e, "N")) { e.preventDefault(); addNote(); }
    else if (matches(e, "B") && isVideo) { e.preventDefault(); spatialDrawing = !spatialDrawing; }
  }
</script>

<svelte:window onmouseup={onWindowMouseUp} onkeydown={onAvKey} />

<div class="av" class:video={isVideo}>
  {#if isVideo}
    <div class="video-wrap" class:capturing={spatialDrawing}>
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={mediaEl} src={source} controls
        onloadedmetadata={() => (duration = mediaEl?.duration ?? 0)}
        ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
      <!-- Frame-draw overlay: pointer-events:none normally (so the video controls work); auto when drawing.
           Boxes are PERCENT of the frame; saved boxes show only during their time window (donor). -->
      <div class="frame-overlay" class:drawing={spatialDrawing} bind:this={overlayEl} role="presentation" onmousedown={overlayDown} onmousemove={overlayMove}>
        {#each frameBoxes as fb}<div class="frame-box" class:sel={fb.sel} style={`left:${fb.box.x}%;top:${fb.box.y}%;width:${fb.box.w}%;height:${fb.box.h}%`}></div>{/each}
        {#if draftBox}<div class="frame-box draft" style={`left:${draftBox.x}%;top:${draftBox.y}%;width:${draftBox.w}%;height:${draftBox.h}%`}></div>{/if}
      </div>
      {#if spatialDrawing}<div class="capture-hint" aria-hidden="true">Drawing a box — drag on the video</div>{/if}
    </div>
    <!-- Annotation timeline (videojs affordance): notes as range bars; click to seek+select, hover for the
         text, ← → to step between them, playhead shows where you are. -->
    <div class="vtimeline" role="group" aria-label="Notes timeline — focus a bar, then ← → step between notes">
      <div class="vt-track" role="presentation" onclick={(e) => timelineSeek(e, e.currentTarget as HTMLElement)}>
        {#each videoMarkers as m (m.id)}
          <button type="button" class="vt-bar" class:sel={m.sel} class:active={m.active}
            style={`left:${(m.start / (duration || 1)) * 100}%; width:${Math.max(0.8, ((m.end - m.start) / (duration || 1)) * 100)}%`}
            title={`${fmt(m.start)}–${fmt(m.end)} · ${m.lead}`}
            onclick={(e) => { e.stopPropagation(); selectMarker(m.id, m.start); }}>{m.lead}</button>
        {/each}
        {#if duration}<div class="vt-playhead" style={`left:${(currentTime / duration) * 100}%`} aria-hidden="true"></div>{/if}
      </div>
      {#if videoMarkers.length === 0}<span class="vt-empty">No notes yet. Mark a moment, then add a note — it appears here as a bar.</span>{/if}
    </div>
  {:else}
    <div class="stage">
      <span class="now">Adding notes to</span>
      <h1>{label}</h1>
      <div class="wave" bind:this={waveformEl}></div>
      <div class="transport">
        <button class="play" onclick={() => ws?.playPause?.()} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? "⏸ Pause" : "▶ Play"}</button>
        <span class="wave-hint">{wsError ? "Couldn't load this audio. A file hosted elsewhere may block playback — try adding a local copy." : wsReady ? "Drag across the waveform to mark a moment, then write your note · click a marked stretch to edit it" : "Loading waveform…"}</span>
      </div>
    </div>
  {/if}

  <!-- Annotate bar: where you are in the recording, optionally a start mark + (video) a box, then Add note.
       Copy is plain-language for a curator — no "in-point / playhead / frame" jargon. -->
  <div class="markbar">
    <span class="now-lbl">Now at</span><span class="clock" title="Where you are in the recording">{fmt(currentTime)}</span>
    {#if markedIn !== null}
      <span class="chip" title="The note will run from here to the current time">from {fmt(markedIn)}<button class="x" title="Clear the start mark" onclick={() => (markedIn = null)}>✕</button></span>
    {/if}
    {#if isVideo}
      <button class="region-toggle" class:on={spatialDrawing} onclick={() => (spatialDrawing = !spatialDrawing)} title="Pause the video, then drag a box to point at a spot on the picture. The note covers that spot at this moment.">{spatialDrawing ? "Drawing… drag on the video" : draftBox ? "▭ box set · draw again" : "▭ Draw a box on the video"}</button>
    {/if}
    <button class="mark" onclick={setIn} title="Set where the note begins. The note runs from here to wherever you are when you add it. Skip this to note a single moment.">Mark start</button>
    <button class="add" onclick={addNote} title="Create a note covering this moment">{addLabel}</button>
    {#if onimport}
      <label class="import" title="Add a caption file (.vtt or .srt) — each caption line becomes a note at its own time">⊕ Add captions<input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onchange={loadTranscript} /></label>
    {/if}
    {#if activeText}<span class="active" title={activeText}>▸ {activeText}</span>{/if}
  </div>
</div>

<style>
  /* Listening-and-transcribing desk: the recording on the warm paper light-table, a quiet marking bar. */
  .av { display: flex; flex-direction: column; height: 100%; background: var(--surface-canvas); }
  .stage, .video-wrap { flex: 1; min-height: 0; }
  .stage { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-8); text-align: center; }
  .stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .stage h1 { font-family: var(--font-display); font-weight: 300; font-size: 2.4rem; line-height: 1.15; margin: 0; color: var(--ink-canvas-primary); text-shadow: var(--shadow-text-haze); }

  /* Video + its frame-draw overlay (the overlay sits exactly over the video box). */
  .video-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .video-wrap video { width: 100%; height: 100%; object-fit: contain; background: var(--moss-shadow); border-radius: var(--radius-md); }
  .frame-overlay { position: absolute; inset: 0; pointer-events: none; }
  .frame-overlay.drawing { pointer-events: auto; cursor: cell; }
  .frame-box { position: absolute; box-sizing: border-box; border: 1.5px solid var(--accent); background: rgba(240, 99, 28, 0.10); border-radius: var(--radius-sm); pointer-events: none; }
  .frame-box.sel { border-color: var(--accent); box-shadow: var(--shadow-signal-glow); }
  .frame-box.draft { border-style: dashed; border-color: var(--accent-2); background: rgba(92, 107, 190, 0.08); }
  /* Capture-mode signal (videojs affordance): a clear "you're marking now" state on the video. */
  .video-wrap.capturing { outline: 1.5px solid var(--accent); outline-offset: -3px; border-radius: var(--radius-md); }
  .capture-hint { position: absolute; top: var(--space-3); left: 50%; transform: translateX(-50%); pointer-events: none; font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-on-accent); background: var(--accent); padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); box-shadow: var(--shadow-signal-glow); }

  /* Annotation timeline — each timed note is a range bar (videojs affordance); the video's temporal map. */
  .vtimeline { position: relative; padding: var(--space-2) var(--space-5); background: var(--surface-canvas-raised); }
  .vtimeline:focus-visible { outline: 1.5px solid var(--accent-2); outline-offset: -2px; border-radius: var(--radius-sm); }
  .vt-track { position: relative; height: 1.5rem; background: var(--surface-canvas-overlay); border-radius: var(--radius-sm); cursor: pointer; overflow: hidden; box-shadow: var(--shadow-inset-fog); }
  .vt-bar { position: absolute; top: 2px; bottom: 2px; min-width: 3px; box-sizing: border-box; padding: 0 var(--space-2); cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.04em; line-height: calc(1.5rem - 4px); text-align: left; color: var(--ink-canvas-primary); background: var(--accent-2-muted); border-radius: var(--radius-sm); transition: background 0.18s ease, color 0.18s ease; }
  .vt-bar:hover { background: var(--accent-2); color: var(--ink-on-accent); }
  .vt-bar.active { background: var(--accent); color: var(--ink-on-accent); }
  .vt-bar.sel { box-shadow: inset 0 -2px 0 var(--accent); z-index: 2; }
  .vt-playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); pointer-events: none; }
  .vt-empty { display: block; margin-top: var(--space-1); font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-muted); }

  .wave { width: min(48rem, 92%); margin-top: var(--space-2); min-height: 96px; padding: var(--space-2); background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }
  .transport { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; justify-content: center; }
  .transport .play { cursor: pointer; font-family: var(--font-ui); font-weight: 500; font-size: var(--text-ui-sm); letter-spacing: 0.02em; padding: var(--space-2) var(--space-4); background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low); transition: background 0.18s ease, border-color 0.18s ease; }
  .transport .play:hover { background: var(--surface-canvas-overlay); border-color: var(--border-canvas-emphasis); }
  .transport .wave-hint { font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.04em; color: var(--ink-canvas-secondary); }

  .markbar {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--surface-canvas-raised); box-shadow: var(--shadow-lift-low);
  }
  .now-lbl { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .clock { font-family: var(--font-mono); font-size: var(--text-ui-sm); color: var(--ink-canvas-primary); min-width: 3.5rem; }
  .chip { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-2); background: var(--accent-2-muted); border-radius: var(--radius-sm); padding: 2px var(--space-2) 2px var(--space-3); }
  .chip .x { background: none; border: none; cursor: pointer; color: var(--accent-2); font-size: 0.7rem; padding: 0; }
  .markbar button { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease; }
  .markbar .mark { background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); font-family: var(--font-ui); letter-spacing: 0.02em; border: 1px solid var(--border-canvas); box-shadow: var(--shadow-lift-low); }
  .markbar .mark:hover { background: var(--surface-canvas-overlay); border-color: var(--border-canvas-emphasis); }
  .markbar .add { background: var(--accent); color: var(--ink-on-accent); font-family: var(--font-ui); font-weight: 500; letter-spacing: 0.02em; border: none; box-shadow: var(--shadow-signal-glow); }
  .markbar .add:hover { background: var(--accent-hover); }
  .markbar .region-toggle { background: var(--surface-canvas-raised); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas); box-shadow: var(--shadow-lift-low); }
  .markbar .region-toggle:hover { border-color: var(--accent-2); color: var(--accent-2); }
  .markbar .region-toggle.on { background: var(--accent-2-muted); color: var(--accent-2); border-color: var(--accent-2); }
  .markbar .import { display: inline-flex; align-items: center; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); letter-spacing: 0.02em; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); color: var(--ink-canvas-secondary); background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); box-shadow: var(--shadow-lift-low); transition: border-color 0.18s ease, color 0.18s ease; }
  .markbar .import:hover { color: var(--accent-2); border-color: var(--accent-2); }
  .markbar .import input { display: none; }
  .markbar .active { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-canvas-secondary); margin-left: auto; max-width: 40%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
