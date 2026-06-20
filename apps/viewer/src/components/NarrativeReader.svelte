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
  import NoteMedia from "./NoteMedia.svelte";
  import Credit from "./Credit.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import ProseCites from "./ProseCites.svelte";
  import { type MarkerStyle } from "@render/svelte";
  import { loadAsideWidth, loadAsideCollapsed, saveAside, type AsideState } from "../aside-persistence.js";
  import { splitNoteMedia, commentOfAnnotation as commentOf, tagsOfAnnotation as tagsOf, overlay, geoOf, geoCenter, formatLngLat, type AObject, type NoteMediaItem, type Reading, type RightsFields, type W3CAnnotation, type Section } from "@render/core";

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
    initialSelected = null,
    notesHidden = false,
    onhiddenchange,
    onindex,
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
    initialSelected?: string | null; // deep-link arrival: land on the section whose object owns this note
    /** Hide-all (ReadingLegend declutter): canvas draws no markers except the SELECTED one. */
    notesHidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** Open the object grid as an index (ADR-0016 keystone): the narrative leads, but the grid stays
     *  reachable behind it — precision-in/escape-out (§137), never a dead-end takeover. Absent = hide it. */
    onindex?: () => void;
  } = $props();

  // Deep-link arrival → land on the section whose object owns the note (else section 0).
  const arrivalSection = (() => {
    if (!initialSelected) return 0;
    const ownerId = objects.find((o) => (annotationsByObject[o.id] ?? []).some((a) => a.id === initialSelected))?.id;
    const idx = sections.findIndex((s) => s.objectId === ownerId);
    return idx >= 0 ? idx : 0;
  })();

  let activeIndex = $state(arrivalSection);
  let selected = $state<string | null>(initialSelected); // a clicked marker (highlight), distinct from the active section

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
  const activeStyleOf = $derived(activeObject ? styleFor?.(activeObject.id) : undefined);
  const multiObject = $derived(new Set(sections.map((s) => s.objectId)).size > 1);

  function activate(i: number) { activeIndex = i; selected = null; }

  // Note popup on marker click (CONTEXT §123 "Both: annomea popup/drawer on marker click"). Narrative
  // was missing this entirely — a clicked marker selected but showed nothing, so notes never surfaced.
  const current = $derived(activeNotes.find((it) => it.id === selected));
  // Hide-all: the canvas shows only the selected note's mark (or nothing) — declutter the basemap while a
  // marker pick still surfaces its single pin. The spine + popup keep the full active-notes set.
  const canvasNotes = $derived.by(() => {
    if (!notesHidden) return activeNotes;
    const sel = activeNotes.find((a) => a.id === selected);
    return sel ? [sel] : [];
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
            focus={activeSection?.start ?? null}
            bind:selected
          />
        {/key}
      {/if}
    {/if}
  </main>

  {#if onreading && readings.length > 0}
    <ReadingLegend {readings} active={activeReading} onselect={onreading} hidden={notesHidden} {onhiddenchange} />
  {/if}

  <!-- Grid-index escape (ADR-0016 keystone): the narrative leads, but the object grid stays reachable
       BEHIND it as an index (§137 precision-in/escape-out; §223 anti-trap). Quiet canvas-side chrome,
       sibling to the legend — shown only when there's a grid to reach (>1 object). -->
  {#if onindex && objects.length > 1}
    <button type="button" class="to-index" onclick={onindex}>
      <span class="grid-mark" aria-hidden="true">▦</span>All objects
    </button>
  {/if}

  <!-- min/max match the spine's responsive clamp(360px … 620px) so a resize can't escape the designed
       reading-measure (#14). -->
  <ResizeDivider side="right" label="narrative" min={360} max={620} bind:width={asideWidth} bind:collapsed={asideCollapsed} oncommit={(s: AsideState) => saveAside(ASIDE_W_KEY, ASIDE_COLLAPSED_KEY, s)} />
  <aside class:collapsed={asideCollapsed} style:--narr-aside-w={asideWidth != null ? `${asideWidth}px` : null}>
    <p class="eyebrow">Narrative · {sections.length} {sections.length === 1 ? "section" : "sections"}</p>
    <h1>{title}</h1>
    <p class="hint">Read down the page, or jump to any section. The image follows along, zooming to what each section is about{multiObject ? ", and switching between items as you go" : ""}.</p>
    <p class="credit-row"><Credit {rights} tone="paper" /></p>
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
  </aside>

  {#if current}
    <!-- annomea popup: the selected marker's note, floating over the canvas (CONTEXT §123) -->
    <div class="note-pop">
      <button class="close" onclick={() => (selected = null)} aria-label="Close note">×</button>
      {#if noteParts.text}<button class="expand" onclick={() => (readingSheet = { text: noteParts.text })} title="Expand to read" aria-label="Expand note to a reading sheet">⤢</button>{/if}
      {#if noteParts.text}<div class="note-body"><ProseCites text={noteParts.text} /></div>{/if}
      <NoteMedia media={noteParts.media} onopen={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })} />
      {#if geoCoord}<p class="geo-coord" title="Longitude / latitude">{geoCoord}</p>{/if}
      {#if tagsOf(current).length}<div class="tags">{#each tagsOf(current) as t}<span class="tag">#{t}</span>{/each}</div>{/if}
    </div>
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
  main { flex: 1; min-width: 0; background: var(--surface-canvas); }
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
  aside h1 { font-family: var(--font-display); font-weight: 300; font-size: 2rem; line-height: 1.2; margin: var(--space-2) 0 var(--space-3); color: var(--ink-paper-primary); text-shadow: var(--shadow-text-haze); }
  .hint { font-family: var(--font-body); font-size: 0.8rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-5); }

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

  /* Grid-index escape — a quiet canvas overlay, sibling to the legend (same warm-paper pill language).
     Anchored top-right of the canvas (the legend owns top-left); recedes so the read stays the star,
     but is always reachable so the narrative can never trap the visitor (§223 anti-trap, §137 escape-out).
     Connector-blue (--accent-2) hover — the secondary up/nav signal — keeps the rationed orange for the
     one focal action, and is the established green-on-dark-canvas contrast rescue (system.md §contrast). */
  .to-index {
    position: absolute; z-index: 20; top: var(--topbar-h); right: var(--space-5);
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

  /* Note popup — a warm paper callout floating over the ground (annomea popup; mirrors Reader's). */
  .note-pop {
    /* Bottom-anchored, grows upward — cap its height (clear the topbar) and scroll, so a long note
       never overflows the viewport top. */
    position: absolute; left: var(--space-5); bottom: var(--space-5); z-index: 5; max-width: min(44ch, 46%);
    max-height: calc(100vh - var(--topbar-h) - var(--space-5) - var(--space-4)); overflow-y: auto;
    padding: var(--space-4) var(--space-6) var(--space-4) var(--space-5);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: none; border-left: 2px solid var(--accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
  }
  .note-pop .close { position: absolute; top: 8px; right: 12px; background: none; border: none; cursor: pointer; color: var(--ink-canvas-muted); font-size: 1.2rem; line-height: 1; transition: color 160ms ease; }
  .note-pop .close:hover { color: var(--accent); }
  /* Expand-to-read — quiet cord-blue affordance beside the close, opens the centred reading sheet. */
  .note-pop .expand { position: absolute; top: 9px; right: 38px; background: none; border: none; cursor: pointer; color: var(--ink-canvas-muted); font-size: 0.95rem; line-height: 1; transition: color 160ms ease; }
  .note-pop .expand:hover { color: var(--accent-2); }
  .note-body { font-family: var(--font-body); font-size: 1rem; line-height: 1.65; color: var(--ink-canvas-primary); }
  .note-body :global(p) { margin: 0 0 var(--space-2); }
  .note-body :global(p:last-child) { margin-bottom: 0; }
  .note-body :global(strong) { font-weight: 600; }
  .note-body :global(em) { font-style: italic; }
  .note-body :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .note-body :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  /* Note images render as thumbnails — click opens the lightbox. */
  .note-body :global(img) { display: block; max-width: 100%; max-height: 180px; height: auto; margin-top: var(--space-2); border-radius: var(--radius-sm); cursor: zoom-in; }
  .note-pop .tags { margin-top: var(--space-3); display: flex; gap: var(--space-3); }
  .note-pop .tag { font-family: var(--font-ui); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-secondary); }
</style>
