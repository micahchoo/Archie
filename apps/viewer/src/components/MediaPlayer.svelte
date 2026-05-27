<script lang="ts">
  // First-class AV note (CONTEXT §81): a Sound/Video object read against its transcript. The
  // supplementing Notes carry `t=start,end` ranges (transcript.ts wrote them); here we read them back
  // (parseTimeFragment) as a prose SPINE beside the media — clicking a line travels the audio (seek),
  // and playback lights the active line (activeNoteIndex on timeupdate). The same reading idiom as the
  // spatial NarrativeReader: AV is narrative over time. Import-only v1 — read-only, no recording.
  // Two read surfaces share that one `activeIdx`: the sequential transcript SPINE (right) and a
  // temporal MAP — a marker strip under the media showing WHERE on the recording each note falls
  // (read-only mirror of the Studio annotation timeline; HANDOFF "AV affordance pareto-hybrid").
  import { parseMediaFragment, activeNoteIndex, type RightsFields, type W3CAnnotation, type TimeRange } from "@render/core";
  import Credit from "./Credit.svelte";

  let {
    object,
    annotations = [],
    rights,
  }: {
    object: { source: string; label: string; mediaType?: "image" | "sound" | "video"; duration?: number };
    annotations?: W3CAnnotation[];
    /** The recording's credit/license (Q5) — AV is MUST-display too; shown by the title. */
    rights?: RightsFields;
  } = $props();

  let mediaEl = $state<HTMLMediaElement | null>(null);
  let currentTime = $state(0);
  let mediaDuration = $state(0); // actual length from `loadedmetadata`; the marker strip's denominator
  let mediaError = $state(false); // the recording's file failed to load (missing / unsupported codec)
  // The recording's length for positioning marks: the loaded media's own duration, else the published
  // value (voynich.ts o12 = 296s) so the strip can lay out before the file's metadata arrives.
  const dur = $derived(mediaDuration || object.duration || 0);

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
  // Travel the recording to a moment and play from there — the one motion both read surfaces share
  // (a transcript line, or a mark on the strip). Clamped so a stray click on the track can't overrun.
  function seekTo(t: number) {
    if (!mediaEl) return;
    mediaEl.currentTime = Math.max(0, dur ? Math.min(dur, t) : t);
    void mediaEl.play();
  }
  function seek(i: number) {
    const c = cues[i];
    if (c) seekTo(c.range.start);
  }
  // Click the bare strip (not a mark) → travel to that point in the recording (scrub the time axis).
  function trackSeek(e: MouseEvent, el: HTMLElement) {
    if (!dur) return;
    const r = el.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * dur);
  }
</script>

<div class="player" class:video={isVideo}>
  <main>
    <div class="media-region">
      <!-- The media on the dark light-table — same surface as the image canvas, so sound/image read
           as one kind of object. Controls are the native scrubber (read-only consumer). -->
      {#if mediaError}
        <p class="media-failed">This recording couldn’t be loaded — the file may be missing or in a format this browser can’t play.</p>
      {:else if isVideo}
        <div class="video-wrap">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={() => (mediaDuration = mediaEl?.duration ?? 0)} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
          <!-- Spatiotemporal note regions (ADR-0006): the box appears on the frame during its time window. -->
          <div class="box-overlay" aria-hidden="true">
            {#each videoBoxes as b (b.id)}<div class="rbox" class:active={b.active} style={`left:${b.box.x}%;top:${b.box.y}%;width:${b.box.w}%;height:${b.box.h}%`}></div>{/each}
          </div>
        </div>
      {:else}
        <div class="audio-stage">
          <span class="now">Now playing</span>
          <h1>{object.label}</h1>
          <audio bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={() => (mediaDuration = mediaEl?.duration ?? 0)} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></audio>
        </div>
      {/if}
    </div>

    <!-- Temporal MAP: where each transcript note falls across the recording's length — a read-only
         mirror of the Studio annotation timeline (HANDOFF "AV affordance pareto-hybrid"). The native
         scrubber can't be marked (shadow DOM), so this sibling strip carries the marks. Click a mark to
         travel there; the note now playing is inked (shared `activeIdx`); a quiet line tracks position. -->
    {#if cues.length > 0 && !mediaError}
      <div class="timeline">
        <span class="tl-label">Where the notes fall in the recording</span>
        <div class="tl-track" role="presentation" onclick={(e) => trackSeek(e, e.currentTarget)}>
          {#each cues as c, i (c.id)}
            <button type="button" class="tl-mark" class:active={i === activeIdx}
              style={`left:${(c.range.start / (dur || 1)) * 100}%; width:${Math.max(0.8, (((c.range.end ?? c.range.start) - c.range.start) / (dur || 1)) * 100)}%`}
              title={`${fmt(c.range.start)} · ${c.text}`}
              aria-label={`Note at ${fmt(c.range.start)}: ${c.text}`}
              onclick={(e) => { e.stopPropagation(); seekTo(c.range.start); }}></button>
          {/each}
          {#if dur}<div class="tl-cursor" style={`left:${(currentTime / dur) * 100}%`} aria-hidden="true"></div>{/if}
        </div>
      </div>
    {/if}
  </main>

  <aside>
    <p class="eyebrow">Transcript · {cues.length} lines</p>
    {#if isVideo}<h1 class="vid-label">{object.label}</h1>{/if}
    <p class="hint">Read down the transcript — the recording travels to each line. The line now playing is inked.</p>
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
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
  main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-canvas); }
  .media-region { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: var(--space-8); }

  /* Temporal map: the recording's full length as a strip, each note a mark at its moment (read-only
     mirror of the Studio .vtimeline — same tokens). A time axis, not a scrubber overlay: its width is
     the media column, not the rendered frame, so a letterboxed video still maps marks honestly. */
  .timeline { flex-shrink: 0; padding: var(--space-2) var(--space-6) var(--space-4); background: var(--surface-canvas-raised); border-top: 1px solid var(--border-canvas); }
  .tl-label { display: block; margin-bottom: var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .tl-track { position: relative; height: 1.5rem; background: var(--surface-canvas-overlay); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm); cursor: pointer; overflow: hidden; }
  .tl-mark { position: absolute; top: 2px; bottom: 2px; min-width: 3px; box-sizing: border-box; padding: 0; cursor: pointer; background: rgba(58, 107, 76, 0.35); border: 1px solid var(--accent); border-radius: 2px; transition: background 120ms ease; }
  .tl-mark:hover, .tl-mark.active { background: var(--accent); }
  .tl-mark:focus-visible { outline: 2px solid var(--ink-canvas-primary); outline-offset: 1px; z-index: 2; }
  .tl-cursor { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ink-canvas-primary); pointer-events: none; }

  .audio-stage { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); max-width: 32rem; text-align: center; }
  .audio-stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .audio-stage h1 { font-family: var(--font-display); font-weight: 600; font-size: 2rem; line-height: 1.1; margin: 0; color: var(--ink-canvas-primary); }
  .audio-stage audio { width: 100%; margin-top: var(--space-2); }
  /* Broken-media fallback (empty/error gate): a missing/undecodable recording, on the dark table. */
  .media-failed { max-width: 32rem; font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-canvas-secondary); text-align: center; padding: var(--space-6); border: 1px dashed var(--border-canvas-emphasis); border-radius: var(--radius-md); }
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
