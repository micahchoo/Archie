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
  import ReadingLegend from "./ReadingLegend.svelte";
  import SidebarObjectNav from "./SidebarObjectNav.svelte";
  import NotePopup from "./NotePopup.svelte";
  import Credit from "./Credit.svelte";
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
    onopenfinder,
    siblings,
    currentId,
    onstep,
    onoverview,
    readingCount,
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
    /** A tag chip was clicked (Q-4): open the mode-independent finder pre-scoped with that tag as a
     *  facet. The chips become the discovery affordance everywhere they render. */
    onopenfinder?: (tag: string) => void;
    /** Multi-object exhibit (R4): the sibling objects + this object's id drive a visible stepper pinned
     *  to the sidebar foot. Omitted for single-object / narrative-index readers (no sibling stepping). */
    siblings?: { id: string; label: string }[];
    currentId?: string;
    onstep?: (id: string) => void;
    onoverview?: () => void;
    /** Per-reading note count on THIS object (ExhibitView computes it for the active object) — threaded
     *  straight to the ReadingLegend so each layer shows how many notes it adds to this image. */
    readingCount?: (id: string | null) => number;
  } = $props();

  // Show the sidebar object-nav only with real siblings to step AND the wiring to drive it. When present
  // it owns "back to the overview", so the top "← Back to exhibit" would be redundant — suppressed below.
  const objectNav = $derived(
    !!siblings && siblings.length > 1 && !!currentId && !!onstep && !!onoverview,
  );
  // Index of the current object among siblings — drives the collapsed-mode popup's footer stepper (mirrors
  // SidebarObjectNav). `stepIntoReading` is set just before a popup step so the object-change effect below
  // re-selects the new object's first note instead of clearing — flip-and-read keeps the popup open.
  const navIdx = $derived(siblings ? siblings.findIndex((s) => s.id === currentId) : -1);
  let stepIntoReading = false;
  function stepObject(delta: number) {
    if (!siblings) return;
    const i = navIdx + delta;
    if (i < 0 || i >= siblings.length) return;
    stepIntoReading = true;
    onstep?.(siblings[i].id);
  }
  // NOTE (dba2): the prev/next carousel that occluded the image TOP-CENTER stays lifted out into the
  // persistent top bar (ViewerShell) — its home for sidebar-open reading. The collapsed-mode popup's footer
  // stepper is bottom-left, so it never re-creates that occlusion. ExhibitView drives both from `selectedObjectId`.

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
    // Object actually changed: clear the selection — UNLESS a popup step asked to carry the reading, in
    // which case land on the new object's first note (flip-and-read) so the collapsed-mode popup persists.
    if (prevCanvas !== undefined && prevCanvas !== c) {
      selected = stepIntoReading ? (annotations[0]?.id ?? null) : null;
      stepIntoReading = false;
    }
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
    // membership guard (review): only adopt a target that exists in THIS object's notes — defends a
    // stale initialSelected on a manual carousel switch, and keeps the cross-object jump correct
    // regardless of effect order (object-change clears, this re-selects the now-present note).
    if (next !== null && next !== prevInitialSelected && annotations.some((a) => a.id === next)) selected = next;
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
    <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} count={readingCount} />
  {/if}

  <!-- min/max match the aside's responsive clamp(320px … 560px) so a resize can't escape the designed
       reading-measure (#14) — the floor and ceiling are the same numbers the CSS clamp uses. -->
  <ResizeDivider side="right" label="notes" min={320} max={560} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />
  <!-- Collapsed = the floating card is the sole note + nav surface, so the clipped aside (width:0,
       overflow:hidden) must leave the a11y tree + tab order too — `inert` stops its note list and
       SidebarObjectNav being announced or tabbed as invisible duplicates of the card (and its footer
       stepper). The ResizeDivider is a sibling, so un-collapsing stays reachable. -->
  <aside class:collapsed={asideCollapsed} inert={asideCollapsed} style:--reader-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    {#if onback && !objectNav}
      <button class="exhibit-back soft-btn" onclick={() => onback?.()}>← Back to Exhibit</button>
    {/if}
    <!-- The sidebar is ALWAYS the note list now (parity with the narrative spine): selecting a note floats
         the shared NotePopup over the canvas rather than swapping this pane to a detail view. The selected
         note's list card stays lit (.active) so the open list shows which note the floating card holds. -->
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
          <button class:active={it.id === selected} style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)} onfocus={() => onnotehover?.(it.id ?? null)} onblur={() => onnotehover?.(null)}>
            <span class="card-preview">{stripMarkdown(commentOf(it))}</span>
          </button>
          <!-- Card tags live OUTSIDE the card button (no nested buttons) and are their own facet
               triggers (Q-4): click one to open the finder pre-scoped with that tag. -->
          {#if tagsOf(it).length}<span class="card-tags">{#each tagsOf(it) as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</span>{/if}
        </li>
      {/each}
    </ul>
    <p class="hint">Select a note, or a marker on the image. Markers stay pinned as you pan and zoom, and selecting one zooms in.</p>
    {#if objectNav && siblings && currentId}
      <SidebarObjectNav {siblings} {currentId} onstep={(id) => onstep?.(id)} onoverview={() => onoverview?.()} />
    {/if}
  </aside>

  {#if current}
    <!-- The standalone note card (shared NotePopup), floating on ANY marker/note selection — parity with
         the narrative. The footer stepper (steps OBJECTS, flip-and-read via stepObject) appears only when
         the sidebar is COLLAPSED; with it open, SidebarObjectNav owns object stepping, so the card carries
         no stepper then — one object-nav at a time, no duplicate "Objects in this exhibit" landmark. -->
    <NotePopup
      eyebrow={object.label}
      text={noteParts.text}
      media={noteParts.media}
      tags={tagsOf(current)}
      {geoCoord}
      step={objectNav && siblings && asideCollapsed ? { index: navIdx, total: siblings.length, prevLabel: siblings[navIdx - 1]?.label, nextLabel: siblings[navIdx + 1]?.label, unit: "object", navLabel: "Objects in this exhibit" } : null}
      onclose={() => (selected = null)}
      onexpand={() => { if (noteParts.text) readingSheet = { text: noteParts.text }; else if (noteParts.media.length) lightbox = { media: noteParts.media, text: noteParts.text, index: 0 }; }}
      onstep={(d) => stepObject(d)}
      onopenfinder={(t) => onopenfinder?.(t)}
      onmedia={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })}
    />
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
  li > button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  li > button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  /* Selected note (parity with the narrative's active-section mark): the open list shows which note the
     floating card currently holds. */
  li > button.active { background: var(--accent-muted); box-shadow: var(--shadow-lift-mid); }
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

  /* (Detail-state styles removed — the selected note now floats in the shared NotePopup, not an
     in-sidebar drawer; the note prose / media / tag styles live in NotePopup.svelte.) */
  /* Quiet found-meta chips (mono, tinted) — not loud orange fills; the orange stays rationed. */
  .tag { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }
  /* Clickable tag chip (Q-4 facet trigger) — button reset over the chip look; hover signals the
     cross-cutting discovery affordance with the rationed connector accent. */
  .tag-btn { border: none; cursor: pointer; transition: color 160ms ease, background 160ms ease; }
  .tag-btn:hover { color: var(--ink-paper-primary); background: var(--accent-muted); }
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-secondary); line-height: 1.6; margin-top: var(--space-5); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }

  /* The standalone note card's styles now live in the shared NotePopup.svelte component. */
</style>
