<script lang="ts">
  // The Viewer's rights display (CONTEXT "Exhibit / Library rights & metadata"; Q5). ONE quiet credit
  // line scoped to the current view-level (Gallery = library · exhibit chrome = exhibit · Reader = object),
  // plus an ⓘ "About & rights" disclosure for the license — the same accent-stripe overlay idiom as
  // ReadingLegend, so authoring (Studio's "More fields") and reading mirror each other. IIIF makes
  // `requiredStatement` a MUST-display; the credit line satisfies it without a shouting banner. The Viewer
  // reads ALREADY-RESOLVED values (the opt-in cascade collapses at publish) — it never re-runs inheritance.
  import { licenseLabel, type RightsFields } from "@render/core";

  let { rights, tone = "paper" }: { rights: RightsFields | undefined; tone?: "paper" | "canvas" } = $props();

  const creditValue = $derived(rights?.requiredStatement?.value ?? "");
  const creditLabel = $derived(rights?.requiredStatement?.label ?? "Attribution");
  const license = $derived(licenseLabel(rights?.rights));
  const has = $derived(!!(creditValue || license));
  let open = $state(false);
  let el = $state<HTMLElement | null>(null); // the credit root — for click-outside dismiss of the ⓘ panel
</script>

<svelte:window onclick={(e) => { if (open && el && !el.contains(e.target as Node)) open = false; }} />

{#if has}
  <div class="credit {tone}" bind:this={el}>
    {#if creditValue}<span class="line">{creditValue}</span>{/if}
    <button class="info" onclick={() => (open = !open)} aria-expanded={open} aria-label="About and rights" title="About & rights">ⓘ</button>
    {#if open}
      <div class="panel">
        {#if creditValue}<p><span class="k">{creditLabel}</span><span class="v">{creditValue}</span></p>{/if}
        {#if license}<p><span class="k">License</span><span class="v">{#if rights?.rights}<a href={rights.rights} target="_blank" rel="noopener noreferrer">{license}</a>{:else}{license}{/if}</span></p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Quiet mono credit line — found, not announced (Spline mono, tracked, low-opacity). */
  .credit { display: inline-flex; align-items: baseline; gap: var(--space-2); position: relative; font-family: var(--font-ui), monospace; font-size: 0.72rem; letter-spacing: 0.06em; line-height: 1.5; opacity: 0.62; }
  .credit.paper { color: var(--ink-paper-secondary); }
  .credit.canvas { color: var(--ink-canvas-secondary); }
  .line { font-style: normal; }
  /* 24px hit box (WCAG 2.2 target-size / Fitts) — negative margin keeps the glyph optically 14px; 6px clears 24px with sub-pixel glyph widths. */
  .info { cursor: pointer; border: none; background: transparent; padding: 6px; margin: -6px; font-size: 0.85rem; line-height: 1; color: inherit; opacity: 0.7; transition: color 160ms ease, opacity 160ms ease; }
  .info:hover { opacity: 1; color: var(--accent); }
  /* The ⓘ panel — ReadingLegend's warm-paper overlay idiom (authoring↔reading symmetry). */
  .panel {
    position: absolute; z-index: 20; top: 1.5rem; left: 0; min-width: 16rem; max-width: 24rem;
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low);
  }
  .panel p { margin: 0; display: flex; flex-direction: column; gap: 2px; font-family: var(--font-body), sans-serif; font-size: 0.82rem; line-height: 1.6; }
  .panel .k { font-family: var(--font-ui), monospace; font-size: 0.62rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-muted); opacity: 0.62; }
  .panel .v { color: var(--ink-paper-primary); }
  .panel a { color: var(--accent-2); }
</style>
