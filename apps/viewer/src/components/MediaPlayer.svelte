<script lang="ts">
  // First-class AV note (CONTEXT §81): a Sound/Video object read against its transcript. The
  // supplementing Notes carry `t=start,end` ranges (transcript.ts wrote them); here we read them back
  // (parseTimeFragment) as a prose SPINE beside the media — clicking a line travels the audio (seek),
  // and playback lights the active line (activeNoteIndex on timeupdate). The same reading idiom as the
  // spatial NarrativeReader: AV is narrative over time. Import-only v1 — read-only, no recording.
  // Two read surfaces share that one `activeIdx`: the sequential transcript SPINE (right) and a
  // temporal MAP — a marker strip under the media showing WHERE on the recording each note falls
  // (read-only mirror of the Studio annotation timeline; HANDOFF "AV affordance pareto-hybrid").
  import { parseMediaFragment, activeNoteIndex, transcriptTextOf, type RightsFields, type W3CAnnotation, type TimeRange } from "@render/core";
  import { clampSeekStart } from "../av-landing.js";
  import Credit from "./Credit.svelte";
  import SidebarObjectNav from "./SidebarObjectNav.svelte";

  let {
    object,
    annotations = [],
    rights,
    initialSeek,
    onback,
    siblings,
    currentId,
    onstep,
    onoverview,
  }: {
    object: { source: string; label: string; mediaType?: "image" | "sound" | "video"; duration?: number };
    annotations?: W3CAnnotation[];
    /** The recording's credit/license (Q5) — AV is MUST-display too; shown by the title. */
    rights?: RightsFields;
    /** Deep-link time offset (#/<slug>/a/<id>?t=…, Phase 3 / 4.7): on `loadedmetadata` the playhead seeks
     *  to this clamped offset PAUSED — section-142: landing seeks but must NOT auto-play, so this does NOT
     *  go through `seekTo` (which couples play()). Garbage / out-of-range → head (0). */
    initialSeek?: string;
    /** Escape-out (ADR-0016 §137/§223): an AV object opened FROM the narrative index needs a step back
     *  to that index, else it dead-end-traps the visitor (the carousel/breadcrumb don't serve it). Optional
     *  + back-compat — absent (single AV, AV-in-grid carry their own nav) hides the affordance. */
    onback?: () => void;
    /** Multi-object exhibit (R4): an AV-in-grid recording carries the same visible sidebar stepper as the
     *  image Reader, so stepping/overview work the same whatever the medium. Omitted for single AV. */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview?: () => void;
  } = $props();

  const objectNav = $derived(
    !!siblings && siblings.length > 1 && !!currentId && !!onstep && !!onoverview,
  );

  let mediaEl = $state<HTMLMediaElement | null>(null);
  let currentTime = $state(0);
  let mediaDuration = $state(0); // actual length from `loadedmetadata`; the marker strip's denominator
  let mediaError = $state(false); // the recording's file failed to load (missing / unsupported codec)
  let mediaReady = $state(false); // metadata arrived — until then a heavy recording is a dead box (#10)
  // The recording's length for positioning marks: the loaded media's own duration, else the published
  // value (voynich.ts o12 = 296s) so the strip can lay out before the file's metadata arrives.
  const dur = $derived(mediaDuration || object.duration || 0);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  interface Cue { id: string; text: string; range: TimeRange; box?: { x: number; y: number; w: number; h: number }; }
  // Notes carrying a temporal selector, sorted by start — the transcript spine. A video note may also carry
  // a spatial box (`t=…&xywh=percent:…`, ADR-0006) read via parseMediaFragment.
  const cues = $derived.by<Cue[]>(() => {
    const out: Cue[] = [];
    for (const a of annotations) {
      const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
      const f = v ? parseMediaFragment(v) : {};
      if (f.time) out.push({ id: a.id, text: transcriptTextOf(a), range: f.time, ...(f.box ? { box: f.box } : {}) });
    }
    return out.sort((x, y) => x.range.start - y.range.start);
  });
  const activeIdx = $derived(activeNoteIndex(cues.map((c) => c.range), currentTime));
  // Whole-object (Object-level) Notes on this recording (ADR-0018): a bare-IRI / selectorless target
  // carries NO time fragment, so `cues` drops it — yet it applies to the WHOLE recording. Render it as a
  // persistent band (the AV analogue of the image frame-border) so an authored whole-track note is never
  // invisible. `transcriptTextOf` reads its comment the same way a cue's text is read.
  const wholeTrackNotes = $derived.by<{ id: string; text: string }[]>(() => {
    const out: { id: string; text: string }[] = [];
    for (const a of annotations) {
      if (!a.id) continue;
      const v = (a.target as { selector?: { value?: string } } | undefined)?.selector?.value;
      const f = v ? parseMediaFragment(v) : {};
      if (!f.time) {
        const text = transcriptTextOf(a);
        if (text) out.push({ id: a.id, text });
      }
    }
    return out;
  });
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
  // Deep-link landing seek (4.7): once metadata is in (duration known), place the playhead at the route's
  // `t=` offset — clamped to the real duration — and LEAVE IT PAUSED. This is the section-142 split: it
  // does NOT call `seekTo` (which auto-plays for the in-read affordance); it sets currentTime directly.
  // Fired once per metadata load; a garbage / absent offset resolves to 0 (head), so this is a safe no-op
  // for an ordinary (no-`t=`) landing. The remount-on-step `{#key}` (ExhibitView) gives each AV sibling a
  // fresh mount, so this can't replay a stale offset onto the wrong recording.
  let didLandSeek = false;
  function landSeek() {
    if (didLandSeek || !mediaEl) return;
    didLandSeek = true;
    if (!initialSeek) return; // ordinary landing — leave the playhead at 0, paused
    const at = clampSeekStart(initialSeek, mediaDuration);
    if (at > 0) { mediaEl.currentTime = at; currentTime = at; } // paused — no play() (section-142)
  }
  function onMeta() {
    mediaDuration = mediaEl?.duration ?? 0;
    mediaReady = true;
    landSeek(); // after mediaDuration is set, so the clamp uses the real length
  }
  // Click the bare strip (not a mark) → travel to that point in the recording (scrub the time axis).
  function trackSeek(e: MouseEvent, el: HTMLElement) {
    if (!dur) return;
    const r = el.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * dur);
  }
