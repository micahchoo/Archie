<script lang="ts">
  // First-class AV note (CONTEXT §81): a Sound/Video object read against its transcript. The
  // supplementing Notes carry `t=start,end` ranges (transcript.ts wrote them); here we read them back
  // (parseTimeFragment) as a prose SPINE beside the media — clicking a line travels the audio (seek),
  // and playback lights the active line (activeNoteIndex on timeupdate). The same reading idiom as the
  // spatial NarrativeReader: AV is narrative over time. Import-only v1 — read-only, no recording.
  // Two read surfaces share that one `activeIdx`: the sequential transcript SPINE (right) and a
  // temporal MAP — a marker strip under the media showing WHERE on the recording each note falls
  // (read-only mirror of the Studio annotation timeline; HANDOFF "AV affordance pareto-hybrid").
  //
  // V53 (Archie-7b86) — THE READING SURFACE DOES NOT KNOW WHAT MEDIA IT IS READING.
  //
  // This surface used to render an authored note as a bare `{c.text}` string in the spine and stop
  // there: no note card, no reading sheet, no media tiles, no live cites, and a resize handle on the
  // image reader's aside but not on this one. The corpus is unanimous that this asymmetry is a defect
  // rather than a legitimate divergence — every multi-media viewer swaps the PAINTING ENGINE by media
  // type and keeps the annotation reading surface identical:
  //   · clover-iiif `src/components/Viewer/Viewer/Content.tsx` — `<Painting … isMedia={isAudioVideo}>`
  //     (:133-138) carries the media flag; `<InformationPanel …>` (:178-186) is handed seven props and
  //     NOT one of them is the media flag. Verified in the file 2026-07-26.
  //   · mirador `src/components/WindowSideBarAnnotationsPanel.jsx:14-42` — the reading panel's whole
  //     signature is `{ annotationCount, canvasIds, windowId, id }`; the media branch lives in
  //     `PrimaryWindow.jsx:46-70`, on the canvas alone.
  // So the note surface, the sheet, the lightbox and the rich prose renderer are shared components
  // here, not re-implementations: ONE note renderer (Archie-c982/dbbc), reached from a temporal spine.
  import { parseMediaFragment, activeNoteIndex, transcriptTextOf, splitNoteMedia, stripMarkdown, tagsOfAnnotation as tagsOf, geoOf, geoCenter, formatLngLat, type NoteMediaItem, type RightsFields, type W3CAnnotation, type TimeRange } from "@render/core";
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  import { clampSeekStart } from "../av-landing.js";
  import { loadAsideWidth, saveAside, type AsideState } from "../aside-persistence.js";
  import Credit from "./Credit.svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import NotePopup from "./NotePopup.svelte";
  import ReadingSheet from "./ReadingSheet.svelte";
  import SidebarObjectNav from "./SidebarObjectNav.svelte";

  let {
    object,
    annotations = [],
    rights,
    initialSeek,
    onlocus,
    onback,
    siblings,
    currentId,
    onstep,
    onoverview,
    onopenfinder,
  }: {
    object: { source: string; label: string; mediaType?: "image" | "sound" | "video"; duration?: number };
    annotations?: W3CAnnotation[];
    /** The recording's credit/license (Q5) — AV is MUST-display too; shown by the title. */
    rights?: RightsFields;
    /** Deep-link time offset (#/<slug>/a/<id>?t=…, Phase 3 / 4.7): on `loadedmetadata` the playhead seeks
     *  to this clamped offset PAUSED — section-142: landing seeks but must NOT auto-play, so this does NOT
     *  go through `seekTo` (which couples play()). Garbage / out-of-range → head (0). */
    initialSeek?: string;
    /** V52/V101 (Archie-99b1): report the deepest rung — the cue the playhead is inside, and its START
     *  offset. ADR-0021's `t=` landing seek was correctly built and structurally UNREACHABLE because no
     *  address ever carried `t=`; this is the write half. The cue's start (not `currentTime`) is what
     *  rides the address: a link must land at the beginning of the moment it names, and a per-frame
     *  value would rewrite the bar continuously and cite an arbitrary instant. */
    onlocus?: (l: { noteId: string | null; t: string | null }) => void;
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
    /** A tag chip on the open note was clicked (Q-4) — open the finder pre-scoped with that tag.
     *
     *  DELIBERATELY OPTIONAL AND GATED. `NotePopup` renders every tag as a `<button>` whose click calls
     *  `onopenfinder?.(t)`, so handing it tags with no handler wired would ship a control that renders
     *  and does nothing — the AV note-list row's exact defect, and the `oncancel` shape
     *  `.claude/rules/svelte-no-typecheck-net.md` records (typed, unbound, statically silent). So the
     *  tags below are passed ONLY when this is wired; until `ExhibitView` threads it, an AV note's tags
     *  are honestly absent rather than dishonestly inert. (No fixture AV note carries tags today, so
     *  this path is currently unexercised either way — recorded rather than inferred.) */
    onopenfinder?: (tag: string) => void;
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
  // V51 — nothing is "being spoken" until the recording has actually started.
  //
  // `activeNoteIndex` answers a pure question: which range contains time t. At t=0, paused, never
  // played, a cue starting at 0:00 legitimately contains 0 — so the first transcript line rendered
  // already lit, claiming to be the line currently being spoken while nothing was playing. The
  // predicate was right and the question was wrong.
  //
  // `started` is the missing precondition: the playhead has moved, or playback has begun. It is
  // deliberately NOT `!paused` — a deep-link landing (`t=`) sets currentTime while staying paused,
  // and there the reader WAS sent to that moment, so lighting the line is correct. Only the untouched
  // head is silent.
  let playing = $state(false);
  const started = $derived(playing || currentTime > 0);
  const activeIdx = $derived(started ? activeNoteIndex(cues.map((c) => c.range), currentTime) : -1);
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
  // Publish the current cue upward for the address (V52/V101). Fires on cue BOUNDARIES, not per frame.
  $effect(() => {
    const c = activeIdx >= 0 ? cues[activeIdx] : undefined;
    onlocus?.({ noteId: c?.id ?? null, t: c ? String(c.range.start) : null });
  });

  // Spatiotemporal regions visible at the current moment — each box shows while currentTime ∈ its window;
  // the active cue's box is emphasised. The read-side mirror of the Studio's frame-draw (ADR-0006).
  const videoBoxes = $derived.by(() =>
    cues
      .filter((c) => c.box && currentTime >= c.range.start && currentTime <= (c.range.end ?? c.range.start))
      .map((c) => ({ id: c.id, box: c.box!, active: cues[activeIdx]?.id === c.id })),
  );

  // ---- V53: THE NOTE (the surface this player had no way to reach) ----------------------------
  //
  // `selected` is the note the reader OPENED — deliberately a different state from `activeIdx`, the cue
  // the playhead is inside. Playback must never open a card: that would be the note surface deciding on
  // the reader's behalf, which is the same failure Archie-01a6 named when a nav affordance and a note
  // card fused. Selection is explicit-click only, and it survives playback moving on.
  //
  // ONE CLICK, BOTH MOTIONS — and this is parity, not invention. `Reader.svelte:473` gives a list entry
  // a single `onclick={() => (selected = it.id)}`, and because `selected` is bound into `Canvas` with
  // `zoomOnSelect`, that one click BOTH travels the viewport to the note and opens it. The temporal
  // analogue of "travel the viewport" is "seek", so a cue row does both here for the same reason.
  // The corpus splits on this and the split is about PURPOSE, not media: clover-iiif's transcript cue
  // seeks on click and offers nothing to open (`.../InformationPanel/Annotation/VTT/Cue.tsx:121-127`
  // — `video.pause(); video.currentTime = start; video.play()`), while osd-audio-video's annotation
  // list separates them — the card body selects (`audio-canvas.html:598-603` → `selectAnnotation`) and
  // a dedicated `▶ Play` button seeks (`:583-596`). Archie's spine rows are BOTH: transcript lines you
  // follow along, and authored notes with cites and media. Doing both from the one row is what keeps
  // the follow-along click the hint already promises while making the note reachable at all.
  let selected = $state<string | null>(null);
  let readingSheet = $state(false);
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);

  const current = $derived(annotations.find((a) => a.id === selected));
  // `transcriptTextOf`, NOT `commentOfAnnotation` — and the difference is load-bearing on THIS surface.
  // A transcript-imported cue's body carries `purpose: "supplementing"` (`av/transcript.ts:70`), which
  // `commentOfAnnotation` does not match, so it would render every imported cue as "(untitled)".
  // `transcriptTextOf` joins all non-tagging bodies, so it reads an authored comment and an imported
  // cue alike — the same read the spine already uses, so the card and the line cannot disagree.
  const noteParts = $derived(
    current ? splitNoteMedia(transcriptTextOf(current)) : { media: [] as NoteMediaItem[], text: "" },
  );
  const geoCoord = $derived.by(() => {
    if (!current) return null;
    const g = geoOf(current);
    return g ? formatLngLat(geoCenter(g)) : null;
  });
  function openNote(id: string) {
    selected = id;
  }

  // Escape LADDER (V26/V25's shape, ported): this surface had NO key handler at all, so Escape did
  // nothing here even though the image reader walks a reader out level by level. Rungs, innermost first:
  //   1. a note is open → close it
  //   2. otherwise      → up a level
  // Reader's middle rung ("leave the canvas") has no analogue: there is no OpenSeadragon here holding
  // the arrow keys, so there is nothing to hand focus back from.
  //
  // "Up a level" is `onback` OR `onoverview`, and taking both is what makes the ladder real rather than
  // decorative. The two AV call sites wire DIFFERENT escapes: the narrative-index player gets `onback`
  // (return to the index) and the grid player gets `onoverview` (return to the object grid) — see the
  // two `<MediaPlayerLazy.current …>` instances in ExhibitView. Binding only `onback` would leave the
  // grid player — the ordinary way a reader meets an AV object — with an Escape that does nothing, which
  // is V26's exact finding on the image reader ("measured, still `#/voynich`, still Object 2 of 12").
  const escapeUp = $derived(onback ?? onoverview);
  function onkey(e: KeyboardEvent) {
    if (lightbox || readingSheet) return; // those surfaces own Esc while open (use:dialog)
    if (e.key !== "Escape") return;
    if (selected !== null) { selected = null; e.preventDefault(); return; }
    if (escapeUp) { escapeUp(); e.preventDefault(); }
  }

  // Resizable transcript aside (V53) — clover-iiif is the direct donor and did NOT build a second panel
  // for AV: the VTT transcript renders in the very same aside as the image annotation list, and that
  // aside carries a drag handle with pointer capture and a 20–60% clamp
  // (`.../Viewer/Viewer/Content.tsx:97-118`, verified 2026-07-26).
  //
  // COLLAPSE IS DELIBERATELY WITHHELD, and this is the one place this surface must NOT copy the image
  // reader. `SidebarObjectNav` — the AV object nav — lives INSIDE this aside, because an AV object has
  // no canvas chrome to host it (the note-surface slice's finding). A collapsible aside would therefore
  // take the object nav away in the collapsed state: V65's exact defect, re-created here by a fix for
  // V53. `ResizeDivider` already models this — `collapsible={false}` exists for Archie-b671's docked
  // note editor, "resizable but NOT minimizable" — so the withholding is the component's own idiom, not
  // a local exception. The `.timeline` strip is what answers hyperaudio-lite's collapse principle
  // (`js/hyperaudio-lite.js:648-664`: hiding the transcript obliges you to re-home the position signal):
  // it lives in `main`, so narrowing the spine never costs the reader their place in the recording.
  const ASIDE_W_KEY = "archie.avAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.avAsideCollapsed.v1";
  let asideWidth = $state<number | null>(loadAsideWidth(ASIDE_W_KEY));

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
  // V29 — a video that loads fine and shows nothing.
  //
  // `<video onerror>` is the only guard this plate had, and for this failure it CANNOT fire: the
  // resource loads, metadata arrives, no `error` event is raised — there simply is no decodable
  // video track (an audio-only file served into a <video>, or a container whose video codec this
  // browser won't render). The reader gets a black rectangle with working controls and no
  // explanation, which is the one outcome worse than an honest failure.
  //
  // `videoWidth` is the signal `error` can't give: 0 before metadata, the true width after it for
  // any real video track, and still 0 afterwards for a file that has none. Checked only once
  // metadata is in, so it can't false-positive on the loading state.
  let noVideoTrack = $state(false);
  function onMeta() {
    mediaDuration = mediaEl?.duration ?? 0;
    mediaReady = true;
    if (isVideo) noVideoTrack = (mediaEl as HTMLVideoElement | undefined)?.videoWidth === 0;
    landSeek(); // after mediaDuration is set, so the clamp uses the real length
  }
  // Click the bare strip (not a mark) → travel to that point in the recording (scrub the time axis).
  function trackSeek(e: MouseEvent, el: HTMLElement) {
    if (!dur) return;
    const r = el.getBoundingClientRect();
    seekTo(((e.clientX - r.left) / r.width) * dur);
  }
