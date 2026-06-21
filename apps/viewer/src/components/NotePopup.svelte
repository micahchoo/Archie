<script lang="ts">
  // The standalone note card (annomea popup; CONTEXT §123) — ONE component shared by both readers so the
  // grid/single Reader and the NarrativeReader render an identical floating card. Pure presentational: the
  // HOST owns selection, expand, and what the footer steps (objects for the grid, sections for the
  // narrative) plus the flip-and-read carry — this just reflects content + calls back. Position is
  // `absolute` against the host's relative container (.reader / .narrative), bottom-left over the canvas.
  import ProseCites from "./ProseCites.svelte";
  import NoteMedia from "./NoteMedia.svelte";
  import type { NoteMediaItem } from "@render/core";

  let {
    eyebrow,
    text = "",
    media = [],
    tags = [],
    geoCoord = null,
    step = null,
    onclose,
    onexpand,
    onstep,
    onopenfinder,
    onmedia,
  }: {
    /** Orientation label (eyebrow-first rhythm #4): grid = object label; narrative = "Section · object". */
    eyebrow: string;
    /** The media-stripped note prose (rendered rich, with cite link-scent). Empty ⇒ no body / no ⤢. */
    text?: string;
    media?: NoteMediaItem[];
    tags?: string[];
    geoCoord?: string | null;
    /** Footer stepper state, or null for no stepper. `unit`/`navLabel` keep the aria honest per host
     *  ("object" vs "section"). prev/nextLabel undefined ⇒ that end is disabled. total ≤ 1 ⇒ hidden. */
    step?: { index: number; total: number; prevLabel?: string; nextLabel?: string; unit: string; navLabel: string } | null;
    onclose: () => void;
    /** Expand to the centred reading sheet (prose) / lightbox (media-only) — the host decides which. */
    onexpand: () => void;
    onstep?: (delta: -1 | 1) => void;
    onopenfinder?: (tag: string) => void;
    onmedia?: (idx: number) => void;
  } = $props();
</script>

