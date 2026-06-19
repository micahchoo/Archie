<script lang="ts">
  // The Reading legend (ADR-0007 / Q2 / Q16): a canvas-anchored radio of the exhibit's competing
  // interpretive passes. Base-only by default (no camp privileged — scholarly-honest); selecting a
  // reading overlays its (colour-coded) notes on the always-visible base. Styled as a canvas overlay
  // to match the Reader's `.popup` (curator's-study system); the active reading's description is the
  // one intent line shown (principle #1), kept compact. Rendered inside Reader's relative container.
  import type { Reading } from "@render/core";

  let { readings, active, onselect, hidden = false, onhiddenchange }: {
    readings: Reading[];
    active: string | null;
    onselect: (id: string | null) => void;
    /** Hide-all (declutter): when true, the canvas draws no markers — useful on a dense map to read the
     *  basemap itself. Orthogonal to which reading is active; picking any layer below restores them. */
    hidden?: boolean;
    onhiddenchange?: (hidden: boolean) => void;
  } = $props();

  // Picking a layer always means "show me markers" — un-hide, then select (the approved restore path).
  const pick = (id: string | null): void => { if (hidden) onhiddenchange?.(false); onselect(id); };

  const activeDesc = $derived(active ? readings.find((r) => r.id === active)?.description : undefined);
</script>

{#if readings.length > 0}
  <!-- aside = complementary landmark (axe region rule: overlay content must live in a landmark) -->
  <aside class="legend" aria-label="Readings">
    <span class="title">Readings</span>
    <span class="gloss">Compare interpretations</span>
    <div class="opts" class:dimmed={hidden} role="radiogroup" aria-label="Readings of this source">
      <button type="button" role="radio" aria-checked={active === null} class="opt" class:on={active === null && !hidden} style="--rd: var(--ink-canvas-muted)" onclick={() => pick(null)}>
        <span class="sw base"></span><span class="nm">General notes</span>
      </button>
      {#each readings as r (r.id)}
        <button type="button" role="radio" aria-checked={active === r.id} class="opt" class:on={active === r.id && !hidden} style="--rd:{r.colour ?? 'var(--accent)'}" onclick={() => pick(r.id)}>
          <span class="sw" style="background:{r.colour ?? 'var(--accent)'}"></span><span class="nm">{r.name}</span>
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
    position: absolute; z-index: 20; top: 3.25rem; left: var(--space-5); max-width: 17rem;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-primary);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body), sans-serif;
  }
  .title {
    display: block; font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-canvas-muted); opacity: 0.62; margin-bottom: 2px;
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
  .sw { flex: none; width: 11px; height: 11px; border-radius: 50%; box-shadow: var(--shadow-inset-fog); }
  .sw.base { background: var(--ink-canvas-muted); }
  .nm { white-space: nowrap; }
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
