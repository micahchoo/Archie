<script lang="ts">
  // Viewer reader island (Phase-2 UI, browser-verify pending). Adopts annomea's read pattern:
  // a 3-state pane (list ⇄ detail) + popup on marker select, over a READ-ONLY OSD canvas. Reads
  // the published heads-page form (toHeadsPage) exactly as a consumer would — no editing.
  // Object-parameterized (Phase-2 Grid): the parent (ExhibitView) supplies which object to read
  // and that object's projected annotations; `onback` returns to the exhibit's object grid.
  import Canvas from "@render/svelte/Canvas.svelte";
  import NoteLightbox from "./NoteLightbox.svelte";
  import NoteMedia from "./NoteMedia.svelte";
  import ReadingLegend from "./ReadingLegend.svelte";
  import Credit from "./Credit.svelte";
  import { renderMarkdown, stripMarkdown, type MarkerStyle } from "@render/svelte";
  import { splitNoteMedia, thumbnailUrl, type NoteMediaItem, type RightsFields, type W3CAnnotation, type W3CBody, type Reading } from "@render/core";

  let {
    object,
    annotations = [],
    readings = [],
    activeReading = null,
    onreading,
    styleOf,
    siblings = [],
    currentId,
    onnavigate,
    onback,
    rights,
    initialSelected = null,
  }: {
    object: { source: string; canvasId: string; label: string; summary?: string };
    annotations?: W3CAnnotation[];
    /** The object-level credit/license (Q5; falls back to the exhibit credit upstream). Shown by the label. */
    rights?: RightsFields;
    /** The exhibit's Readings (ADR-0007) — drives the canvas legend. Empty = no legend. */
    readings?: Reading[];
    activeReading?: string | null;
    onreading?: (id: string | null) => void;
    /** Per-marker style by annotation id — colours a marker by its Reading. */
    styleOf?: (id: string) => MarkerStyle | undefined;
    /** The exhibit's objects in reading order (for the prev/next carousel: id, label, thumbnail source). */
    siblings?: { id: string; label: string; source: string }[];
    currentId?: string;
    onnavigate?: (id: string) => void;
    onback?: () => void;
    initialSelected?: string | null; // deep-link arrival: land selected on this note (→ fitBounds)
  } = $props();

  // A note's Reading colour (from the registry) — accents its list card + marker (ADR-0007).
  const readingColourOf = (it: W3CAnnotation): string | undefined => {
    const rid = (it as unknown as Record<string, unknown>)["archie:reading"];
    return typeof rid === "string" ? readings.find((r) => r.id === rid)?.colour : undefined;
  };

  let selected = $state<string | null>(initialSelected);
  // Reset selection when the object ACTUALLY changes (grid → different object) — but not on the
  // first run, so a deep-link's initialSelected survives mount.
  let prevCanvas: string | undefined;
  $effect(() => {
    const c = object.canvasId;
    if (prevCanvas !== undefined && prevCanvas !== c) selected = null;
    prevCanvas = c;
  });

  const bodies = (it: W3CAnnotation): W3CBody[] => (Array.isArray(it.body) ? it.body : it.body ? [it.body] : []);
  const commentOf = (it: W3CAnnotation) => { const b = bodies(it).find((x) => { const p = (x as { purpose?: string }).purpose; return p === undefined || p === "commenting"; }); return (b as { value?: string } | undefined)?.value ?? "(untitled)"; };
  const tagsOf = (it: W3CAnnotation) => bodies(it).filter((x) => (x as { purpose?: string }).purpose === "tagging").map((x) => (x as { value?: string }).value ?? "");
  const current = $derived(annotations.find((it) => it.id === selected));
  // Split the selected note into media (clickable tiles → lightbox) + prose (CONTEXT §"Local view loop").
  const noteParts = $derived(current ? splitNoteMedia(commentOf(current)) : { media: [] as NoteMediaItem[], text: "" });
  let lightbox = $state<{ media: NoteMediaItem[]; text: string; index: number } | null>(null);
</script>

