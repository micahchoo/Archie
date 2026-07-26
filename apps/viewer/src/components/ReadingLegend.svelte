<script lang="ts">
  // The Reading legend (ADR-0007 / Q2 / Q16): a canvas-anchored radio of the exhibit's competing
  // interpretive passes. Base-only by default (no camp privileged — scholarly-honest); selecting a
  // reading overlays its (colour-coded) notes on the always-visible base. Styled as a canvas overlay
  // to match the Reader's `.popup` (curator's-study system); the active reading's description is the
  // one intent line shown (principle #1), kept compact. Rendered inside Reader's relative container.
  import { readingMarkerStyle } from "@render/core";
  import type { Reading } from "@render/core";

  let { readings, active, onselect, hidden = false, onhiddenchange, count }: {
    readings: Reading[];
    active: string | null;
    onselect: (id: string | null) => void;
    /** Hide-all (declutter): when true, the canvas draws no markers — useful on a dense map to read the
     *  basemap itself. Orthogonal to which reading is active; picking any layer below restores them. */
    hidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
    /** Per-layer note count on the CURRENT object (id = null → General/base notes; else a reading's id).
     *  Optional — omitted ⇒ no counts render. The host re-mints it per active object so counts stay live. */
    count?: (id: string | null) => number;
  } = $props();

  // Picking a layer always means "show me markers" — un-hide, then select (the approved restore path).
  const pick = (id: string | null): void => { if (hidden) onhiddenchange?.(false); onselect(id); };

  const activeDesc = $derived(active ? readings.find((r) => r.id === active)?.description : undefined);
</script>

