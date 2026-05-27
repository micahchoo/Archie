<script lang="ts">
  // First-class AV note (CONTEXT §81): a Sound/Video object read against its transcript. The
  // supplementing Notes carry `t=start,end` ranges (transcript.ts wrote them); here we read them back
  // (parseTimeFragment) as a prose SPINE beside the media — clicking a line travels the audio (seek),
  // and playback lights the active line (activeNoteIndex on timeupdate). The same reading idiom as the
  // spatial NarrativeReader: AV is narrative over time. Import-only v1 — read-only, no recording.
  import { parseMediaFragment, activeNoteIndex, type W3CAnnotation, type TimeRange } from "@render/core";

  let {
    object,
    annotations = [],
  }: {
    object: { source: string; label: string; mediaType?: "image" | "sound" | "video"; duration?: number };
    annotations?: W3CAnnotation[];
  } = $props();

  let mediaEl = $state<HTMLMediaElement | null>(null);
  let currentTime = $state(0);

  const bodyText = (a: W3CAnnotation): string => {
    const b = Array.isArray(a.body) ? a.body[0] : a.body;
    return (b as { value?: string } | undefined)?.value ?? "";
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  interface Cue { id: string; text: string; range: TimeRange; box?: { x: number; y: number; w: number; h: number }; }
  // Notes carrying a temporal selector, sorted by start — the transcript spine. A video note may also carry
  // a spatial box (`t=…&xywh=percent:…`, ADR-0006) read via parseMediaFragment.
  const cues = $derived.by<Cue[]>(() => {
    const out: Cue[] = [];
    for (const a of annotations) {
      const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
      const f = v ? parseMediaFragment(v) : {};
      if (f.time) out.push({ id: a.id, text: bodyText(a), range: f.time, ...(f.box ? { box: f.box } : {}) });
    }
    return out.sort((x, y) => x.range.start - y.range.start);
  });
  const activeIdx = $derived(activeNoteIndex(cues.map((c) => c.range), currentTime));
  // Spatiotemporal regions visible at the current moment — each box shows while currentTime ∈ its window;
  // the active cue's box is emphasised. The read-side mirror of the Studio's frame-draw (ADR-0006).
  const videoBoxes = $derived.by(() =>
    cues
      .filter((c) => c.box && currentTime >= c.range.start && currentTime <= (c.range.end ?? c.range.start))
      .map((c) => ({ id: c.id, box: c.box!, active: cues[activeIdx]?.id === c.id })),
  );

  const isVideo = $derived(object.mediaType === "video");
  function seek(i: number) {
    const c = cues[i];
    if (!c || !mediaEl) return;
    mediaEl.currentTime = c.range.start;
    void mediaEl.play();
  }
</script>

<div class="player" class:video={isVideo}>
  <main>
    <!-- The media on the dark light-table — same surface as the image canvas, so sound/image read
         as one kind of object. Controls are the native scrubber (read-only consumer). -->
    {#if isVideo}
      <div class="video-wrap">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={mediaEl} src={object.source} controls ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
        <!-- Spatiotemporal note regions (ADR-0006): the box appears on the frame during its time window. -->
        <div class="box-overlay" aria-hidden="true">
          {#each videoBoxes as b (b.id)}<div class="rbox" class:active={b.active} style={`left:${b.box.x}%;top:${b.box.y}%;width:${b.box.w}%;height:${b.box.h}%`}></div>{/each}
        </div>
      </div>
    {:else}
      <div class="audio-stage">
        <span class="now">Now playing</span>
        <h1>{object.label}</h1>
        <audio bind:this={mediaEl} src={object.source} controls ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></audio>
      </div>
    {/if}
  </main>

  <aside>
    <p class="eyebrow">Transcript · {cues.length} lines</p>
    {#if isVideo}<h1 class="vid-label">{object.label}</h1>{/if}
    <p class="hint">Read down the transcript — the recording travels to each line. The line now playing is inked.</p>
    {#if cues.length === 0}
      <p class="empty">No transcript for this recording.</p>
    {:else}
      <ol class="cues">
        {#each cues as c, i (c.id)}
          <li>
            <button class:active={i === activeIdx} onclick={() => seek(i)}>
              <span class="t">{fmt(c.range.start)}</span>
              <span class="line">{c.text}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </aside>
</div>

<style>
  /* Listening station: dark media surface (left) + warm-paper transcript spine (right); the active
     line is inked forest-green — the NarrativeReader idiom, applied to time instead of space. */
  .player { display: flex; height: 100vh; background: var(--surface-canvas); }
  main { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; background: var(--surface-canvas); padding: var(--space-8); }

  .audio-stage { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); max-width: 32rem; text-align: center; }
  .audio-stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .audio-stage h1 { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; margin: 0; color: var(--ink-canvas-primary); }
  .audio-stage audio { width: 100%; margin-top: var(--space-2); }
  /* The wrap hugs the rendered video so the overlay aligns with the frame (boxes are % of the frame). */
  .video-wrap { position: relative; display: inline-block; max-width: 100%; max-height: 100%; line-height: 0; }
  .video-wrap video { display: block; max-width: 100%; max-height: 84vh; }
  .box-overlay { position: absolute; inset: 0; pointer-events: none; }
  .rbox { position: absolute; box-sizing: border-box; border: 2px solid var(--accent); background: rgba(58, 107, 76, 0.1); border-radius: 2px; }
  .rbox.active { box-shadow: 0 0 0 2px rgba(58, 107, 76, 0.45); background: rgba(58, 107, 76, 0.18); }

  aside {
    width: 420px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-6) var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  .eyebrow { color: var(--accent); font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
  .vid-label { font-family: var(--font-display); font-weight: 600; font-size: 1.6rem; line-height: 1.1; margin: var(--space-2) 0 0; color: var(--ink-paper-primary); }
  .hint { font-family: var(--font-ui); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); margin: var(--space-3) 0 var(--space-5); }

  .cues { list-style: none; margin: 0; padding: 0; }
  .cues li { margin-bottom: var(--space-2); }
  .cues button {
    display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: var(--space-3);
    width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .cues button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }
  .cues button.active { border-left-color: var(--accent); background: var(--accent-muted); }
  .t { font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent); }
  .line { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.5; color: var(--ink-paper-primary); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-paper-secondary); padding: var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); }
</style>