<div class="reader">
  <main>
    <!-- Key on the object so the OSD viewer REMOUNTS (loads the new image) when the carousel switches
         objects — Canvas creates the viewer once in onMount, so without this only annotations swap. -->
    {#key object.canvasId}
      <Canvas source={object.source} canvasId={object.canvasId} {annotations} {styleOf} bind:selected />
    {/key}
    {#if onnavigate && siblings.length > 1}
      {@const idx = siblings.findIndex((s) => s.id === currentId)}
      {@const prev = idx > 0 ? siblings[idx - 1] : undefined}
      {@const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined}
      <nav class="carousel" aria-label="Objects in this exhibit">
        <button class="cnav" disabled={!prev} onclick={() => { if (prev) onnavigate(prev.id); }} title={prev ? `Previous: ${prev.label}` : "No previous object"}>
          <span class="arr">‹</span>
          {#if prev}<img class="cthumb" src={thumbnailUrl(prev.source, 120)} alt="" /><span class="lbl">{prev.label}</span>{/if}
        </button>
        <span class="cpos">{idx >= 0 ? idx + 1 : "–"} / {siblings.length}</span>
        <button class="cnav" disabled={!next} onclick={() => { if (next) onnavigate(next.id); }} title={next ? `Next: ${next.label}` : "No next object"}>
          {#if next}<span class="lbl">{next.label}</span><img class="cthumb" src={thumbnailUrl(next.source, 120)} alt="" />{/if}
          <span class="arr">›</span>
        </button>
      </nav>
    {/if}
  </main>

  {#if onreading && readings.length > 0}
    <ReadingLegend {readings} active={activeReading} onselect={onreading} />
  {/if}

  <aside class:detail={!!current}>
    {#if onback}
      <button class="exhibit-back" onclick={() => onback?.()}>← All objects</button>
    {/if}
    {#if current}
      <!-- detail state (annomea drawer): the selected note -->
      <button class="back" onclick={() => (selected = null)}>← All notes</button>
      <article>
        <!-- prose (media stripped) + the note's media as clickable tiles (image/audio/video) -->
        {#if noteParts.text}<div class="body">{@html renderMarkdown(noteParts.text)}</div>{/if}
        <NoteMedia media={noteParts.media} onopen={(idx) => (lightbox = { media: noteParts.media, text: noteParts.text, index: idx })} />
        <div class="tags">{#each tagsOf(current) as t}<span class="tag">#{t}</span>{/each}</div>
      </article>
    {:else}
      <!-- list state -->
      <p class="object-label">{object.label}</p>
      {#if object.summary}<p class="object-summary">{object.summary}</p>{/if}
      <p class="credit-row"><Credit {rights} tone="paper" /></p>
      <h2 class="eyebrow">Notes · {annotations.length}</h2>
      {#if annotations.length === 0}
        <p class="empty">No notes on this object yet.</p>
      {/if}
      <ul>
        {#each annotations as it (it.id)}
          <li><button style="border-left-color: {readingColourOf(it) ?? 'transparent'}" onclick={() => (selected = it.id)}>{stripMarkdown(commentOf(it))}</button></li>
        {/each}
      </ul>
      <p class="hint">Click a note or a marker on the image. Markers re-anchor as you pan/zoom; selecting one zooms to it (the full nav contract).</p>
    {/if}
  </aside>

  {#if current}
    <!-- popup: a small floating callout echoing the selection (annomea popup) -->
    <div class="popup"><strong>Selected</strong> · {stripMarkdown(noteParts.text) || `${noteParts.media.length} media`}</div>
  {/if}

  {#if lightbox}
    <NoteLightbox media={lightbox.media} text={lightbox.text} index={lightbox.index} onclose={() => (lightbox = null)} />
  {/if}
</div>

<style>
  /* The published reading experience: objects glow on the dark light table (left); notes read
     like catalog entries on warm paper (right); a forest-green popup echoes the selection. */
  .reader { position: relative; display: flex; height: 100vh; background: var(--surface-canvas); }
  main { position: relative; flex: 1; min-width: 0; background: var(--surface-canvas); }

  /* Prev/next object carousel — a canvas overlay, top-centered over the image (matches .popup/.legend). */
  .carousel {
    position: absolute; z-index: 20; top: var(--space-4); left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: var(--space-2);
    padding: 2px var(--space-2);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-md);
    font-family: var(--font-ui), sans-serif; font-size: 0.78rem;
  }
  .carousel .cnav {
    display: flex; align-items: center; gap: var(--space-1); max-width: 11rem;
    background: none; border: none; color: var(--ink-canvas-secondary); cursor: pointer; font: inherit;
  }
  .carousel .cnav:hover:not(:disabled) { color: var(--accent); }
  .carousel .cnav:disabled { opacity: 0.3; cursor: default; }
  .carousel .arr { font-size: 1.05rem; line-height: 1; }
  .carousel .cthumb { width: 26px; height: 26px; object-fit: cover; border-radius: var(--radius-sm); flex: none; box-shadow: 0 0 0 1px var(--border-canvas-emphasis); }
  .carousel .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .carousel .cpos { color: var(--ink-canvas-muted, #6b6356); font-variant-numeric: tabular-nums; padding: 0 var(--space-1); }

  /* Reader panel — warm paper, catalog entries under lamplight */
  aside {
    width: 352px; flex-shrink: 0; overflow: auto; box-sizing: border-box;
    padding: var(--space-6) var(--space-5);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-canvas);
  }
  aside h2 { color: var(--ink-paper-secondary); margin: 0 0 var(--space-4); }
  ul { list-style: none; margin: 0; padding: 0; }

  /* Return to the exhibit's object grid (only shown for multi-object exhibits) */
  .exhibit-back { background: none; border: none; cursor: pointer; padding: 0 0 var(--space-5); font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary); }
  .exhibit-back:hover { color: var(--accent); }
  .object-label { font-family: var(--font-display); font-size: 1.6rem; font-weight: 600; line-height: 1.1; color: var(--ink-paper-primary); margin: 0 0 var(--space-2); }
  .object-summary { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.5; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .credit-row { margin: 0 0 var(--space-3); }

  /* Note card (list state) — clamp the markdown-stripped lead to a few lines */
  li button {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper); border-left: 3px solid transparent;
    border-radius: var(--radius-md);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45;
    transition: background 120ms ease, border-color 120ms ease;
  }
  li button:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }

  /* Detail state (drawer) */
  .back { background: none; border: none; cursor: pointer; padding: 0 0 var(--space-4); font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent); }
  article .body { font-family: var(--font-body); font-size: 1.1875rem; line-height: 1.6; color: var(--ink-paper-primary); }
  /* rendered-markdown children (sanitized HTML, so :global) */
  article .body :global(p) { margin: 0 0 var(--space-3); }
  article .body :global(p:last-child) { margin-bottom: 0; }
  article .body :global(strong) { font-weight: 700; }
  article .body :global(em) { font-style: italic; }
  article .body :global(a) { color: var(--accent); }
  article .body :global(ul), article .body :global(ol) { margin: 0 0 var(--space-3); padding-left: var(--space-5); }
  /* Note images render as thumbnails (not full-bleed) — click to open the lightbox. */
  article .body :global(img) { display: block; max-width: 100%; max-height: 200px; height: auto; margin-top: var(--space-2); border-radius: var(--radius-sm); cursor: zoom-in; }
  .tags { margin-top: var(--space-4); display: flex; gap: var(--space-3); }
  .tag { font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent); }
  .hint { font-family: var(--font-ui); font-size: var(--text-ui-md); color: var(--ink-paper-muted); line-height: 1.6; margin-top: var(--space-5); }
  .empty { font-family: var(--font-body); font-size: 1rem; line-height: 1.5; color: var(--ink-paper-secondary); padding: var(--space-4); border: 1px dashed var(--border-paper-emphasis); border-radius: var(--radius-md); }

  /* Popup — a forest-green callout over the light table */
  .popup {
    position: absolute; left: var(--space-5); bottom: var(--space-5); max-width: 46%;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-left: 3px solid var(--accent);
    border-radius: var(--radius-md);
    font-family: var(--font-body); font-size: 1rem; line-height: 1.4;
  }
  .popup strong { font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
</style>
