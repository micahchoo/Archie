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
  import MetadataList from "./MetadataList.svelte";
  import { loadAsideWidth, loadAsideCollapsed, saveAside, type AsideState } from "../aside-persistence.js";
  import { stripMarkdown, metadataRows } from "@render/core";
  import { type MarkerStyle, formatZoomRatio, zoomBand } from "@render/svelte";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, readingIdOf, geoOf, geoCenter, formatLngLat, arrivalPulseIntensity, withArrivalPulse, withZoomBand, type MarkerStyleSpec, type NoteMediaItem, type RightsFields, type W3CAnnotation, type Reading, type TileSourceDescriptor } from "@render/core";

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
    initialRegion = null,
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
    /** Deep-link sub-region (#/<slug>/a/<id>?xywh=…, Phase 3 / 4.2): the raw xywh fragment VALUE (e.g.
     *  `pixel:100,50,200,80` or `percent:…`) off the note link. When present the camera fits THIS region
     *  instead of the note's default mark bounds — a cite can frame a detail tighter than the whole mark.
     *  null = no region (the note's own bounds drive the camera). */
    initialRegion?: string | null;
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
    const target = siblings[i]; // bounds-checked below; the local narrows the indexed access for TS
    if (i < 0 || i >= siblings.length || !target) return;
    stepIntoReading = true;
    onstep?.(target.id);
  }
  // NOTE (dba2): the prev/next carousel that occluded the image TOP-CENTER stays lifted out into the
  // persistent top bar (ViewerShell) — its home for sidebar-open reading. The collapsed-mode popup's footer
  // stepper is bottom-left, so it never re-creates that occlusion. ExhibitView drives both from `selectedObjectId`.

  // Descriptive metadata (Archie-b50f) — the OBJECT's own entries, projected to display rows. It joins
  // the sidebar as a TAB beside Notes, not as another stacked slip: the sidebar is already spoken for,
  // and stacking made an expanded long value push the notes list below the fold. `rights` is the same
  // prop the credit line reads (metadata rides RightsFields), so this needs no new data path.
  const metaRows = $derived(metadataRows(rights));
  const hasDetails = $derived(metaRows.length > 0);
  // The reader's CHOICE survives stepping to a sibling object (comparing one field across objects is
  // the reason to open Details at all); `tab` collapses it to Notes whenever this object has no
  // metadata, so a tab can never be selected while its panel doesn't exist.
  const TABS = ["notes", "details"] as const;
  let tabWanted = $state<(typeof TABS)[number]>("notes");
  const tab = $derived<(typeof TABS)[number]>(hasDetails ? tabWanted : "notes");
  let tablistEl = $state<HTMLElement | null>(null);
  // APG tabs, automatic activation: arrows/Home/End move focus AND selection (both panels are cheap
  // to render, so there's nothing to defer with manual activation). Roving tabindex lives on the
  // buttons — exactly one tab is in the tab order at a time.
  function onTabKey(e: KeyboardEvent) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % TABS.length
      : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TABS.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    tabWanted = TABS[next]!;
    tablistEl?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  // A note's Reading colour (from the registry) — accents its list card + marker (ADR-0007).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = readingIdOf(it);
    return rid !== undefined ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  // svelte-ignore state_referenced_locally -- initial-capture is the contract: `initialSelected` seeds
  // selection once; LATER changes are adopted by the re-selection $effect below (prevInitialSelected).
  let selected = $state<string | null>(initialSelected);
  // Scale cue (Archie-93fd): current zoom / home zoom, streamed live from Canvas's onzoom. Defaults
  // to 1 (home/fit) — the value it settles back to once the canvas mounts and reports its own home.
  let zoomRatio = $state(1);

  // Deep-link sub-region (4.2): the camera target fragment for Canvas's `focus`. The route gives the raw
  // xywh VALUE (no `xywh=` prefix); fitRegion's parser needs the prefixed form, so add it when absent. A
  // `percent:` value parses to null in fitRegion → a safe no-op (the note's own bounds then drive the
  // camera), so an unsupported region never breaks the landing. null = no region cite.
  const focusRegion = $derived(
    initialRegion ? (initialRegion.startsWith("xywh=") ? initialRegion : `xywh=${initialRegion}`) : null,
  );

  // Worklist 1.3 (arrival moment): on first paint — and again when the carousel lands on another
  // object — the marks briefly emphasize, then settle to their quiet resting weight. Answers "where
  // do I start, what's here?" and gives touch readers (no hover-discovery) a way in.
  //
  // Archie-a6fb: this used to be a CSS breathe on `main.arrival .a9s-annotation`, but Annotorious 3
  // renders marks to a WebGL canvas with no per-shape SVG node — that selector matched nothing for a
  // month (probe 2026-07-19). Reimplemented through the SAME style channel the reading colours ride:
  // a decaying pulse intensity (arrivalPulseIntensity) drives withArrivalPulse over the base styleOf,
  // re-minting the styleOf identity each frame so Canvas re-applies it (setStyle) and the sweep shows.
  let pulseIntensity = $state(0);
  let pulseRaf = 0;
  // Respect prefers-reduced-motion (parity with the retired `animation: none` rule): no sweep, marks
  // sit at their resting weight. Guarded for SSR (Astro renders this island server-side first).
  const reduceMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function pulseMarks() {
    if (reduceMotion) return;
    cancelAnimationFrame(pulseRaf);
    const start = performance.now();
    pulseIntensity = 1; // peak now, so the reveal lands on the same frame as arrival
    const step = () => {
      const k = arrivalPulseIntensity(performance.now() - start);
      pulseIntensity = k;
      pulseRaf = k > 0 ? requestAnimationFrame(step) : 0;
    };
    pulseRaf = requestAnimationFrame(step);
  }
  $effect(() => () => cancelAnimationFrame(pulseRaf)); // teardown on destroy

  // The pulse must start when the MARKS ARE ACTUALLY PAINTED, not when this island mounts: the OSD
  // surface resolves only after the (often remote IIIF) image `open` completes, which for the seed's
  // Yale folios routinely outlasts the ~1.4s pulse — firing at mount would decay the whole sweep
  // before setStyle can ever apply it (the reveal would be invisible on exactly the app's primary
  // content). So each object landing ARMS the pulse, and Canvas's first `onzoom` after mount — which
  // fires once the surface is ready and marks are drawn — DISARMS it and starts the sweep.
  let armArrival = false;
  function onCanvasZoom(r: number) {
    zoomRatio = r;
    if (armArrival) { armArrival = false; pulseMarks(); }
  }

  // Scale-aware weight (Archie-c1d9 inherited decision): the coarse zoom band, memoized BY VALUE so it
  // only re-mints the styleOf identity when the band actually crosses far↔mid↔near (not every zoom
  // frame) — same shape as studio's zoomBandNow.
  const band = $derived(zoomBand(zoomRatio));
  // Wrap the reading styleOf (from ExhibitView) with the scale-aware weight AND the transient arrival
  // emphasis — one style channel, layered: withZoomBand is the RESTING modulation (far → heavier stroke
  // for presence at fit-width, near → recede), withArrivalPulse the transient on top. Order matters: the
  // pulse lerps fillOpacity toward 0.3 for the reveal, and running it LAST keeps the existing comparing
  // transient exactly as it was (withZoomBand leaves an outline-only mark's fill at 0). At rest (intensity
  // 0, mid band) it returns the base styleOf UNCHANGED so the identity stays stable between arrivals.
  const pulsedStyleOf = $derived.by<((id: string) => MarkerStyle | undefined) | undefined>(() => {
    const base = styleOf;
    const k = pulseIntensity;
    const b = band;
    if (!base) return base;
    if (k <= 0 && b === "mid") return base; // no modulation active — keep the stable identity
    return (id: string) => {
      const s = base(id);
      if (!s) return s;
      const scaled = withZoomBand(s as MarkerStyleSpec, b);
      return k > 0 ? withArrivalPulse(scaled, k) : scaled;
    };
  });

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
    armArrival = true; // every landing (first paint or carousel switch) arms the reveal; the
                       // canvas-ready onzoom below fires it once marks are actually on screen
  });

  // Re-selection seam (A0): when ExhibitView's arriveAtNote re-fires on an ALREADY-mounted Reader
  // (search jump Q-4, keyboard index Q-5), `initialSelected` changes to a new note — `selected` was
  // only seeded once at $state init, so without this the re-selection did nothing. Track the previous
  // value and adopt a new non-null target; `selected` is bound into Canvas (zoomOnSelect), so the
  // camera fits the new mark just as it does on a marker click. Null clears (e.g. arrival dismissed)
  // are NOT forced here — the object-change effect owns clearing, so this only drives positive jumps.
  // svelte-ignore state_referenced_locally -- deliberately the initial value: this is the previous-value
  // tracker the $effect below compares against; seeding it reactively would defeat the comparison.
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
  <main>
    <!-- Key on the object so the OSD viewer REMOUNTS (loads the new image) when the carousel switches
         objects — Canvas creates the viewer once in onMount, so without this only annotations swap. -->
    {#key object.canvasId}
      <Canvas source={object.source} tileSource={object.tileSource} canvasId={object.canvasId} annotations={canvasAnnotations} styleOf={pulsedStyleOf} frame={canvasFrame} focus={focusRegion} zoomOnSelect locator bind:selected onzoom={onCanvasZoom} />
    {/key}
    <!-- Scale cue (Archie-93fd): the locator answers WHERE the viewport sits in the image; this answers
         HOW FAR IN. Top-right of the CANVAS — V40: it used to sit inside `.reader`, the flex row holding
         the canvas AND the notes aside, so `right:` measured from the aside's right edge and painted the
         readout 264px inside the sidebar, on top of the object title. Its own comment already claimed the
         canvas's top-right corner; it just wasn't in a container that could give it one. `main` is
         already `position: relative`, so moving it in is the whole fix.
         Quiet by design: small, muted, no button chrome — a readout, not an action. aria-live so a
         screen-reader user hears it change without it stealing focus. -->
    <span class="scale-cue" aria-live="polite"><span class="sc-label">Zoom</span> {formatZoomRatio(zoomRatio)}</span>
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
  <!-- The note list, ONE definition: it renders either inside the Notes tabpanel (this object has
       metadata) or bare under the plain "Notes · N" heading (it doesn't). A snippet, not a copy —
       the two branches must never drift. -->
  {#snippet notesPanel()}
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
  {/snippet}

  <aside class:collapsed={asideCollapsed} inert={asideCollapsed} style:--reader-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    {#if onback && !objectNav}
      <button class="exhibit-back soft-btn" onclick={() => onback?.()}>← Back to Exhibit</button>
    {/if}
    <!-- The sidebar is ALWAYS the note list now (parity with the narrative spine): selecting a note floats
         the shared NotePopup over the canvas rather than swapping this pane to a detail view. The selected
         note's list card stays lit (.active) so the open list shows which note the floating card holds. -->
    <h1 class="object-label">{object.label}</h1>
    {#if object.summary}<p class="object-summary">{object.summary}</p>{/if}
    <!-- The credit sits ABOVE the tab pair, visible from both tabs: the IIIF requiredStatement is a
         MUST-display, and it must never become a row of the Details list (rights are a typed slot,
         distinguished by FORM — tracked mono line vs. the list's hanging-key voice). -->
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
    {#if hasDetails}
      <!-- Real APG tablist (roving tabindex, automatic activation) — not styled divs. -->
      <div class="tabs" role="tablist" aria-label="About this image" bind:this={tablistEl}>
        <button type="button" role="tab" id="reader-tab-notes" aria-controls="reader-panel-notes"
                aria-selected={tab === "notes"} tabindex={tab === "notes" ? 0 : -1}
                onclick={() => (tabWanted = "notes")} onkeydown={onTabKey}>Notes · {annotations.length}</button>
        <button type="button" role="tab" id="reader-tab-details" aria-controls="reader-panel-details"
                aria-selected={tab === "details"} tabindex={tab === "details" ? 0 : -1}
                onclick={() => (tabWanted = "details")} onkeydown={onTabKey}>Details · {metaRows.length}</button>
      </div>
      <!-- tabindex=0 on the panels per APG: the Notes panel holds no focusable element when the object
           has no notes, and a keyboard reader must still be able to reach what the tab revealed. -->
      <div role="tabpanel" id="reader-panel-notes" aria-labelledby="reader-tab-notes" tabindex="0" hidden={tab !== "notes"}>
        {@render notesPanel()}
      </div>
      <div role="tabpanel" id="reader-panel-details" aria-labelledby="reader-tab-details" tabindex="0" hidden={tab !== "details"}>
        <!-- Key on the object (same identity as the canvas key above) so the list REMOUNTS when the
             carousel steps: MetadataList's per-value expansion is plain $state keyed by row+index, and
             ExhibitView keys Reader on the EXHIBIT id — so one instance serves every folio. Without this
             key, expanding Provenance on one folio leaves the next folio's Provenance pre-expanded
             ("Show less") on a value the reader never opened. The TAB choice deliberately survives the
             step (it lives in Reader, above this key); the expansion deliberately does not. -->
        {#key object.canvasId}
          <MetadataList rows={metaRows} />
        {/key}
      </div>
    {:else}
      <!-- No metadata on this object: no lone tab. The sidebar keeps exactly its pre-b50f shape. -->
      <h2 class="eyebrow">Notes · {annotations.length}</h2>
      {@render notesPanel()}
    {/if}
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
  /* Scale cue (Archie-93fd) — a canvas overlay, same anchoring strategy as .legend (absolute within
     the reader's positioned container, top-aligned under the fixed top bar). Deliberately the
     quietest thing on the canvas: no card/shadow/border like .legend or the note popup — just muted
     mono text, low-contrast, easy to read past. */
  .scale-cue {
    position: absolute; z-index: 20; top: var(--topbar-h); right: var(--space-5);
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-mono), monospace; font-size: 0.72rem; letter-spacing: 0.02em;
    color: var(--ink-canvas-muted);
    background: var(--surface-canvas-raised); border-radius: var(--radius-sm);
    pointer-events: none; /* a readout, not a control */
  }
  .scale-cue .sc-label {
    font-family: var(--font-ui), sans-serif; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; margin-right: 2px;
  }
  /* Worklist 1.3 arrival reveal (Archie-a6fb): the marks' one-shot emphasis-and-settle used to be a
     CSS breathe here on `.a9s-annotation`, but Annotorious 3 renders marks to WebGL (no per-shape
     SVG node), so that selector was inert for a month. It now rides the style channel — see
     pulseMarks / pulsedStyleOf in the script (prefers-reduced-motion honoured there via reduceMotion). */

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

  /* Notes | Details tab pair (Archie-b50f). It stands exactly where the "Notes · N" eyebrow stood and
     keeps that voice — tracked uppercase chrome, no pill, no fill. The selected tab is signalled by
     ink weight PLUS a 2px accent rule, so the state survives greyscale and low contrast; the shared
     hairline under the pair is what makes the two read as one control rather than two labels. */
  .tabs { display: flex; gap: var(--space-5); margin: 0 0 var(--space-4); border-bottom: 1px solid var(--border-paper-emphasis); }
  .tabs button {
    background: none; border: none; cursor: pointer;
    padding: 0 0 var(--space-2); margin-bottom: -1px;
    border-bottom: 2px solid transparent;
    font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 400;
    letter-spacing: 0.26em; text-transform: uppercase;
    color: var(--ink-paper-secondary);
    transition: color 160ms ease, border-color 160ms ease;
  }
  .tabs button:hover { color: var(--ink-paper-primary); }
  .tabs button[aria-selected="true"] { color: var(--ink-paper-primary); border-bottom-color: var(--accent); }
  /* The panel is focusable (APG) but is not itself an affordance — no focus ring styling beyond the
     browser default outline, which only shows for keyboard focus. */
  [role="tabpanel"]:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 4px; border-radius: var(--radius-sm); }

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
