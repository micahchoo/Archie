<script lang="ts">
  // Narrative layout (CONTEXT §92; ADR-0005 — the "third-layer" model). A prose-spine of ordered Sections
  // beside the canvas. Reading is prose-led: the ACTIVE section DRIVES the canvas — it switches to that
  // section's `objectId` object and fits its `start` region (a media fragment) — NOT coupled to annotation
  // order (the old section-i↔note-i index coupling is gone). An AV-object section renders the temporal
  // MediaPlayer instead of the OSD canvas. Markers shown = the active object's notes (progressive §122 = v1.1).
  import Canvas from "@render/svelte/Canvas.svelte";
  import ResizeDivider from "@render/svelte/ResizeDivider.svelte";
  import MediaPlayer from "./MediaPlayer.svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import ReadingSheet from "./ReadingSheet.svelte";
  import NotePopup from "./NotePopup.svelte";
  import Credit from "./Credit.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import ProseCites from "./ProseCites.svelte";
  import { type MarkerStyle, type FrameOverlay, formatZoomRatio, zoomBand } from "@render/svelte";
  import { loadAsideWidth, loadAsideCollapsed, saveAside, type AsideState } from "../aside-persistence.js";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, overlay, geoOf, geoCenter, formatLngLat, readingIdOf, stripMarkdown, withZoomBand, type MarkerStyleSpec, type AObject, type NoteMediaItem, type Reading, type RightsFields, type W3CAnnotation, type Section } from "@render/core";
  import { ownerObjectOf, arrivalSectionIndex } from "../narrative-landing.js";
  import { positionLabel } from "../exhibit-nav.js";

  // Resizable / collapsible narrative spine (Phase-2 expandability). `asideWidth` is a px OVERRIDE of the
  // responsive clamp() default (null ⇒ default); persisted per the archie.*.v1 metadata idiom. Drag math
  // is headless-tested in @render/core; ResizeDivider is the handle. Collapse = give the canvas the page.
  const ASIDE_W_KEY = "archie.narrativeAsideWidth.v1";
  const ASIDE_COLLAPSED_KEY = "archie.narrativeAsideCollapsed.v1";
  let asideWidth = $state<number | null>(loadAsideWidth(ASIDE_W_KEY));
  let asideCollapsed = $state<boolean>(loadAsideCollapsed(ASIDE_COLLAPSED_KEY));
  // Expand a long note into the centred reading sheet (Phase-3 focus surface).
  let readingSheet = $state<{ text: string } | null>(null);

  let {
    objects = [],
    canvasIdOf,
    annotationsByObject = {},
    readingAnnotationsByObject = {},
    sections = [],
    title = "",
    rights,
    readings = [],
    activeReading = null,
    onreading,
    styleFor,
    frameFor,
    initialSelected = null,
    initialSection = null,
    notesHidden = false,
    onhiddenchange,
    onindex,
    onopenfinder,
  }: {
    objects: AObject[];
    /** Resolve an object id to its published canvas IRI (the Viewer owns the slug). */
    canvasIdOf: (objectId: string) => string;
    annotationsByObject?: Record<string, W3CAnnotation[]>;
    /** Per object id → per reading id → that reading's notes (ADR-0007). */
    readingAnnotationsByObject?: Record<string, Record<string, W3CAnnotation[]>>;
    sections?: Section[];
    title?: string;
    /** The exhibit-level credit/license (Q5), shown under the title beside the spine hint. */
    rights?: RightsFields;
    /** The exhibit's Readings (ADR-0007) — drives the canvas legend. Empty = no legend. */
    readings?: Reading[];
    activeReading?: string | null;
    onreading?: (id: string | null) => void;
    /** Per-object marker styler (objectId → (annId → style)); colours markers by Reading. */
    styleFor?: (objectId: string) => (id: string) => MarkerStyle | undefined;
    /** 7e1f coverage border — the whole-object mark to frame the ACTIVE object's canvas with (mirrors
     *  Reader.svelte's `frame` prop; a callback here since the active object changes internally as the
     *  spine steps, not from ExhibitView). null return = no frame for that object. Absent = never framed —
     *  a whole-object (selectorless, ADR-0018) note would otherwise have no marker AND no list entry in
     *  the narrative (its sidebar is the section spine, not a note list), making it unreachable. */
    frameFor?: (objectId: string) => { markId: string; colour: string } | null;
    initialSelected?: string | null; // deep-link arrival: land on the section whose object owns this note
    /** Section-cite arrival (#/<slug>/s/<id>, ADR-0021 / 4.6): the resolved (in-range) section index to
     *  land the spine on. Takes precedence over a note's owning-section when both are present (an explicit
     *  section cite wins). null = no section cite. */
    initialSection?: number | null;
    /** Hide-all (ReadingLegend declutter): canvas draws no markers except the SELECTED one. */
    notesHidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** Open the object grid as an index (ADR-0016 keystone): the narrative leads, but the grid stays
     *  reachable behind it — precision-in/escape-out (§137), never a dead-end takeover. Absent = hide it. */
    onindex?: () => void;
    /** A tag chip in the note popup was clicked (Q-4): open the mode-independent finder pre-scoped with
     *  that tag as a facet — the narrative's only discovery surface besides the finder itself. */
    onopenfinder?: (tag: string) => void;
  } = $props();

  // Deep-link arrival → land on the right section. An explicit section cite (4.6) wins; else land on the
  // section whose object OWNS the note. The owner search now scans BASE + per-reading pages (4.9) via the
  // shared resolver — a note that lives ONLY on a reading overlay used to fall to section 0.
  // svelte-ignore state_referenced_locally -- initial-capture is deliberate: the object list is stable
  // for a mounted narrative (ExhibitView remounts the reader per exhibit); these ids seed arrival only.
  const objectIds = objects.map((o) => o.id);
  const arrivalSection = (() => {
    if (initialSection !== null) return initialSection;
    return arrivalSectionIndex(initialSelected, objectIds, sections, { annotationsByObject, readingAnnotationsByObject });
  })();

  let activeIndex = $state(arrivalSection);
  // svelte-ignore state_referenced_locally -- initial-capture is the contract: seeds once; later
  // changes are adopted by the re-selection seam (A0) $effect below via prevInitialSelected.
  let selected = $state<string | null>(initialSelected); // a clicked marker (highlight), distinct from the active section
  // Scale cue (Archie-93fd): current zoom / home zoom, streamed live from Canvas's onzoom. Defaults
  // to 1 (home/fit) — the value it settles back to once the canvas mounts and reports its own home.
  // Only meaningful for the spatial (non-AV) branch — see the `{#if !isAV}` guard below.
  let zoomRatio = $state(1);

  // Re-selection seam (A0): when ExhibitView's arriveAtNote re-fires on an ALREADY-mounted narrative
  // (search jump Q-4, keyboard index Q-5), `initialSelected` changes to a new note. `selected` and
  // `activeIndex` were only seeded once at init, so without this the re-selection did nothing. Track the
  // previous value; on a new non-null target, select it AND jump to the section whose object owns it
  // (mirrors arrivalSection — the canvas follows `activeSection.start`, so the camera fits the region).
  // svelte-ignore state_referenced_locally -- deliberately the initial value: the previous-value tracker
  // the $effect below compares against; seeding it reactively would defeat the comparison.
  let prevInitialSelected: string | null = initialSelected;
  $effect(() => {
    const next = initialSelected;
    if (next !== null && next !== prevInitialSelected) {
      selected = next;
      // Owner search scans BASE + per-reading pages (4.9) — a reading-only note now lands on its section.
      const ownerId = ownerObjectOf(next, objectIds, { annotationsByObject, readingAnnotationsByObject });
      const idx = sections.findIndex((s) => s.objectId === ownerId);
      if (idx >= 0) activeIndex = idx;
    }
    prevInitialSelected = next;
  });

  const activeSection = $derived(sections[activeIndex]);
  const activeObject = $derived.by(() => {
    // A section whose objectId no longer resolves (its object was deleted in Studio without the section
    // being pruned) must NOT silently fall back to objects[0] — that pairs the WRONG image with this
    // section's prose. Undefined → the render gate surfaces a broken-reference state. Only the no-section
    // case keeps the objects[0] default.
    if (!activeSection) return objects[0];
    return objects.find((o) => o.id === activeSection.objectId);
  });
  const isAV = $derived(activeObject?.mediaType === "sound" || activeObject?.mediaType === "video");
  // Base notes are always visible (Q16); an active Reading overlays its notes on top (ADR-0007) —
  // mirrors ExhibitView.annotationsOf / Reader semantics so the narrative spine carries Readings too.
  const activeNotes = $derived.by(() => {
    if (!activeObject) return [] as W3CAnnotation[];
    const base = annotationsByObject[activeObject.id] ?? [];
    if (activeReading === null) return base;
    return overlay(base, readingAnnotationsByObject[activeObject.id]?.[activeReading]);
  });
  // Scale-aware weight (Archie-c1d9 inherited decision, parity with Reader): wrap the reading styleOf
  // with withZoomBand off the coarse band (memoized BY VALUE so the styleOf identity only re-mints on a
  // band crossing, not every zoom frame). No arrival pulse here — the narrative has no arrival moment.
  const band = $derived(zoomBand(zoomRatio));
  const activeStyleOf = $derived.by<((id: string) => MarkerStyle | undefined) | undefined>(() => {
    const base = activeObject ? styleFor?.(activeObject.id) : undefined;
    const b = band;
    if (!base || b === "mid") return base; // mid = the authored resting weight; keep the stable identity
    return (id: string) => {
      const s = base(id);
      return s ? withZoomBand(s as MarkerStyleSpec, b) : s;
    };
  });
  // 7e1f coverage border (parity with Reader.svelte): the whole-object mark for the ACTIVE object, if any.
  // Without this a selectorless (ADR-0018) whole-object note has no marker (read-overlay skips it — no
  // geometry to draw) AND no sidebar entry (the aside here is the section spine, not a note list) — so it
  // was unreachable in the narrative. The frame's corners activate the same `selected` path a marker does.
  const activeFrame = $derived(activeObject && frameFor ? frameFor(activeObject.id) : null);
  const canvasFrame = $derived<FrameOverlay | null>(
    activeFrame && !notesHidden ? { colour: activeFrame.colour, onActivate: () => (selected = activeFrame.markId) } : null,
  );
  const multiObject = $derived(new Set(sections.map((s) => s.objectId)).size > 1);
  // Per-layer note count on the ACTIVE object for the legend (id=null → base / General notes). Re-mints
  // when the active section's object changes, so the legend's counts track the canvas you're reading.
  const readingCount = $derived.by(() => {
    const oid = activeObject?.id;
    const base = oid ? (annotationsByObject[oid] ?? []) : [];
    const byR = oid ? (readingAnnotationsByObject[oid] ?? {}) : {};
    return (id: string | null): number => (id === null ? base.length : (byR[id]?.length ?? 0));
  });

  function activate(i: number) { activeIndex = i; selected = null; }

  // Aside pane toggle: the spine (the authored read) or the ACTIVE object's note list. The narrative's
  // aside was sections-only, so an object's notes were reachable solely via canvas markers — fine for a
  // sighted mouse reader who spots the pins, a wall for anyone scanning "what's written on this item?".
  // Notes mode reuses the Reader sidebar's card idiom; a card selects the same `selected` path a marker
  // click does. Per-session component state (like the filmstrip), defaults to the leading read.
  let asidePane = $state<"sections" | "notes">("sections");
  // A note's Reading colour (from the registry) — accents its list card's edge (ADR-0007; mirrors Reader).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = readingIdOf(it);
    return rid !== undefined ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  // Footer stepper (the note-pop's multi-object nav, in narrative form): step the SECTION — which switches
  // the active object whenever the spine crosses to one. Unlike activate(), this CARRIES the reading: it
  // selects the next section-object's first note so the note-pop stays open across the step (flip-and-read),
  // instead of activate()'s selected=null unmounting it. Falls to null only when that object has no notes.
  function stepSection(delta: number) {
    const ni = activeIndex + delta;
    if (ni < 0 || ni >= sections.length) return;
    activeIndex = ni;
    const obj = objects.find((o) => o.id === sections[ni]?.objectId);
    let notes = obj ? (annotationsByObject[obj.id] ?? []) : [];
    if (obj && activeReading !== null) notes = overlay(notes, readingAnnotationsByObject[obj.id]?.[activeReading]);
    selected = notes[0]?.id ?? null;
  }

  // Note popup on marker click (CONTEXT §123 "Both: annomea popup/drawer on marker click"). Narrative
  // was missing this entirely — a clicked marker selected but showed nothing, so notes never surfaced.
  const current = $derived(activeNotes.find((it) => it.id === selected));
  // Hide-all: the canvas shows only the selected note's mark (or nothing) — declutter the basemap while a
  // marker pick still surfaces its single pin. The spine + popup keep the full active-notes set. The framed
  // note's own rect is dropped too (mirrors Reader.svelte's canvasAnnotations) — its coverage border IS its
  // mark, so drawing the underlying shape as well would double it.
  const canvasNotes = $derived.by(() => {
    if (notesHidden) { const sel = activeNotes.find((a) => a.id === selected); return sel ? [sel] : []; }
    return activeFrame ? activeNotes.filter((a) => a.id !== activeFrame.markId) : activeNotes;
  });
  const noteParts = $derived(current ? splitNoteMedia(commentOf(current)) : { media: [] as NoteMediaItem[], text: "" });
  // Geo readout (Q7): a Map note shows its centre lng/lat in the opened popup.
  const geoCoord = $derived.by(() => { if (!current) return null; const g = geoOf(current); return g ? formatLngLat(geoCenter(g)) : null; });
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);

  // Esc closes the open note-pop (#3), matching the Reader. Guarded so the lightbox / reading sheet own
  // Esc while open; arrows stay with OpenSeadragon (it pans the canvas), so only Esc is bound here.
  function onkey(e: KeyboardEvent) {
    if (lightbox || readingSheet) return;
    if (e.key === "Escape" && selected !== null) { selected = null; e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="narrative">
  <main>
    {#if activeSection && !activeObject}
      <!-- A section references an object that's no longer in the exhibit (deleted, section not pruned).
           Surface it instead of silently showing the wrong image with this section's prose. -->
      <div class="missing-obj"><span aria-hidden="true">⚠</span><span>This section points to an item that’s no longer in the exhibit.</span></div>
    {:else if activeObject}
      {#if isAV}
        <!-- Keyed so an AV→AV section step remounts the player (its media/error state has no per-object
             reset); mirrors the Canvas branch's {#key activeObject.id} below. -->
        {#key activeObject.id}
          <MediaPlayer object={activeObject} annotations={activeNotes} />
        {/key}
      {:else}
        {#key activeObject.id}
          <Canvas
            source={activeObject.source}
            tileSource={activeObject.tileSource}
            canvasId={canvasIdOf(activeObject.id)}
            annotations={canvasNotes}
            styleOf={activeStyleOf}
            frame={canvasFrame}
            focus={activeSection?.start ?? null}
            bind:selected
            onzoom={(r) => (zoomRatio = r)}
          />
        {/key}
      {/if}
    {/if}
    <!-- V80: this group lived OUTSIDE `main`, so "top-right canvas chrome" was positioned against the
         row holding the canvas AND the prose spine — and landed on the spine. Structurally the same bug
         as V40's zoom readout in the grid reader. Inside `main` it anchors to the canvas it describes. -->
    <!-- Top-right canvas chrome group (ADR-0016 keystone + Archie-93fd): the grid-index escape and the
         scale cue share ONE anchored flex row instead of two separately-positioned absolutes, so they
         stack deterministically (gap, not guessed offsets) instead of risking overlap when both are
         present. Grid-index escape: the narrative leads, but the object grid stays reachable BEHIND it
         as an index (§137 precision-in/escape-out; §223 anti-trap) — shown only when there's a grid to
         reach (>1 object). Scale cue: the locator's missing companion, HOW FAR IN vs WHERE — hidden
         during an AV section (no OSD zoom to report then). -->
    <div class="canvas-chrome-right">
      {#if onindex && objects.length > 1}
        <button type="button" class="to-index" onclick={onindex}>
          <span class="grid-mark" aria-hidden="true">▦</span>All objects
        </button>
      {/if}
      {#if !isAV}
        <span class="scale-cue" aria-live="polite"><span class="sc-label">Zoom</span> {formatZoomRatio(zoomRatio)}</span>
      {/if}
    </div>
  </main>

  {#if onreading && readings.length > 0}
    <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} count={readingCount} />
  {/if}


  <!-- min/max match the spine's responsive clamp(360px … 620px) so a resize can't escape the designed
       reading-measure (#14). -->
  <ResizeDivider side="right" label="narrative" min={360} max={620} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />
  <!-- Collapsed = give the canvas the page; the note-pop (with its footer section-stepper) becomes the
       sole reading + nav surface, so `inert` drops the clipped spine (its section list) out of the a11y
       tree + tab order — no invisible duplicate of the stepper's section nav. The ResizeDivider is a
       sibling, so re-expanding stays reachable (§223 anti-trap). -->
  <aside class:collapsed={asideCollapsed} inert={asideCollapsed} style:--narr-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    <p class="eyebrow">Narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}
      {#if sections.length > 1}<span class="spine-pos">· {positionLabel(activeIndex, sections.length, "Section")}</span>{/if}</p>
    <h1>{title}</h1>
    <p class="hint">{asidePane === "sections"
      ? `Read down the page, or jump to any section. The image follows along, zooming to what each section is about${multiObject ? ", and switching between items as you go" : ""}.`
      : "Notes written on the item you’re reading. Select one to open it — its marker lights up on the image."}</p>
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
    <!-- Pane toggle: the authored read (sections) ⇄ the active object's notes. Without it, an item's
         notes were reachable only by spotting canvas markers — no listable surface in the narrative. -->
    <div class="pane-toggle" role="group" aria-label="Show sections or notes">
      <button type="button" class:active={asidePane === "sections"} aria-pressed={asidePane === "sections"} onclick={() => (asidePane = "sections")}>Sections</button>
      <button type="button" class:active={asidePane === "notes"} aria-pressed={asidePane === "notes"} onclick={() => (asidePane = "notes")}>Notes · {activeNotes.length}</button>
    </div>
    {#if asidePane === "sections"}
    <ol class="sections">
      {#each sections as s, i (s.id)}
        <li>
          <button class:active={i === activeIndex} onclick={() => activate(i)}>
            <span class="num">{s.title}{#if multiObject && objects.length > 1}<span class="obj"> · {objects.find((o) => o.id === s.objectId)?.label ?? ""}</span>{/if}</span>
            <div class="prose"><ProseCites text={s.prose ?? ""} /></div>
          </button>
        </li>
      {/each}
    </ol>
    {:else}
    <!-- The active object's note list — the Reader sidebar's card idiom (reading-colour edge, 3-line
         preview clamp, per-card tag chips as finder facets). A card drives the SAME `selected` path a
         marker click does, so the shared NotePopup floats identically. Re-mints as the spine crosses
         objects (activeNotes tracks the active section's object). -->
    {#if multiObject && activeObject}<h2 class="eyebrow notes-obj">On “{activeObject.label}”</h2>{/if}
    {#if activeNotes.length === 0}
      <p class="empty">No notes on this item yet.</p>
    {/if}
    <ul class="notes-list">
      {#each activeNotes as it (it.id)}
        <li>
          <button class:active={it.id === selected} style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)}>
            <span class="card-preview">{stripMarkdown(commentOf(it))}</span>
          </button>
          {#if tagsOf(it).length}<span class="card-tags">{#each tagsOf(it) as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</span>{/if}
        </li>
      {/each}
    </ul>
    {/if}
  </aside>

  {#if current}
    <!-- The standalone note card (shared NotePopup). Narrative form: the footer steps SECTIONS — which
         switch objects as the spine crosses them — and stepSection carries the reading so the card stays
         open across a step (flip-and-read) instead of activate()'s selected=null unmounting it. -->
    <NotePopup
      eyebrow={`${activeSection?.title ?? title}${multiObject && activeObject ? ` · ${activeObject.label}` : ""}`}
      text={noteParts.text}
      media={noteParts.media}
      tags={tagsOf(current)}
      {geoCoord}
      step={sections.length > 1 && asideCollapsed ? { index: activeIndex, total: sections.length, prevLabel: sections[activeIndex - 1]?.title, nextLabel: sections[activeIndex + 1]?.title, unit: "section", navLabel: "Sections in this narrative" } : null}
      onclose={() => (selected = null)}
      onexpand={() => { if (noteParts.text) readingSheet = { text: noteParts.text }; }}
      onstep={(d) => stepSection(d)}
      onopenfinder={(t) => onopenfinder?.(t)}
      onmedia={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })}
    />
  {/if}

  {#if readingSheet}
    <ReadingSheet text={readingSheet.text} onclose={() => (readingSheet = null)} />
  {/if}

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}
</div>

<style>
  /* Prose-led reading (Soft Static, narrative): the canvas floats on the warm gradient ground (left);
     the prose spine reads as a field journal on warm paper (right); section nav chrome is quiet mono,
     the active section is marked by a single rationed signal-orange edge — not a loud fill. Soft serif
     headings, generous radii, wide low-opacity warm shadows. No hard pixel edge anywhere. */
  .narrative { position: relative; display: flex; height: 100vh; background: var(--surface-canvas); }
  /* `position: relative` so the canvas chrome moved inside it (V80) anchors to the CANVAS rather than
     escaping to the row that also holds the prose spine. */
  main { position: relative; flex: 1; min-width: 0; background: var(--surface-canvas); }
  /* Broken-reference state: a section points at a deleted object. Quiet found-meta chrome over the canvas
     ground, not a loud error — the rest of the spine still reads. */
  .missing-obj { display: flex; gap: var(--space-3); align-items: center; justify-content: center; height: 100%; padding: var(--space-6); color: var(--ink-canvas-secondary); font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); }

  aside {
    /* Width = a token: responsive by default (clamp), drag-resizable via --narr-aside-w (Phase 2). */
    width: var(--narr-aside-w, clamp(360px, 32vw, 620px)); flex-shrink: 0; overflow: auto; box-sizing: border-box;
    /* Top reserves the fixed top bar (--pane-top) so the spine header (eyebrow · title · hint · credit)
       keeps its own space, clear of the bar overhead. */
    padding: var(--pane-top) var(--space-5) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  /* Collapsed = give the canvas the whole page (image-first). Divider stays (anti-trap §223: always expandable). */
  aside.collapsed { width: 0; min-width: 0; padding: 0; border-left: 0; overflow: hidden; }
  .eyebrow { color: var(--ink-paper-muted); }
  /* Persistent position indicator (Phase 4 / §146): "Section N of M", live as the spine scrolls. A quiet
     tabular-numeral echo in the eyebrow — connector-blue lifts it just off the category label beside it. */
  .spine-pos { color: var(--accent-2); font-variant-numeric: tabular-nums; }
  aside h1 { font-family: var(--font-display); font-weight: 300; font-size: 2rem; line-height: 1.2; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .hint { font-family: var(--font-body); font-size: 0.8rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-5); }

  /* Pane toggle (sections ⇄ notes) — a quiet segmented pair in the spine's mono eyebrow voice; the
     active pane gets the muted-accent fill (the same "you are here" mark the active section card uses),
     never a loud orange. */
  .pane-toggle { display: flex; gap: var(--space-2); margin: 0 0 var(--space-4); }
  .pane-toggle button {
    flex: none; cursor: pointer; padding: var(--space-2) var(--space-3);
    background: none; border: none; border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-muted);
    transition: background 160ms ease, color 160ms ease;
  }
  .pane-toggle button:hover { color: var(--ink-paper-primary); }
  .pane-toggle button.active { background: var(--accent-muted); color: var(--ink-paper-primary); }

  .sections { list-style: none; margin: 0; padding: 0; counter-reset: none; }
  .sections li { margin-bottom: var(--space-3); }
  .sections button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 2px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .sections button:hover { background: var(--surface-paper-hover); box-shadow: var(--shadow-lift-mid); }
  .sections button.active { border-left-color: var(--accent); background: var(--accent-muted); box-shadow: var(--shadow-lift-mid); }
  .num { display: inline-block; font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-paper-secondary); margin-bottom: var(--space-2); }
  .num .obj { color: var(--ink-paper-muted); letter-spacing: 0.14em; }
  .prose { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.65; color: var(--ink-paper-primary); }
  .prose :global(p) { margin: 0 0 var(--space-2); }
  .prose :global(p:last-child) { margin-bottom: 0; }
  .prose :global(strong) { font-weight: 600; }
  .prose :global(em) { font-style: italic; }
  /* Cite link-scent: underline + cursor so it reads as clickable; the ¶ seal marks an intra-Library
     cite (hash route into this viewer), matching the author-side ¶ Cite affordance. */
  .prose :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .prose :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  .prose :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-sm); margin-top: var(--space-2); }
  .prose :global(audio) { width: 100%; margin-top: var(--space-2); }
  /* Pulled quotes read as soft serif set off by a warm clay hairline rule. */
  .prose :global(blockquote) { margin: var(--space-3) 0; padding: 0 0 0 var(--space-4); border-left: 1px solid var(--accent-3); font-family: var(--font-display-2); font-weight: 600; font-style: italic; font-size: 1.2rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  /* Top-right canvas chrome group (Archie-93fd) — the grid-index escape and the scale cue anchor
     together, top-right of the canvas (the legend owns top-left), so a gap keeps them apart instead
     of each guessing an offset around the other. */
  .canvas-chrome-right {
    position: absolute; z-index: 20; top: var(--topbar-h); right: var(--space-5);
    display: flex; align-items: center; gap: var(--space-2);
  }
  /* Grid-index escape — a quiet canvas overlay, sibling to the legend (same warm-paper pill language).
     Recedes so the read stays the star, but is always reachable so the narrative can never trap the
     visitor (§223 anti-trap, §137 escape-out). Connector-blue (--accent-2) hover — the secondary
     up/nav signal — keeps the rationed orange for the one focal action, and is the established
     green-on-dark-canvas contrast rescue (system.md §contrast). */
  .to-index {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: none; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low); cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm);
    letter-spacing: 0.04em; transition: color 160ms ease;
  }
  .to-index:hover { color: var(--accent-2); }
  .to-index .grid-mark { font-size: 0.95rem; line-height: 1; color: var(--ink-canvas-muted); transition: color 160ms ease; }
  .to-index:hover .grid-mark { color: var(--accent-2); }
  /* Scale cue — the locator's missing companion (HOW FAR IN vs WHERE), ported verbatim from
     Reader.svelte so the two readers' cues read identically. Deliberately the quietest thing in the
     group: no button chrome, muted mono text — a readout, not an action. */
  .scale-cue {
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-mono), monospace; font-size: 0.72rem; letter-spacing: 0.02em;
    color: var(--ink-canvas-muted);
    background: var(--surface-canvas-raised); border-radius: var(--radius-sm);
    pointer-events: none;
  }
  .scale-cue .sc-label {
    font-family: var(--font-ui), sans-serif; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; margin-right: 2px;
  }

  /* Notes pane — the Reader sidebar's note-card idiom, ported verbatim so the two note lists read as
     one component (warm paper card, 3px Reading-colour edge, 3-line scan clamp, per-card tag chips). */
  .notes-obj { margin: 0 0 var(--space-3); }
  .notes-list { list-style: none; margin: 0; padding: 0; }
  .notes-list li > button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .notes-list li > button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); box-shadow: var(--shadow-lift-mid); }
  .notes-list li > button.active { background: var(--accent-muted); box-shadow: var(--shadow-lift-mid); }
  .card-preview { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .card-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .tag { font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }
  .tag-btn { border: none; cursor: pointer; transition: color 160ms ease, background 160ms ease; }
  .tag-btn:hover { color: var(--ink-paper-primary); background: var(--accent-muted); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.6; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }

  /* The standalone note card's styles now live in the shared NotePopup.svelte component. */
</style>
