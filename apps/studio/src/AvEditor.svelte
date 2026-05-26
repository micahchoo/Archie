<script lang="ts">
  // Studio AV authoring surface (CONTEXT §81 + archie-av Q-1; audio waveform per user 2026-05-26). Annotate
  // audio/video BY HAND — the temporal analogue of the OSD draw tool. For AUDIO the player is a WaveSurfer
  // WAVEFORM (you SEE where sound is, donor: field-studio AudioWaveform.svelte): drag across it to mark a
  // moment (a Region = a `t=` cue), click a region to select its note. For VIDEO it stays a plain <video>
  // (spatiotemporal frame-annotation is Wave 2, ADR-0006). The notes list + form live in App's sidebar.
  // Browser-only — verified in the browser, not headless. WaveSurfer is dynamically imported (no SSR/Node load).
  import { parseTimeFragment, activeNoteIndex, type W3CAnnotation, type TimeRange } from "@render/core";

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
    oncreate: (start: number, end: number) => void;
    onimport?: (text: string) => void;
    /** Screen-rect of the selected AUDIO cue's waveform region (relative to this editor's root), so the host
     *  can anchor the note popover to it — the audio twin of Canvas's marker rect (ADR-0006). Null for video
     *  (no region locus yet — Wave 2) or when nothing's selected. */
    onmarkerrect?: (rect: { left: number; top: number; right: number; bottom: number } | null) => void;
  } = $props();

  let mediaEl = $state<HTMLMediaElement | null>(null); // video only
  let waveformEl = $state<HTMLDivElement | null>(null); // audio waveform container
  let currentTime = $state(0);
  let markedIn = $state<number | null>(null); // pending in-point (visible + abandonable)
  let isPlaying = $state(false);
  let wsReady = $state(false);
  let wsError = $state<string | null>(null); // decode/CORS failure (external URLs may block; local files don't)

  const isVideo = $derived(mediaType === "video");
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const rangeOf = (a: W3CAnnotation): TimeRange | null => {
    const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
    return v ? parseTimeFragment(v) : null;
  };

  const cues = $derived(annotations.map(rangeOf));
  const activeIdx = $derived(activeNoteIndex(cues, currentTime));
  const activeText = $derived.by(() => {
    const a = annotations[activeIdx];
    if (!a) return "";
    const b = Array.isArray(a.body) ? a.body[0] : a.body;
    return (b as { value?: string } | undefined)?.value ?? "";
  });

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
  // Render existing cues as non-draggable regions (a new selection re-renders; addingRegions suppresses the
  // create handler so re-adds don't look like fresh user draws).
  function renderRegions() {
    if (!wsRegions || !wsReady) return;
    addingRegions = true;
    wsRegions.clearRegions();
    for (const a of annotations) {
      const r = rangeOf(a);
      if (r) wsRegions.addRegion({ id: a.id, start: r.start, end: r.end ?? r.start + 0.1, drag: false, resize: false, color: "rgba(58,107,76,0.18)" });
    }
    addingRegions = false;
  }
  // The selected audio cue's region rect, relative to this editor's root — App anchors the note popover here
  // (the audio twin of Canvas's marker rect). Null for video (no region locus) or no selection.
  function emitRegionRect() {
    if (!onmarkerrect) return;
    if (isVideo || selected == null) { onmarkerrect(null); return; }
    const region = wsRegions?.getRegions?.().find((r: { id: string }) => r.id === selected) as { element?: HTMLElement } | undefined;
    // Anchor to the selected cue's region element; fall back to the waveform itself so the popover is always
    // NEAR the wave (never stranded at the page corner) even if a region lookup misses. VIEWPORT coords
    // (the popover is position:fixed) — no offset-parent math.
    const el = region?.element ?? waveformEl;
    if (!el) { onmarkerrect(null); return; }
    const rr = el.getBoundingClientRect();
    onmarkerrect({ left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom });
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
        waveColor: "#8a8475", // muted ink on the dark table
        progressColor: "#3a6b4c", // forest-green accent (system.md)
        cursorColor: "#3a6b4c",
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
        // Enable drag-to-create only AFTER decode, when the waveform is interactive (binding it before
        // 'ready' attaches to nothing). Drag across the waveform → a new cue; temp region removed, the real
        // one re-renders from `annotations` once App creates the note.
        disableDrag = regions.enableDragSelection({ color: "rgba(58,107,76,0.25)" });
        emitRegionRect();
      });
      instance.on("error", (err: unknown) => { wsError = err instanceof Error ? err.message : String(err); });
      instance.on("timeupdate", (t: number) => { currentTime = t; });
      instance.on("play", () => (isPlaying = true));
      instance.on("pause", () => (isPlaying = false));
      instance.on("finish", () => (isPlaying = false));
      regions.on("region-created", (region: { start: number; end: number; remove: () => void }) => {
        if (addingRegions) return; // programmatic (existing cue) — not a user draw
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

  // Re-render regions when the cue set changes (a created/deleted/edited note).
  $effect(() => { void annotations; if (wsReady) { renderRegions(); emitRegionRect(); } });
  // Anchor the popover to the selected cue's region (re-emit when the selection or readiness changes).
  $effect(() => { void selected; void wsReady; emitRegionRect(); });

  // Seek the player when a note is selected from the shared sidebar list (works for audio WS + video).
  let prevSelected: string | null = null;
  $effect(() => {
    if (selected && selected !== prevSelected) {
      const a = annotations.find((n) => n.id === selected);
      const r = a ? rangeOf(a) : null;
      if (r) seek(r.start);
    }
    prevSelected = selected;
  });

  async function loadTranscript(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file && onimport) onimport(await file.text());
    input.value = ""; // allow re-importing the same file (append-only)
  }
  function setIn() { markedIn = playhead(); }
  // Create a note: from the marked in-point to here, or a 5s region at the playhead if none marked.
  function addNote() {
    const now = playhead();
    const start = markedIn ?? now;
    const end = markedIn !== null ? Math.max(now, markedIn + 0.1) : now + 5;
    markedIn = null;
    oncreate(start, end);
  }
</script>

<div class="av" class:video={isVideo}>
  {#if isVideo}
    <video bind:this={mediaEl} src={source} controls ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
  {:else}
    <div class="stage">
      <span class="now">Now annotating</span>
      <h1>{label}</h1>
      <!-- The waveform IS the temporal draw surface (drag to mark a moment; regions = the cues). -->
      <div class="wave" bind:this={waveformEl}></div>
      <div class="transport">
        <button class="play" onclick={() => ws?.playPause?.()} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? "⏸ Pause" : "▶ Play"}</button>
        <span class="wave-hint">{wsError ? `Couldn't load audio (${wsError}) — an external URL may block decoding; import a local file.` : wsReady ? "Drag across the waveform to mark a moment · click a region to select its note" : "Loading waveform…"}</span>
      </div>
    </div>
  {/if}

  <!-- Marking bar — the button path to the temporal draw (works alongside waveform drag). -->
  <div class="markbar">
    <span class="clock">{fmt(currentTime)}</span>
    {#if markedIn !== null}
      <span class="chip">In {fmt(markedIn)}<button class="x" title="Clear in-point" onclick={() => (markedIn = null)}>✕</button></span>
    {/if}
    <button class="mark" onclick={setIn}>Set in</button>
    <button class="add" onclick={addNote}>{markedIn !== null ? "Add note (in → here)" : "Add note (5s at playhead)"}</button>
    {#if onimport}
      <label class="import" title="Append a WebVTT/SRT transcript as time notes (append-only)">⊕ Import VTT/SRT<input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onchange={loadTranscript} /></label>
    {/if}
    {#if activeText}<span class="active" title={activeText}>▸ {activeText}</span>{/if}
  </div>
</div>

<style>
  /* Listening-and-transcribing desk: the recording on the dark light-table, a forest-green marking bar. */
  .av { display: flex; flex-direction: column; height: 100%; background: var(--surface-canvas); }
  .stage, .av video { flex: 1; min-height: 0; }
  .stage { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-8); text-align: center; }
  .stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .stage h1 { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; margin: 0; color: var(--ink-canvas-primary); }
  .av video { width: 100%; object-fit: contain; background: #000; }

  /* WaveSurfer mounts its canvas into .wave; the transport row sits under it (WS has no native controls). */
  .wave { width: min(48rem, 92%); margin-top: var(--space-2); min-height: 96px; }
  .transport { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; justify-content: center; }
  .transport .play { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); font-weight: 600; padding: var(--space-1) var(--space-4); background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); border-radius: var(--radius-sm); }
  .transport .play:hover { background: var(--accent-hover); }
  .transport .wave-hint { font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); }

  .markbar {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--surface-canvas-raised); border-top: 1px solid var(--border-canvas);
  }
  .clock { font-family: var(--font-mono); font-size: var(--text-ui-sm); color: var(--ink-canvas-secondary); min-width: 3.5rem; }
  .chip { display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--accent); background: var(--accent-muted); border: 1px solid var(--accent); border-radius: 999px; padding: 2px var(--space-2) 2px var(--space-3); }
  .chip .x { background: none; border: none; cursor: pointer; color: var(--accent); font-size: 0.7rem; padding: 0; }
  .markbar button { cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); }
  .markbar .mark { background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); border: 1px solid var(--border-canvas); }
  .markbar .mark:hover { border-color: var(--accent); color: var(--accent); }
  .markbar .add { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .markbar .import { display: inline-flex; align-items: center; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-ui-sm); padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); color: var(--ink-canvas-secondary); background: var(--surface-canvas-overlay); border: 1px dashed var(--border-canvas-emphasis); }
  .markbar .import:hover { color: var(--accent); border-color: var(--accent); }
  .markbar .import input { display: none; }
  .markbar .active { font-family: var(--font-body); font-size: 0.9rem; color: var(--ink-canvas-secondary); margin-left: auto; max-width: 40%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