</script>

<div class="player" class:video={isVideo}>
  <!-- Escape-out (ADR-0016 §137/§223): an AV object opened from the narrative index returns to that
       index. Canvas-relative chrome, sibling to the OSD Reader's .to-read/.to-index escapes — present
       only when the caller wires onback (single AV / AV-in-grid carry their own nav and pass none). -->
  {#if onback}
    <button class="to-index" onclick={() => onback?.()}>
      <span class="back-mark" aria-hidden="true">‹</span>Back to the index
    </button>
  {/if}

  <main>
    <div class="media-region">
      <!-- Loading veil (#10): until metadata arrives a heavy recording is an indistinguishable-from-broken
           dead box — show the shell's breathing-dot idiom so it reads as "loading", not "failed". -->
      {#if !mediaError && !mediaReady}
        <div class="media-loading"><span class="dot"></span><span>Loading the recording…</span></div>
      {/if}
      <!-- The media on the dark light-table — same surface as the image canvas, so sound/image read
           as one kind of object. Controls are the native scrubber (read-only consumer). -->
      {#if mediaError}
        <p class="media-failed">This recording couldn’t be loaded. The file may be missing, or its format isn’t supported by this browser.</p>
      {:else if isVideo}
        <div class="video-wrap">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={onMeta} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
          <!-- Spatiotemporal note regions (ADR-0006): the box appears on the frame during its time window. -->
          <div class="box-overlay" aria-hidden="true">
            {#each videoBoxes as b (b.id)}<div class="rbox" class:active={b.active} style={`left:${b.box.x}%;top:${b.box.y}%;width:${b.box.w}%;height:${b.box.h}%`}></div>{/each}
          </div>
        </div>
      {:else}
        <div class="audio-stage">
          <span class="now">Now playing</span>
          <h1>{object.label}</h1>
          <audio bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={onMeta} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></audio>
        </div>
      {/if}
    </div>

    <!-- Temporal MAP: where each transcript note falls across the recording's length — a read-only
         mirror of the Studio annotation timeline (HANDOFF "AV affordance pareto-hybrid"). The native
         scrubber can't be marked (shadow DOM), so this sibling strip carries the marks. Click a mark to
         travel there; the note now playing is inked (shared `activeIdx`); a quiet line tracks position. -->
    {#if cues.length > 0 && !mediaError && dur > 0}
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
    {#if wholeTrackNotes.length > 0}
      <!-- Whole-object Notes (ADR-0018): about the WHOLE recording (no time range) — the AV analogue of
           the image frame-border, always shown above the time-anchored transcript. -->
      <div class="whole-track" role="note">
        <p class="eyebrow">About the whole recording</p>
        {#each wholeTrackNotes as n (n.id)}<p class="wt-note">{n.text}</p>{/each}
      </div>
    {/if}
    <p class="eyebrow">Transcript · {cues.length} {cues.length === 1 ? "line" : "lines"}</p>
    {#if isVideo}<h1 class="vid-label">{object.label}</h1>{/if}
    <p class="hint">Select any line to jump there in the recording. As it plays, the line being spoken lights up.</p>
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
    {#if cues.length === 0}
      <p class="empty">No transcript for this recording.</p>
    {:else}
      <ol class="cues">
        {#each cues as c, i (c.id)}
          <li>
            <button class:active={i === activeIdx} onclick={() => seekTo(c.range.start)}>
              <span class="t">{fmt(c.range.start)}</span>
              <span class="line">{c.text}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
    {#if objectNav && siblings && currentId}
      <SidebarObjectNav {siblings} {currentId} onstep={(id) => onstep?.(id)} onoverview={() => onoverview?.()} />
    {/if}
  </aside>
</div>

<style>
  /* Listening station: warm paper media ground (left) + warm paper transcript spine (right); the active
     line is a quiet signal — the NarrativeReader idiom, applied to time instead of space. */
  .player { position: relative; display: flex; height: 100vh; background: var(--surface-canvas); }

  /* Whole-object Note band (ADR-0018): a note about the WHOLE recording, persistent above the transcript
     — the AV analogue of the image frame-border (accent-left-stripe, the apparatus idiom). */
  .whole-track { margin: 0 0 var(--space-4); padding: var(--space-2) var(--space-3); border-left: 3px solid var(--accent-2); }
  .wt-note { font-family: var(--font-body); font-size: 0.92rem; line-height: 1.5; color: var(--ink-paper-secondary); margin: var(--space-1) 0 0; }

  /* Escape-out from an index-opened AV recording (ADR-0016 §137 precision-in/escape-out, §223 anti-trap):
     a quiet step back to the index grid, anchored canvas-relative (top-left of the media column). Cleared
     below the persistent top-bar band via the shared --topbar-h token (ViewerShell .topbar owns top-left
     for the breadcrumb; the index-AV player also emits the top-bar carousel) — same clearance as the
     sibling .to-read/.to-index escapes. Mirrors that escape language — transparent chrome, canvas inks, connector-blue (--accent-2)
     hover keeps the rationed orange free. */
  .to-index {
    position: absolute; z-index: 20; top: var(--topbar-h); left: var(--space-5);
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: none; border: none; cursor: pointer; padding: var(--space-2) var(--space-1);
    color: var(--ink-canvas-secondary);
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); letter-spacing: 0.04em;
    transition: color 160ms ease;
  }
  .to-index:hover { color: var(--accent-2); }
  .to-index .back-mark { font-size: 1.05rem; line-height: 1; }
  main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface-canvas); }
  /* Top padding reserves the fixed top bar (#9 / --pane-top): the centred audio title (and the carousel
     + "Back to the index" escape that share this top edge) used to ride up under the bar on a short
     viewport — this is the listening station, the one AV surface with no deep image to anchor attention. */
  .media-region { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: var(--pane-top) var(--space-8) var(--space-8); }
  /* Loading veil (#10) — the shell's breathing-dot idiom over the dark stage until metadata arrives. */
  .media-loading { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; gap: var(--space-3); background: var(--surface-canvas); color: var(--ink-canvas-secondary); font-family: var(--font-ui), sans-serif; font-size: 0.8125rem; letter-spacing: 0.16em; text-transform: uppercase; }
  .media-loading .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: media-pulse 1.4s ease-in-out infinite; }
  @keyframes media-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

  /* Temporal map: the recording's full length as a soft strip, each note a mark at its moment. A time
     axis, not a scrubber overlay: its width is the media column, not the rendered frame, so a
     letterboxed video still maps marks honestly. The note now playing is the one rationed signal. */
  .timeline { flex-shrink: 0; padding: var(--space-3) var(--space-6) var(--space-5); background: transparent; }
  .tl-label { display: block; margin-bottom: var(--space-3); font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .tl-track { position: relative; height: 1.5rem; background: var(--surface-canvas-overlay); border: none; border-radius: var(--radius-sm); box-shadow: var(--shadow-inset-fog); cursor: pointer; overflow: hidden; }
  .tl-mark { position: absolute; top: 4px; bottom: 4px; min-width: 3px; box-sizing: border-box; padding: 0; cursor: pointer; background: var(--accent-3-muted); border: none; border-radius: var(--radius-sm); transition: background 160ms ease, box-shadow 160ms ease; }
  .tl-mark:hover { background: var(--accent-3); }
  .tl-mark.active { background: var(--accent); box-shadow: var(--shadow-signal-glow); }
  .tl-mark:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; z-index: 2; }
  .tl-cursor { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ink-canvas-secondary); pointer-events: none; }

  .audio-stage { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); max-width: 32rem; text-align: center; }
  .audio-stage .now { font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-canvas-muted); }
  .audio-stage h1 { font-family: var(--font-display); font-weight: 300; font-size: 2.4rem; line-height: 1.15; margin: 0; color: var(--ink-canvas-primary); text-shadow: var(--shadow-text-haze); }
  .audio-stage audio { width: 100%; margin-top: var(--space-2); }
  /* Broken-media fallback (empty/error gate): a missing/undecodable recording, on warm paper. */
  .media-failed { max-width: 32rem; font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-canvas-secondary); text-align: center; padding: var(--space-6); background: var(--surface-canvas-raised); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); }
  /* The wrap hugs the rendered video so the overlay aligns with the frame (boxes are % of the frame). */
  .video-wrap { position: relative; display: inline-block; max-width: 100%; max-height: 100%; line-height: 0; }
  .video-wrap video { display: block; max-width: 100%; max-height: 84vh; border-radius: var(--radius-md); }
  .box-overlay { position: absolute; inset: 0; pointer-events: none; }
  .rbox { position: absolute; box-sizing: border-box; border: 1.5px solid var(--accent-3); background: var(--accent-3-muted); border-radius: var(--radius-sm); }
  .rbox.active { border-color: var(--accent); background: var(--accent-muted); box-shadow: var(--shadow-signal-glow); }

  aside {
    width: 420px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
    /* Top reserves the fixed top bar (--pane-top) so the transcript header (eyebrow · label · hint ·
       credit) keeps its own space, clear of the bar overhead. */
    padding: var(--pane-top) var(--space-5) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Quiet tracked-mono eyebrow via global .eyebrow; kept self-margin only. */
  .eyebrow { margin: 0; }
  .vid-label { font-family: var(--font-display); font-weight: 400; font-size: 1.7rem; line-height: 1.15; margin: var(--space-2) 0 0; color: var(--ink-paper-primary); }
  .hint { font-family: var(--font-body); font-size: 0.86rem; line-height: 1.6; letter-spacing: 0; color: var(--ink-paper-secondary); margin: var(--space-3) 0 var(--space-5); }

  .cues { list-style: none; margin: 0; padding: 0; }
  .cues li { margin-bottom: var(--space-2); }
  .cues button {
    display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: var(--space-3);
    width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-sm);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .cues button:hover { background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-low); }
  .cues button.active { border-left-color: var(--accent); background: var(--accent-muted); }
  .t { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.1em; color: var(--ink-paper-muted); }
  .cues button.active .t { color: var(--accent); }
  .line { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-primary); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-card); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-inset-fog); }
</style>
