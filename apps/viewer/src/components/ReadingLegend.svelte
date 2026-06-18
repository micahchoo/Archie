<script lang="ts">
  // The Reading legend (ADR-0007 / Q2 / Q16): a canvas-anchored radio of the exhibit's competing
  // interpretive passes. Base-only by default (no camp privileged — scholarly-honest); selecting a
  // reading overlays its (colour-coded) notes on the always-visible base. Styled as a canvas overlay
  // to match the Reader's `.popup` (curator's-study system); the active reading's description is the
  // one intent line shown (principle #1), kept compact. Rendered inside Reader's relative container.
  import type { Reading } from "@render/core";

  let { readings, active, onselect }: {
    readings: Reading[];
    active: string | null;
    onselect: (id: string | null) => void;
  } = $props();

  const activeDesc = $derived(active ? readings.find((r) => r.id === active)?.description : undefined);
</script>

{#if readings.length > 0}
  <!-- aside = complementary landmark (axe region rule: overlay content must live in a landmark) -->
  <aside class="legend" aria-label="Readings">
    <span class="title">Readings</span>
    <span class="gloss">Compare interpretations</span>
    <div class="opts" role="radiogroup" aria-label="Readings of this source">
      <button type="button" role="radio" aria-checked={active === null} class="opt" class:on={active === null} onclick={() => onselect(null)}>
        <span class="sw base"></span><span class="nm">General notes</span>
      </button>
      {#each readings as r (r.id)}
        <button type="button" role="radio" aria-checked={active === r.id} class="opt" class:on={active === r.id} onclick={() => onselect(r.id)}>
          <span class="sw" style="background:{r.colour ?? 'var(--accent)'}"></span><span class="nm">{r.name}</span>
        </button>
      {/each}
    </div>
    {#if activeDesc}<p class="desc">{activeDesc}</p>{/if}
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
  .opts { display: flex; flex-direction: column; gap: 2px; }
  .opt {
    display: flex; align-items: center; gap: var(--space-2); text-align: left;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
    background: transparent; border: none; color: var(--ink-canvas-secondary); cursor: pointer;
    font: inherit; font-family: var(--font-body), sans-serif; font-size: 0.9rem;
    transition: color 160ms ease, background 160ms ease;
  }
  .opt:hover { color: var(--ink-canvas-primary); }
  .opt.on { color: var(--ink-canvas-primary); font-weight: 600; background: var(--accent-muted); }
  .sw { flex: none; width: 11px; height: 11px; border-radius: 50%; box-shadow: var(--shadow-inset-fog); }
  .sw.base { background: var(--ink-canvas-muted); }
  .nm { white-space: nowrap; }
  .desc {
    margin: var(--space-2) 0 0; padding-top: var(--space-2);
    border-top: 1px solid var(--border-canvas);
    font-family: var(--font-body), sans-serif;
    font-size: 0.82rem; font-style: italic; line-height: 1.6; color: var(--ink-canvas-secondary);
  }
</style>