<!-- V47 (Archie-52a0) — the swatch IS the mark, drawn from the same `readingMarkerStyle` call the
     canvas paints with. It used to be a solid disc of the reading's colour, which the canvas never
     draws: a mark is an outline at 0.95 with an 18% fill, so the legend was promising a saturated
     block and the reader was hunting for a faint outline. Rendering it as SVG rather than
     translating the numbers into CSS is the point — fill/fill-opacity/stroke/stroke-opacity/
     stroke-width are handed over verbatim, so there is no second copy of the constants to drift.
     A square, not a circle, for the same reason: the mark vocabulary is rect and polygon. -->
{#snippet swatch(colour: string)}
  <!-- `{@const}` must be the immediate child of a BLOCK — inside the <svg> it is a parse error. -->
  {@const ms = readingMarkerStyle(colour, "normal")}
  <svg class="sw" viewBox="0 0 14 14" aria-hidden="true">
    <rect
      x="1.5" y="1.5" width="11" height="11"
      fill={ms.fill} fill-opacity={ms.fillOpacity}
      stroke={ms.stroke} stroke-opacity={ms.strokeOpacity} stroke-width={ms.strokeWidth}
    />
  </svg>
{/snippet}

{#if readings.length > 0}
  <!-- aside = complementary landmark (axe region rule: overlay content must live in a landmark) -->
  <aside class="legend" aria-label="Readings">
    <span class="title">Readings</span>
    <span class="gloss">Compare interpretations</span>
    <div class="opts" class:dimmed={hidden} role="radiogroup" aria-label="Readings of this source">
      <button type="button" role="radio" aria-checked={active === null} class="opt" class:on={active === null && !hidden} style="--rd: var(--ink-canvas-muted)" onclick={() => pick(null)}>
        {@render swatch("var(--ink-canvas-muted)")}<span class="nm">General notes</span>{#if count}<span class="ct" title="{count(null)} notes on this image">{count(null)}</span>{/if}
      </button>
      {#each readings as r (r.id)}
        <button type="button" role="radio" aria-checked={active === r.id} class="opt" class:on={active === r.id && !hidden} style="--rd:{r.colour ?? 'var(--accent)'}" onclick={() => pick(r.id)}>
          {@render swatch(r.colour ?? "var(--accent)")}<span class="nm">{r.name}</span>{#if count}<span class="ct" title="{count(r.id)} notes on this image">{count(r.id)}</span>{/if}
        </button>
      {/each}
    </div>
    {#if activeDesc && !hidden}<p class="desc">{activeDesc}</p>{/if}
    <!-- Hide-all: a declutter toggle, separate from the layer radios (visibility ≠ which reading). -->
    <button type="button" class="hide-toggle" aria-pressed={hidden} onclick={() => onhiddenchange?.(!hidden)}>
      {hidden ? "Show notes" : "Hide all"}
    </button>
  </aside>
{/if}

<style>
  /* A canvas overlay, sibling to Reader's `.popup` — same warm-paper/soft-shadow language. Absolute
     within Reader's `position: relative` container, so it anchors to the canvas, not the viewport. */
  .legend {
    position: absolute; z-index: 20; top: var(--topbar-h); left: var(--space-5); max-width: 17rem;
    /* Cap + scroll like the note popups (#6): a contested object with many readings + a long description
       used to grow off the bottom, stranding the lower readings and the Hide-all toggle. Same token math. */
    max-height: calc(100vh - var(--topbar-h) - var(--space-5) - var(--space-4)); overflow-y: auto;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body), sans-serif;
  }
  .title {
    display: block; font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-canvas-secondary); margin-bottom: 2px;
  }
  /* One-line gloss under the eyebrow — what readings are FOR (compare interpretations). Mirrors the Studio rail. */
  .gloss { display: block; font-family: var(--font-body), sans-serif; font-size: var(--text-ui-xs, 0.7rem); color: var(--ink-canvas-secondary); margin-bottom: var(--space-2); }
  .opts { display: flex; flex-direction: column; gap: 2px; transition: opacity 160ms ease; }
  /* Hidden: the layer choices recede (markers are off the canvas) but stay legible + pickable. */
  .opts.dimmed { opacity: 0.5; }
  .opt {
    display: flex; align-items: center; gap: var(--space-2); text-align: left;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
    background: transparent; border: none; color: var(--ink-canvas-secondary); cursor: pointer;
    font: inherit; font-family: var(--font-body), sans-serif; font-size: 0.9rem;
    transition: color 160ms ease, background 160ms ease;
  }
  .opt:hover { color: var(--ink-canvas-primary); }
  /* Selected = the reading's OWN colour (ADR-0007), a left stripe over a neutral fill — never the
     global accent, and border-only so any user-picked hue stays AA-legible behind ink text. */
  .opt.on { color: var(--ink-canvas-primary); font-weight: 600; background: var(--surface-canvas-overlay); box-shadow: inset 2px 0 0 var(--rd); }
  /* The swatch is a miniature of the MARK (V47) — its fill/stroke come from readingMarkerStyle, so
     nothing here may restate them. What CSS still owns is the box: a fixed square that never shrinks,
     and a hairline ring so ANY author-picked hue (incl. a pale one that vanishes on the cream pill)
     still reads as a discrete chip — the swatch is identity, so it must always be visible (#6 /
     system.md contrast rule). `overflow: visible` because the mark's stroke is centred on the rect
     edge, exactly as it is on the canvas. */
  .sw { flex: none; width: 14px; height: 14px; overflow: visible; border-radius: 2px; box-shadow: 0 0 0 1px var(--border-canvas-emphasis); }
  /* Name takes the row and may wrap — a long reading name (e.g. "Natural-language reading") must NOT
     shove the count off the legend's capped width; min-width:0 lets it shrink/wrap instead of overflowing. */
  .nm { flex: 1; min-width: 0; }
  /* Per-layer note count on the current image — a quiet tabular figure pinned to the trailing edge
     (flex:none so it never shrinks or gets pushed out). Tabular nums so multi-digit counts don't jitter. */
  .ct { flex: none; padding-left: var(--space-3); font-family: var(--font-mono), monospace; font-variant-numeric: tabular-nums; font-size: 0.78rem; color: var(--ink-canvas-muted); }
  .desc {
    margin: var(--space-2) 0 0; padding-top: var(--space-2);
    border-top: 1px solid var(--border-canvas);
    font-family: var(--font-body), sans-serif;
    font-size: 0.82rem; font-style: italic; line-height: 1.6; color: var(--ink-canvas-secondary);
  }
  /* Hide-all toggle — a quiet footer action under a hairline rule, distinct from the layer radios.
     Pressed (notes hidden) flips to the rationed cord-blue connector accent so the off-state reads. */
  .hide-toggle {
    display: block; width: 100%; margin-top: var(--space-2); padding: var(--space-2) var(--space-2) 0;
    border: none; border-top: 1px solid var(--border-canvas); background: transparent; cursor: pointer;
    text-align: left; font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted);
    transition: color 160ms ease;
  }
  .hide-toggle:hover { color: var(--ink-canvas-primary); }
  .hide-toggle[aria-pressed="true"] { color: var(--accent-2); }
</style>
