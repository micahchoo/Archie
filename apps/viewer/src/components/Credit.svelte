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
  .credit { display: inline-flex; align-items: baseline; gap: var(--space-2); position: relative; font-family: var(--font-ui, system-ui), sans-serif; font-size: 0.8rem; line-height: 1.4; }
  .credit.paper { color: var(--ink-paper-secondary); }
  .credit.canvas { color: var(--ink-canvas-secondary); }
  .line { font-style: italic; }
  .info { cursor: pointer; border: none; background: transparent; padding: 0; font-size: 0.85rem; line-height: 1; color: inherit; opacity: 0.7; }
  .info:hover { opacity: 1; color: var(--accent); }
  /* The ⓘ panel — ReadingLegend's accent-stripe overlay idiom (authoring↔reading symmetry). */
  .panel {
    position: absolute; z-index: 20; top: 1.5rem; left: 0; min-width: 16rem; max-width: 24rem;
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card, #fcf9f2); color: var(--ink-paper-primary, #2c2618);
    border: 1px solid var(--border-paper-emphasis, rgba(107,98,80,0.32)); border-left: 3px solid var(--accent, #3a6b4c);
    border-radius: var(--radius-md, 8px); box-shadow: 0 4px 16px rgba(20,18,14,0.18);
  }
  .panel p { margin: 0; display: flex; flex-direction: column; gap: 1px; font-size: 0.8rem; line-height: 1.45; }
  .panel .k { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-paper-secondary, #6b6250); }
  .panel .v { color: var(--ink-paper-primary, #2c2618); }
  .panel a { color: var(--accent, #3a6b4c); }
</style>
