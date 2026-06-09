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
    <div class="opts" role="radiogroup" aria-label="Readings of this source">
      <button type="button" role="radio" aria-checked={active === null} class="opt" class:on={active === null} onclick={() => onselect(null)}>
        <span class="sw base"></span><span class="nm">Base</span>
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
  /* A canvas overlay, sibling to Reader's `.popup` — same surface/border/accent language. Absolute
     within Reader's `position: relative` container, so it anchors to the canvas, not the viewport. */
  .legend {
    position: absolute; z-index: 20; top: 3.25rem; left: var(--space-5); max-width: 17rem;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis); border-left: 3px solid var(--accent-2);
    border-radius: var(--radius-md);
    font-family: var(--font-ui), sans-serif;
  }
  .title {
    display: block; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--accent-2); margin-bottom: var(--space-2);
  }
  .opts { display: flex; flex-direction: column; gap: 1px; }
  .opt {
    display: flex; align-items: center; gap: var(--space-2); text-align: left;
    padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
    background: transparent; border: none; color: var(--ink-canvas-secondary); cursor: pointer;
    font: inherit; font-size: 0.9rem; transition: color 120ms ease, background 120ms ease;
  }
  .opt:hover { color: var(--ink-canvas-primary); }
  .opt.on { color: var(--ink-canvas-primary); font-weight: 600; background: rgba(255, 255, 255, 0.06); }
  .sw { flex: none; width: 11px; height: 11px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); }
  .sw.base { background: var(--ink-canvas-muted, #6b6356); border-radius: 50%; }
  .nm { white-space: nowrap; }
  .desc {
    margin: var(--space-2) 0 0; padding-top: var(--space-2);
    border-top: 1px solid var(--border-canvas);
    font-size: 0.78rem; font-style: italic; line-height: 1.4; color: var(--ink-canvas-secondary);
  }
</style>