</script>

<svelte:window onkeydown={onkey} />

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
          <!-- V29: the recording plays but has no picture — say so, instead of leaving a black plate
               that is indistinguishable from a broken one. The audio still works, so this is a notice
               beside the media, not the `media-failed` replacement. -->
          {#if noVideoTrack}
            <p class="media-notice">This recording has no picture — only sound. The controls below still play it.</p>
          {/if}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={onMeta} onplay={() => (playing = true)} onpause={() => (playing = false)} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></video>
          <!-- Spatiotemporal note regions (ADR-0006): the box appears on the frame during its time window. -->
          <div class="box-overlay" aria-hidden="true">
            {#each videoBoxes as b (b.id)}<div class="rbox" class:active={b.active} style={`left:${b.box.x}%;top:${b.box.y}%;width:${b.box.w}%;height:${b.box.h}%`}></div>{/each}
          </div>
        </div>
      {:else}
        <div class="audio-stage">
          <span class="now">Now playing</span>
          <h1>{object.label}</h1>
          <audio bind:this={mediaEl} src={object.source} controls onerror={() => (mediaError = true)} onloadedmetadata={onMeta} onplay={() => (playing = true)} onpause={() => (playing = false)} ontimeupdate={() => (currentTime = mediaEl?.currentTime ?? 0)}></audio>
        </div>
      {/if}

      <!-- THE NOTE (shared NotePopup), floating on any cue / whole-track selection — the same component,
           at the same size, as the image reader's card. Nothing about it is AV-specific; what reaches it
           is (a temporal note instead of a spatial one), which is the corpus's whole point.

           IT IS ANCHORED INSIDE `.media-region`, NOT `.player`, AND THAT IS THE OCCLUSION FIX. `.note-pop`
           is `position: absolute; left: …; bottom: calc(var(--strip-h) + …)` and takes its box from the
           nearest positioned ancestor. `.player` is positioned, so mounting the card as its child would
           have parked it on the `.timeline` — the temporal map is `main`'s LAST child, so the card's
           bottom-left is exactly where the map is. That is V49's defect (the map shipped fully covered by
           the item strip) re-created by the fix for V53. `.media-region` is already `position: relative`
           and already sits ABOVE the map in the column, so anchoring here reserves the map structurally
           rather than by a magic offset — Archie-40fe's model.

           `--strip-h: 0px` on the slot for the same reason: `.player` already takes the filmstrip out of
           the column with its own `padding-bottom`, and `.media-region` ends above that padding. Leaving
           the card's own strip reservation in place would double-count it and float the card into the
           middle of the picture. -->
      {#if current}
        <div class="note-slot" class:hidden-behind-sheet={readingSheet}>
          <NotePopup
            eyebrow={object.label}
            text={noteParts.text}
            media={noteParts.media}
            tags={onopenfinder ? tagsOf(current) : []}
            {geoCoord}
            onclose={() => (selected = null)}
            onexpand={() => { if (noteParts.text) readingSheet = true; else if (noteParts.media.length) lightbox = { media: noteParts.media, text: noteParts.text, index: 0 }; }}
            onopenfinder={(t) => onopenfinder?.(t)}
            onmedia={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })}
          />
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
              onclick={(e) => { e.stopPropagation(); seekTo(c.range.start); openNote(c.id); }}></button>
          {/each}
          {#if dur}<div class="tl-cursor" style={`left:${(currentTime / dur) * 100}%`} aria-hidden="true"></div>{/if}
        </div>
      </div>
    {/if}
  </main>

  <!-- min/max are the aside's own floor and ceiling (see its `width` below), so a drag can't escape the
       designed reading measure. `collapsible={false}`: this aside holds the AV object nav — see the
       ASIDE_W_KEY block in the script for why collapsing it would re-create V65. -->
  <ResizeDivider side="right" label="transcript" min={320} max={560} collapsible={false}
    bind:width={asideWidth} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />

  <aside style:--av-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    {#if wholeTrackNotes.length > 0}
      <!-- Whole-object Notes (ADR-0018): about the WHOLE recording (no time range) — the AV analogue of
           the image frame-border, always shown above the time-anchored transcript.
           V53: these open THE NOTE too. A whole-track note is the one note on this surface with no cue
           row to reach it by, so before this it was the only note in the app whose media, tags and cites
           were structurally unreachable — it was printed, stripped of its markup, and that was all. -->
      <div class="whole-track">
        <p class="eyebrow">About the whole recording</p>
        {#each wholeTrackNotes as n (n.id)}
          <button type="button" class="wt-note" class:active={n.id === selected}
            aria-current={n.id === selected ? "true" : undefined}
            onclick={() => openNote(n.id)}>{stripMarkdown(n.text)}</button>
        {/each}
      </div>
    {/if}
    <p class="eyebrow">Transcript · {cues.length} {cues.length === 1 ? "line" : "lines"}</p>
    {#if isVideo}<h1 class="vid-label">{object.label}</h1>{/if}
    <p class="hint">Select any line to jump there in the recording and open its note. As it plays, the line being spoken lights up.</p>
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
    {#if cues.length === 0}
      <p class="empty">No transcript for this recording.</p>
    {:else}
      <!-- `.active` = the line being SPOKEN (playhead), `aria-current`/`.open` = the note the reader
           OPENED. Two different states on purpose (see `selected` in the script).

           `stripMarkdown` on the line, and a 3-line clamp: the spine's job is following along, and a
           note's authored markup is not part of what is being said. Before this, `[Read the manuscript
           through, page by page.](archie:voynich-reading/)` rendered LITERALLY, brackets and URL and all,
           in the transcript of the seed recording. The rich read — that cite live, plus media tiles and
           the geo readout — is what the card gives you, which is what makes it worth opening.

           The line is NOT replaced by a position mark while its note is open, deliberately diverging from
           the image list's V60 rule (Archie-dbbc). There, the entry is an INDEX and the prose it restated
           was legible 900px away. Here the line is the RECORDING'S CONTENT at that moment: blanking it
           punches a hole in the transcript you are reading along, and hyperaudio-lite states the general
           form (`js/hyperaudio-lite.js:648-664` — when the transcript is hidden it re-homes the spoken
           word to `document.title`, because the transcript is how you know where you are). The clamp is
           what keeps the two from being the same block of text at two sizes. -->
      <ol class="cues">
        {#each cues as c, i (c.id)}
          <li>
            <button class:active={i === activeIdx} class:open={c.id === selected}
              aria-current={c.id === selected ? "true" : undefined}
              onclick={() => { seekTo(c.range.start); openNote(c.id); }}>
              <span class="t">{fmt(c.range.start)}</span>
              <span class="line">{stripMarkdown(c.text)}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
    {#if objectNav && siblings && currentId}
      <SidebarObjectNav {siblings} {currentId} onstep={(id) => onstep?.(id)} onoverview={() => onoverview?.()} />
    {/if}
  </aside>

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}

  {#if readingSheet && current}
    <!-- The SAME note at reading size — the card's whole prop set, not a text snapshot (V64/V60). Closing
         is "read less", not "dismiss": it collapses back to the card and leaves `selected` alone; only
         the card's × clears selection. Both routes out of the sheet (finder, lightbox) CLOSE it first —
         one modal at a time, exactly as `Reader.svelte` does, because the sheet, the finder and the
         lightbox all assert `aria-modal="true"` and two of them cannot both be telling the truth. -->
    <ReadingSheet
      eyebrow={object.label}
      text={noteParts.text}
      media={noteParts.media}
      tags={onopenfinder ? tagsOf(current) : []}
      {geoCoord}
      onclose={() => (readingSheet = false)}
      onopenfinder={(t) => { readingSheet = false; onopenfinder?.(t); }}
      onmedia={(idx) => { readingSheet = false; lightbox = { media: noteParts.media, text: noteParts.text, index: idx }; }}
    />
  {/if}
</div>

<style>
  /* Listening station: warm paper media ground (left) + warm paper transcript spine (right); the active
     line is a quiet signal — the NarrativeReader idiom, applied to time instead of space. */
  /* V49 (Archie-7b86): the temporal map — this surface's ONE novel affordance, the thing that makes a
     recording navigable the way an image's marks do — shipped FULLY covered by the item strip. The
     player is a 100vh column and `.timeline` is its last child, so the fixed bottom band sat straight
     on top of it.
     The ticket predicted this wants Archie-40fe's reservation rather than a local fix, and it does:
     `--strip-h` is Filmstrip's live measured height, already the token every other bottom-anchored
     surface clears. `box-sizing` so the padding comes OUT of the 100vh rather than adding to it —
     otherwise the column overflows and the timeline is pushed off the bottom instead of covered by it,
     which would look like a fix and be the same defect. */
  .player {
    position: relative; display: flex; height: 100vh; box-sizing: border-box;
    padding-bottom: var(--strip-h, 0px);
    background: var(--surface-canvas);
  }

  /* Whole-object Note band (ADR-0018): a note about the WHOLE recording, persistent above the transcript
     — the AV analogue of the image frame-border (accent-left-stripe, the apparatus idiom). */
  .whole-track { margin: 0 0 var(--space-4); padding: var(--space-2) var(--space-3); border-left: 3px solid var(--accent-2); }
  /* V53: a button, not a `<p>` — it opens THE NOTE. Button chrome is reset to nothing so the band keeps
     its apparatus voice; the affordance shows on hover/focus, the index idiom this app uses everywhere. */
  .wt-note {
    display: block; width: 100%; text-align: left; cursor: pointer;
    background: none; border: none; border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2); margin: var(--space-1) 0 0 calc(-1 * var(--space-2));
    font-family: var(--font-body); font-size: 0.92rem; line-height: 1.5; color: var(--ink-paper-secondary);
    transition: background 160ms ease, color 160ms ease;
    /* Clamped for the same reason the cue lines are: this band is now an index ENTRY, not the note. The
       whole note is one click away in the card, and an unclamped whole-track note pushed the first
       transcript line 464px down the aside — under the sticky object nav. */
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .wt-note:hover { background: var(--surface-paper-hover); color: var(--ink-paper-primary); }
  .wt-note.active { background: var(--accent-muted); color: var(--ink-paper-primary); }
  .wt-note:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }

  /* The note card's slot. `display: contents` so it generates no box — `.note-pop` keeps `.media-region`
     as its containing block and its own anchoring is untouched. `--strip-h: 0px` cancels the card's
     filmstrip reservation, which `.player`'s `padding-bottom` has already made on its behalf (see the
     slot's comment in the markup). `display: none` while the reading sheet is open takes the card out of
     rendering AND the a11y tree without unmounting the ⤢ that `use:dialog` returns focus to — the same
     mechanism, and the same reason, as `Reader.svelte`'s `.note-slot`. */
  .note-slot { display: contents; --strip-h: 0px; }
  .note-slot.hidden-behind-sheet { display: none; }

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
  /* V29: a notice, not a failure — the recording still plays, it just has no picture. Sits above the
     plate rather than replacing it, so the controls stay exactly where the reader expects them. */
  .media-notice { margin: 0 0 var(--space-3); max-width: 32rem; font-family: var(--font-body); font-size: 0.9375rem; line-height: 1.5; color: var(--ink-canvas-secondary); text-align: center; }
  /* The wrap hugs the rendered video so the overlay aligns with the frame (boxes are % of the frame). */
  .video-wrap { position: relative; display: inline-block; max-width: 100%; max-height: 100%; line-height: 0; }
  .video-wrap video { display: block; max-width: 100%; max-height: 84vh; border-radius: var(--radius-md); }
  .box-overlay { position: absolute; inset: 0; pointer-events: none; }
  .rbox { position: absolute; box-sizing: border-box; border: 1.5px solid var(--accent-3); background: var(--accent-3-muted); border-radius: var(--radius-sm); }
  .rbox.active { border-color: var(--accent); background: var(--accent-muted); box-shadow: var(--shadow-signal-glow); }

  aside {
    /* Width = a token (V53, the Reader idiom): 420px resting default, `--av-aside-w` is the reader's px
       OVERRIDE from the drag. The ResizeDivider's min/max (320/560) are the same numbers, so the handle
       cannot drag the transcript outside its designed measure. */
    width: var(--av-aside-w, 420px); min-width: 320px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
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
  /* The OPENED note (a different state from the spoken line — see the markup). Signalled on a different
     channel from `.active` so the two can coexist rather than fight: playback owns the left accent edge
     and the fill; selection owns a lift. immarkus's discipline, ported — "category owns hue, state owns
     stroke width" (`src/pages/annotate/WorkspaceSection/useDrawingStyles.ts:11-33`, where `strokeWidth`
     is state and `fill` is identity) — which is what lets a mark carry two facts without either winning. */
  .cues button.open { box-shadow: var(--shadow-lift-mid); }
  .t { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.1em; color: var(--ink-paper-muted); }
  .cues button.active .t { color: var(--accent); }
  /* 3-line clamp — the documented scan contract (system.md §Craft Notes), and what keeps the spine a
     spine once a note runs long. The whole note is one click away in the card. */
  .line { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-primary); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-card); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-inset-fog); }
</style>
