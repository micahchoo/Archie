<script lang="ts">
  // Viewer reader island (Phase-2 UI, browser-verify pending). Adopts annomea's read pattern:
  // a 3-state pane (list ⇄ detail) + popup on marker select, over a READ-ONLY OSD canvas. Reads
  // the published heads-page form (toHeadsPage) exactly as a consumer would — no editing.
  // Object-parameterized (Phase-2 Grid): the parent (ExhibitView) supplies which object to read
  // and that object's projected annotations; `onback` returns to the exhibit's object grid.
  import Canvas from "@render/svelte/Canvas.svelte";
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  import type { FrameOverlay } from "@render/svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import ReadingSheet from "./ReadingSheet.svelte";
  import NoteMedia from "./NoteMedia.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import SidebarObjectNav from "./SidebarObjectNav.svelte";
  import Credit from "./Credit.svelte";
  import ProseCites from "./ProseCites.svelte";
  import { loadAsideWidth, loadAsideCollapsed, saveAside, type AsideState } from "../aside-persistence.js";
  import { stripMarkdown } from "@render/core";
  import { type MarkerStyle } from "@render/svelte";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, readingIdOf, geoOf, geoCenter, formatLngLat, type NoteMediaItem, type RightsFields, type W3CAnnotation, type Reading, type TileSourceDescriptor } from "@render/core";

  // Resizable / collapsible reader sidebar (Phase-2 expandability). `asideWidth` is a px OVERRIDE of the
  // responsive clamp() default (null ⇒ default); persisted per the archie.*.v1 metadata idiom. Drag math
  // is headless-tested in @render/core; ResizeDivider is the handle. Collapse = image-first close looking.
  const ASIDE_W_KEY = "archie.readerAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.readerAsideCollapsed.v1";
  let asideWidth = $state<number | null>(loadAsideWidth(ASIDE_W_KEY));
  let asideCollapsed = $state<boolean>(loadAsideCollapsed(ASIDE_COLLAPSED_KEY));
  // Expand a long note into the centred reading sheet (Phase-3 focus surface).
  let readingSheet = $state<{ text: string } | null>(null);

  let {
    object,
    annotations = [],
    readings = [],
    activeReading = null,
    onreading,
    styleOf,
    frame = null,
    onback,
    rights,
    initialSelected = null,
    onnotehover,
    notesHidden = false,
    onhiddenchange,
    siblings,
    currentId,
    onstep,
    onoverview,
  }: {
    object: { source: string; canvasId: string; label: string; summary?: string; tileSource?: TileSourceDescriptor };
    annotations?: W3CAnnotation[];
    /** The object-level credit/license (Q5; falls back to the exhibit credit upstream). Shown by the label. */
    rights?: RightsFields;
    /** The exhibit's Readings (ADR-0007) — drives the canvas legend. Empty = no legend. */
    readings?: Reading[];
    activeReading?: string | null;
    onreading?: (id: string | null) => void;
    /** Per-marker style by annotation id — colours a marker by its Reading. */
    styleOf?: (id: string) => MarkerStyle | undefined;
    /** 7e1f coverage border — the whole-object mark to frame the canvas with (ExhibitView decides
     *  which mark + colour; this island wires onActivate to its own selection + suppresses the
     *  framed mark's overlay rect so it isn't double-drawn). null = no frame. */
    frame?: { markId: string; colour: string } | null;
    onback?: () => void;
    initialSelected?: string | null; // deep-link arrival: land selected on this note (→ fitBounds)
    /** Hovering a note in the list solos its mark on the canvas (the legend's hover affordance,
     *  per-note). The host owns the state so the styleOf identity re-mints. null = hover ended. */
    onnotehover?: (id: string | null) => void;
    /** Hide-all (ReadingLegend declutter): when true the canvas draws no markers — only the SELECTED
     *  note's mark stays, so picking from the list still shows what you chose. The note list is intact. */
    notesHidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** Multi-object exhibit (R4): the sibling objects + this object's id drive a visible stepper pinned
     *  to the sidebar foot. Omitted for single-object / narrative-index readers (no sibling stepping). */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview?: () => void;
  } = $props();

  // Show the sidebar object-nav only with real siblings to step AND the wiring to drive it. When present
  // it owns "back to the overview", so the top "← Back to exhibit" would be redundant — suppressed below.
  const objectNav = $derived(
    !!siblings && siblings.length > 1 && !!currentId && !!onstep && !!onoverview,
  );
  // NOTE (dba2): the prev/next object carousel was lifted OUT of here into the persistent top bar
  // (ViewerShell) so it stops occluding the image top-center and has one discoverable home. ExhibitView
  // drives it from `selectedObjectId`; this island no longer owns sibling-nav props or markup.

  // A note's Reading colour (from the registry) — accents its list card + marker (ADR-0007).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = readingIdOf(it);
    return rid !== undefined ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  let selected = $state<string | null>(initialSelected);

  // Worklist 1.3 (arrival moment): on first paint — and again when the carousel lands on another
  // object — the marks pulse twice, then settle to their quiet A2 weight. Answers "where do I
  // start, what's here?" and gives touch readers (no hover-discovery) a way in.
  let arrival = $state(false);
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  function pulseMarks() {
    clearTimeout(pulseTimer);
    arrival = true;
    pulseTimer = setTimeout(() => (arrival = false), 3400); // 2 × 1.6s breaths + settle
  }
  $effect(() => () => clearTimeout(pulseTimer)); // teardown on destroy

  // Reset selection when the object ACTUALLY changes (grid → different object) — but not on the
  // first run, so a deep-link's initialSelected survives mount.
  let prevCanvas: string | undefined;
  $effect(() => {
    const c = object.canvasId;
    if (prevCanvas !== undefined && prevCanvas !== c) selected = null;
    prevCanvas = c;
    pulseMarks(); // every landing (first paint or carousel switch) gets the reveal
  });

  // Re-selection seam (A0): when ExhibitView's arriveAtNote re-fires on an ALREADY-mounted Reader
  // (search jump Q-4, keyboard index Q-5), `initialSelected` changes to a new note — `selected` was
  // only seeded once at $state init, so without this the re-selection did nothing. Track the previous
  // value and adopt a new non-null target; `selected` is bound into Canvas (zoomOnSelect), so the
  // camera fits the new mark just as it does on a marker click. Null clears (e.g. arrival dismissed)
  // are NOT forced here — the object-change effect owns clearing, so this only drives positive jumps.
  let prevInitialSelected: string | null = initialSelected;
  $effect(() => {
    const next = initialSelected;
    if (next !== null && next !== prevInitialSelected) selected = next;
    prevInitialSelected = next;
  });

  // 7e1f: the canvas-wide frame overlay — its corners activate (select) the framed note, reusing the
  // same `selected` path a marker click uses. The framed mark's own overlay rect is suppressed below
  // (filtered out of the canvas annotations) so the whole-object border isn't double-drawn.
  const canvasFrame = $derived<FrameOverlay | null>(
    frame && !notesHidden ? { colour: frame.colour, onActivate: () => (selected = frame.markId) } : null,
  );
  // The notes list + detail (`current`) keep the FULL array — only the canvas drops the framed rect.
  // Hide-all: the canvas shows ONLY the selected note's mark (or nothing), decluttering the basemap
  // while a list pick still reveals its single pin (the camera fit then centres it).
  const canvasAnnotations = $derived.by(() => {
    if (notesHidden) { const sel = annotations.find((a) => a.id === selected); return sel ? [sel] : []; }
    return frame ? annotations.filter((a) => a.id !== frame.markId) : annotations;
  });

  const current = $derived(annotations.find((it) => it.id === selected));
  // Split the selected note into media (clickable tiles → lightbox) + prose (CONTEXT §"Local view loop").
  const noteParts = $derived(current ? splitNoteMedia(commentOf(current)) : { media: [] as NoteMediaItem[], text: "" });
  // Geo readout (Q7): a Map note shows its centre lng/lat in the opened note — supplementary, not chrome.
  const geoCoord = $derived.by(() => { if (!current) return null; const g = geoOf(current); return g ? formatLngLat(geoCenter(g)) : null; });
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);

  // Esc closes the open note (#3): the most-travelled loop is open-read-dismiss-next, and until now Esc
  // worked in the lightbox/reading-sheet but NOT in the note state itself. Guarded so the lightbox/sheet
  // (which bind their own Esc) own the key while open. Arrow-stepping is intentionally NOT bound here —
  // OpenSeadragon owns the arrow keys for panning the deep-zoom image, so hijacking them would regress pan.
  function onkey(e: KeyboardEvent) {
    if (lightbox || readingSheet) return; // those surfaces own Esc while open
    if (e.key === "Escape" && selected !== null) { selected = null; e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="reader">
  <main class:arrival={arrival}>
    <!-- Key on the object so the OSD viewer REMOUNTS (loads the new image) when the carousel switches
         objects — Canvas creates the viewer once in onMount, so without this only annotations swap. -->
    {#key object.canvasId}
      <Canvas source={object.source} tileSource={object.tileSource} canvasId={object.canvasId} annotations={canvasAnnotations} {styleOf} frame={canvasFrame} zoomOnSelect locator bind:selected />
    {/key}
  </main>

  {#if onreading && readings.length > 0}
    <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} />
  {/if}

  <!-- min/max match the aside's responsive clamp(320px … 560px) so a resize can't escape the designed
       reading-measure (#14) — the floor and ceiling are the same numbers the CSS clamp uses. -->
  <ResizeDivider side="right" label="notes" min={320} max={560} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />
  <aside class:detail={!!current} class:collapsed={asideCollapsed} style:--reader-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    {#if onback && !objectNav}
      <button class="exhibit-back soft-btn" onclick={() => onback?.()}>← Back to Exhibit</button>
    {/if}
    {#if current}
      <!-- detail state (annomea drawer): the selected note -->
      <button class="back soft-btn" onclick={() => (selected = null)}>← See all notes</button>
      <!-- Eyebrow orients which object's note this is, restoring the eyebrow-first rhythm the list/grid/
           narrative/transcript all share (#4) — a note no longer reads as a context-free fragment. -->
      <p class="eyebrow note-home">{object.label}</p>
      <article>
        <!-- prose (media stripped) + the note's media as clickable tiles (image/audio/video) -->
        {#if noteParts.text}<div class="body"><ProseCites text={noteParts.text} /></div>{/if}
        <NoteMedia media={noteParts.media} onopen={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })} />
        {#if geoCoord}<p class="geo-coord" title="Longitude / latitude">{geoCoord}</p>{/if}
        <div class="tags">{#each tagsOf(current) as t}<span class="tag">#{t}</span>{/each}</div>
      </article>
    {:else}
      <!-- list state -->
      <!-- h1: the single-object page's top heading (axe page-has-heading-one); styling is class-keyed -->
      <h1 class="object-label">{object.label}</h1>
      {#if object.summary}<p class="object-summary">{object.summary}</p>{/if}
      <p class="credit-row"><Credit {rights} tone="paper" /></p>
      <h2 class="eyebrow">Notes · {annotations.length}</h2>
      {#if annotations.length === 0}
        <p class="empty">No notes on this image yet.</p>
      {/if}
      <ul>
        {#each annotations as it (it.id)}
          <li onmouseenter={() => onnotehover?.(it.id ?? null)} onmouseleave={() => onnotehover?.(null)}>
            <!-- Solo the mark on FOCUS too, not just hover (#11): keyboard tab + touch-focus light the
                 note's mark on the canvas before commit — the connect-note-to-region affordance was
                 hover-only, invisible to tablet/phone readers. Reuses the same hoverNote/MarkerStyle path. -->
            <button style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)} onfocus={() => onnotehover?.(it.id ?? null)} onblur={() => onnotehover?.(null)}>
              <span class="card-preview">{stripMarkdown(commentOf(it))}</span>
              {#if tagsOf(it).length}<span class="card-tags">{#each tagsOf(it) as t}<span class="tag">#{t}</span>{/each}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">Select a note, or a marker on the image. Markers stay pinned as you pan and zoom, and selecting one zooms in.</p>
    {/if}
    {#if objectNav && siblings && currentId}
      <SidebarObjectNav {siblings} {currentId} onstep={(id) => onstep?.(id)} onoverview={() => onoverview?.()} />
    {/if}
  </aside>

  {#if current && asideCollapsed}
    <!-- The selected note over the canvas — shown ONLY when the sidebar is collapsed, where it is the sole
         note surface (#1). With the sidebar open, that pane IS the note's home ("selection state IS popup
         open-state", system.md) so this echo is suppressed. Tap the body to expand (reading sheet for prose,
         lightbox for a media-only note); × dismisses. -->
    <div class="popup">
      <button class="popup-body" onclick={() => { if (noteParts.text) readingSheet = { text: noteParts.text }; else if (noteParts.media.length) lightbox = { media: noteParts.media, text: noteParts.text, index: 0 }; }} title="Expand to read">
        {stripMarkdown(noteParts.text) || `${noteParts.media.length} ${noteParts.media.length === 1 ? "media item" : "media items"}`}
      </button>
      <button class="popup-close" onclick={() => (selected = null)} aria-label="Close note">×</button>
    </div>
  {/if}

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}

  {#if readingSheet}
    <ReadingSheet text={readingSheet.text} onclose={() => (readingSheet = null)} />
  {/if}
</div>

<style>
  /* The published reading experience: the object floats on the soft warm ground (left); notes read
     like quiet catalog entries on warm paper (right); a hushed callout echoes the selection. */
  .reader { position: relative; display: flex; height: 100vh; background: var(--surface-canvas); }
  main { position: relative; flex: 1; min-width: 0; background: var(--surface-canvas); }
  /* Worklist 1.3: one-shot arrival reveal — every marker breathes twice, then settles to its quiet
     A2 resting weight. The class drops off after the timer, so the animation can never recur mid-read. */
  main.arrival :global(.a9s-annotationlayer .a9s-annotation) { animation: arrival-breathe 1.6s ease-in-out 2; }
  @keyframes arrival-breathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  @media (prefers-reduced-motion: reduce) {
    main.arrival :global(.a9s-annotationlayer .a9s-annotation) { animation: none; }
  }

  /* Reader panel — warm paper, quiet catalog entries; separated from the canvas by a soft shadow
     and a hair-thin warm border, not a hard rule. */
  aside {
    /* Width = a token: responsive by default (clamp), drag-resizable via --reader-aside-w (Phase 2). */
    width: var(--reader-aside-w, clamp(320px, 27vw, 560px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    /* Top reserves the fixed top bar (--pane-top) so the header — object label · summary · credit · the
       "Notes · N" count — keeps its own space, clear of the bar's "Open another library" zone overhead. */
    padding: var(--pane-top) var(--space-5) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
    box-shadow: var(--shadow-lift-low);
  }
  /* Collapsed = give the canvas the whole width (image-first close looking). Divider stays (anti-trap). */
  aside.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; box-shadow: none; overflow: hidden; }
  /* The only h2 is the `.eyebrow` — let the global Soft Static eyebrow (tracked mono, low-opacity)
     own its colour/type; just give it bottom rhythm here. */
  aside h2 { margin: 0 0 var(--space-4); }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Note card (list state) — warm paper, soft shadow, generous corners. The 3px left edge carries
     the note's Reading colour (inline binding) and turns to the quiet accent signal on hover. */
  li button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  li button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  /* 3-line preview clamp + a per-card tag row — the documented scan contract (system.md §Craft Notes):
     a dense list scans by shape, and tags (the cross-cutting discovery affordance) surface on the card. */
  .card-preview { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

  /* Return to the exhibit's object grid (only shown for multi-object exhibits) — quiet soft button
     (composes .soft-btn; just position + size here). */
  .exhibit-back { display: inline-block; margin-bottom: var(--space-5); font-size: var(--text-ui-md); padding: var(--space-2) var(--space-4); }
  .object-label { font-family: var(--font-display); font-size: 1.7rem; font-weight: 400; line-height: 1.15; color: var(--ink-paper-primary); margin: 0 0 var(--space-2); }
  .object-summary { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .credit-row { margin: 0 0 var(--space-3); }

  /* Detail state (drawer) — quiet soft button (composes .soft-btn). */
  .back { display: inline-block; margin-bottom: var(--space-4); font-size: var(--text-ui-md); padding: var(--space-2) var(--space-4); }
  .note-home { margin: 0 0 var(--space-3); }
  article .body { font-family: var(--font-body); font-size: 1.1875rem; line-height: 1.6; color: var(--ink-paper-primary); }
  /* rendered-markdown children (sanitized HTML, so :global) */
  article .body :global(p) { margin: 0 0 var(--space-3); }
  article .body :global(p:last-child) { margin-bottom: 0; }
  article .body :global(strong) { font-weight: 700; }
  article .body :global(em) { font-style: italic; }
  /* Links must LOOK clickable (underline + cursor; colour alone fails WCAG and reads as prose). An
     intra-Library cite (a hash route back into this viewer) gets the same ¶ seal the author used to make
     it (Studio's ¶ Cite / CmdK) — link-scent so a reader can tell a cross-link from an outbound one. */
  article .body :global(a) { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  /* content alt-text `/ ""` keeps the ¶ visible but silent to screen readers (the link text already
     conveys the target). Heuristic selector: real-publish cites are `…#/slug/a/id`; a rare external
     `#/`-fragment link may also catch a ¶ — cosmetic only. */
  article .body :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  article .body :global(ul), article .body :global(ol) { margin: 0 0 var(--space-3); padding-left: var(--space-5); }
  /* Note images render as thumbnails (not full-bleed) — click to open the lightbox. */
  article .body :global(img) { display: block; max-width: 100%; max-height: 200px; height: auto; margin-top: var(--space-2); border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); cursor: zoom-in; }
  .tags { margin-top: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-3); }
  /* Quiet found-meta chips (mono, tinted) — not loud orange fills; the orange stays rationed. */
  .tag { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin-top: var(--space-5); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }

  /* Popup — a hushed warm-paper callout floating over the canvas, carrying a quiet cord-blue
     left-edge signal (the secondary connector accent, not the rationed orange). */
  .popup {
    /* Bottom-anchored, grows upward — cap its height (clear the topbar) and scroll, so a long note
       never overflows the viewport top. */
    position: absolute; left: var(--space-5); bottom: var(--space-5); max-width: 46%;
    max-height: calc(100vh - var(--topbar-h) - var(--space-5) - var(--space-4)); overflow-y: auto;
    display: flex; align-items: flex-start; gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: none; border-left: 3px solid var(--accent-2);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
    font-family: var(--font-body); font-size: 1rem; line-height: 1.4;
  }
  /* The body IS the expand affordance (reading sheet for prose, lightbox for a media-only note); × dismisses. */
  .popup-body { flex: 1; min-width: 0; text-align: left; background: none; border: none; cursor: pointer; color: inherit; font: inherit; line-height: inherit; transition: color 160ms ease; }
  .popup-body:hover { color: var(--accent-2); }
  .popup-close { flex: none; background: none; border: none; cursor: pointer; color: var(--ink-canvas-muted); font-size: 1.2rem; line-height: 1; padding: 0; transition: color 160ms ease; }
  .popup-close:hover { color: var(--accent-2); }
</style>
