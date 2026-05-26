<script lang="ts">
  // Studio AV authoring surface (CONTEXT §81 + user ruling archie-av Q-1): annotate audio/video BY HAND.
  // The temporal analogue of the OSD draw tool — play the recording, mark a region, create a note. The
  // notes list + WADM form live in the shared sidebar (App.svelte); this owns the player + marking.
  // Browser-only (<audio>/<video>) — verified in the browser, not headless.
  import { parseTimeFragment, activeNoteIndex, type W3CAnnotation, type TimeRange } from "@render/core";

  let {
    source,
    label,
    mediaType,
    annotations = [],
    selected = $bindable(null),
    oncreate,
    onimport,
  }: {
    source: string;
    label: string;
    mediaType?: "image" | "sound" | "video";
    annotations?: W3CAnnotation[];
    selected?: string | null;
    oncreate: (start: number, end: number) => void;
    onimport?: (text: string) => void;
  } = $props();

  let mediaEl = $state<HTMLMediaElement | null>(null);
  let currentTime = $state(0);
  let markedIn = $state<number | null>(null); // pending in-point (visible + abandonable, advisor #1)

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

  // Seek the player when a note is selected from the shared sidebar list.
  let prevSelected: string | null = null;
  $effect(() => {
    if (selected && selected !== prevSelected && mediaEl) {
      const a = annotations.find((n) => n.id === selected);
      const r = a ? rangeOf(a) : null;
      if (r) mediaEl.currentTime = r.start;
    }
    prevSelected = selected;
  });

  async function loadTranscript(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file && onimport) onimport(await file.text());
    input.value = ""; // allow re-importing the same file (append-only)
  }
  function setIn() { markedIn = mediaEl?.currentTime ?? currentTime; }
  // Create a note: from the marked in-point to here, or a 5s region at the playhead if none marked.
  function addNote() {
    const now = mediaEl?.currentTime ?? currentTime;
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
      <audio bind:this={mediaEl} src={source} controls ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></audio>
    </div>
  {/if}

  <!-- Marking bar — the temporal draw tool. Pending in-point is shown and dismissable. -->
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
  /* Listening-and-transcribing desk: the recording on the dark light-table, a forest-green marking bar.
     Matches the Viewer MediaPlayer stage; adds authoring controls. */
  .av { display: flex; flex-direction: column; height: 100%; background: var(--surface-canvas); }
  .stage, .av video { flex: 1; min-height: 0; }
  .stage { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-8); text-align: center; }
  .stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .stage h1 { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; margin: 0; color: var(--ink-canvas-primary); }
  .stage audio { width: min(36rem, 90%); margin-top: var(--space-2); }
  .av video { width: 100%; object-fit: contain; background: #000; }

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