<div class="note-pop">
  <header class="np-head">
    <p class="np-eyebrow">{eyebrow}</p>
    <div class="np-actions">
      {#if text}<button class="np-icon expand" onclick={onexpand} title="Expand to read" aria-label="Expand note to a reading sheet">⤢</button>{/if}
      <button class="np-icon close" onclick={onclose} aria-label="Close note" title="Close note">×</button>
    </div>
  </header>
  <div class="np-body">
    {#if text}<div class="note-body"><ProseCites {text} /></div>{/if}
    <NoteMedia {media} onopen={(idx) => onmedia?.(idx)} />
    {#if geoCoord}<p class="geo-coord" title="Longitude / latitude">{geoCoord}</p>{/if}
    <!-- Tag chips are clickable (Q-4): open the finder pre-scoped with that tag as a facet. -->
    {#if tags.length}<div class="tags">{#each tags as t}<button type="button" class="tag tag-btn" onclick={() => onopenfinder?.(t)}>#{t}</button>{/each}</div>{/if}
  </div>
  {#if step && step.total > 1}
    <nav class="np-stepper" aria-label={step.navLabel}>
      <button type="button" class="np-step" disabled={step.index <= 0}
        onclick={() => onstep?.(-1)}
        aria-label={step.prevLabel ? `Previous ${step.unit}: ${step.prevLabel}` : `This is the first ${step.unit}`}
        title={step.prevLabel ? `Previous: ${step.prevLabel}` : `This is the first ${step.unit}`}>
        <span aria-hidden="true">‹</span> Prev
      </button>
      <span class="np-pos">{step.index + 1} / {step.total}</span>
      <button type="button" class="np-step" disabled={step.index >= step.total - 1}
        onclick={() => onstep?.(1)}
        aria-label={step.nextLabel ? `Next ${step.unit}: ${step.nextLabel}` : `This is the last ${step.unit}`}
        title={step.nextLabel ? `Next: ${step.nextLabel}` : `This is the last ${step.unit}`}>
        Next <span aria-hidden="true">›</span>
      </button>
    </nav>
  {/if}
</div>

<style>
  /* A warm paper callout floating bottom-left over the canvas ground. A header (eyebrow + ⤢/× icons) tops
     the card, the note body scrolls if tall, and a footer stepper sits beneath a hairline rule. Green
     (--accent) left edge = the note signal. Positioned absolute against the host's relative container. */
  .note-pop {
    position: absolute; left: var(--space-5); bottom: var(--space-5); z-index: 5;
    max-width: min(46ch, 46%);
    min-width: min(320px, calc(100vw - 2 * var(--space-5)));
    display: flex; flex-direction: column; gap: var(--space-3);
    max-height: calc(100vh - var(--topbar-h) - var(--space-5) - var(--space-4));
    padding: var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border: none; border-left: 2px solid var(--accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-mid);
  }
  /* Header — eyebrow on the left, the ⤢ expand / × close icons on the right (flowed in a row, not
     absolutely positioned over the body's first line). */
  .np-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
  .np-eyebrow { margin: 0; font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-canvas-secondary); line-height: 1.4; }
  .np-actions { display: inline-flex; align-items: center; gap: var(--space-3); flex: none; }
  .np-icon { background: none; border: none; cursor: pointer; padding: 0; line-height: 1; color: var(--ink-canvas-muted); transition: color 160ms ease; }
  .np-icon.close { font-size: 1.2rem; }
  .np-icon.close:hover { color: var(--accent); }
  /* Expand-to-read — quiet cord-blue affordance beside the close, opens the centred reading sheet. */
  .np-icon.expand { font-size: 0.95rem; }
  .np-icon.expand:hover { color: var(--accent-2); }
  /* The note body scrolls if tall, while the header + stepper stay put. */
  .np-body { flex: 1; min-height: 0; overflow-y: auto; }
  .note-body { font-family: var(--font-body); font-size: 1rem; line-height: 1.65; color: var(--ink-canvas-primary); }
  .note-body :global(p) { margin: 0 0 var(--space-2); }
  .note-body :global(p:last-child) { margin-bottom: 0; }
  .note-body :global(strong) { font-weight: 600; }
  .note-body :global(em) { font-style: italic; }
  .note-body :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .note-body :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  /* Note images render as thumbnails — click opens the lightbox. */
  .note-body :global(img) { display: block; max-width: 100%; max-height: 180px; height: auto; margin-top: var(--space-2); border-radius: var(--radius-sm); cursor: zoom-in; }
  .geo-coord { margin: var(--space-2) 0 0; font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.08em; color: var(--ink-canvas-muted); }
  .tags { margin-top: var(--space-3); display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .tag { font-family: var(--font-ui); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-canvas-secondary); }
  /* Clickable tag chip (Q-4 facet trigger) — button reset over the chip look; hover lifts to the
     connector accent (the cross-cutting discovery affordance). */
  .tag-btn { background: none; border: none; padding: 0; cursor: pointer; transition: color 160ms ease; }
  .tag-btn:hover { color: var(--accent-2); }
  /* Footer stepper — the in-card multi-object nav. A hairline rule sets it off the body; the count reads
     in tabular mono so it never reflows; connector-blue (--accent-2) hover keeps the rationed orange free
     for the host's focal signal. */
  .np-stepper { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); border-top: 1px solid var(--border-canvas); padding-top: var(--space-3); }
  .np-step {
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: none; border: none; padding: var(--space-1) 0; cursor: pointer;
    font-family: var(--font-ui), sans-serif; font-size: var(--text-ui-sm); letter-spacing: 0.02em;
    color: var(--ink-canvas-secondary); transition: color 160ms ease;
  }
  .np-step span[aria-hidden] { font-size: 1.05rem; line-height: 1; }
  .np-step:hover:not(:disabled) { color: var(--accent-2); }
  .np-step:disabled { opacity: 0.32; cursor: default; }
  .np-pos {
    font-family: var(--font-mono), monospace; font-variant-numeric: tabular-nums;
    font-size: var(--text-ui-sm); letter-spacing: 0.08em; color: var(--ink-canvas-muted);
  }
</style>
