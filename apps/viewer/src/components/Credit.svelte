<script lang="ts">
  // The Viewer's rights display (CONTEXT "Exhibit / Library rights & metadata"; Q5). ONE quiet credit
  // line scoped to the current view-level (Gallery = library · exhibit chrome = exhibit · Reader = object),
  // plus an ⓘ "About & rights" disclosure for the license — the same accent-stripe overlay idiom as
  // ReadingLegend, so authoring (Studio's "More fields") and reading mirror each other. IIIF makes
  // `requiredStatement` a MUST-display; the credit line satisfies it without a shouting banner. The Viewer
  // reads ALREADY-RESOLVED values (the opt-in cascade collapses at publish) — it never re-runs inheritance.
  // TWO LEVELS, both always on screen (Archie-36e6). A single-object exhibit routes straight past the
  // grid to a reader, so before this the exhibit's credit and licence were rendered NOWHERE in the SPA
  // — a IIIF requiredStatement is MUST-display, and the object credit sitting next to the gap made the
  // page look complete. Passing `exhibitRights` names the levels and stacks them; passing only `rights`
  // keeps the original single quiet line (the gallery and exhibit chrome, where there is one level).
  import { licenseLabel, isExactEcho, type RightsFields } from "@render/core";

  let {
    rights,
    exhibitRights,
    objectLevelLabel = "This item",
    tone = "paper",
  }: {
    rights: RightsFields | undefined;
    /** The EXHIBIT's already-resolved rights. Present only where a reader shows an object inside an
     *  exhibit — its presence is what switches this component into the two-level stack. */
    exhibitRights?: RightsFields | undefined;
    /** What to call the narrower level on screen ("This folio", "This recording"). */
    objectLevelLabel?: string;
    tone?: "paper" | "canvas";
  } = $props();

  const creditValue = $derived(rights?.requiredStatement?.value ?? "");
  const creditLabel = $derived(rights?.requiredStatement?.label ?? "Attribution");
  const license = $derived(licenseLabel(rights?.rights));

  const exCreditValue = $derived(exhibitRights?.requiredStatement?.value ?? "");
  const exCreditLabel = $derived(exhibitRights?.requiredStatement?.label ?? "Attribution");
  const exLicense = $derived(licenseLabel(exhibitRights?.rights));
  const hasExhibit = $derived(!!(exCreditValue || exLicense));

  // THE ECHO RULE. On an exact folded match the OBJECT line yields to the EXHIBIT line: the broader
  // MUST-display slot wins and the narrower row stands down, the same shape as metadataRows rule 3
  // (whose comparison this reuses rather than duplicating). The licence is on the same line, so it
  // must agree too — a same-sentence/different-licence pair is differing authored data, and hiding
  // that would be the silent drop this ticket exists to fix. A NEAR-match keeps both, by rule.
  const echoesExhibit = $derived(
    hasExhibit && isExactEcho(creditValue, exCreditValue) && (rights?.rights ?? "") === (exhibitRights?.rights ?? ""),
  );
  const showObject = $derived(!!(creditValue || license) && !echoesExhibit);
  const has = $derived(showObject || hasExhibit);
  /** Name the levels only when both are on screen — a lone line needs no disambiguation. */
  const named = $derived(hasExhibit && showObject);

  let open = $state(false);
  let el = $state<HTMLElement | null>(null); // the credit root — for click-outside dismiss of the ⓘ panel
</script>

<svelte:window onclick={(e) => { if (open && el && !el.contains(e.target as Node)) open = false; }} />

{#if has}
  <div class="credit {tone}" class:stacked={named} bind:this={el}>
    <span class="lines">
      {#if hasExhibit}
        <span class="line" data-level="exhibit">
          {#if named}<span class="lvl">Exhibit</span>{/if}
          {#if exCreditValue}{exCreditValue}{/if}
          {#if exCreditValue && exLicense} · {/if}{#if exLicense}{exLicense}{/if}
        </span>
      {/if}
      {#if showObject}
        <span class="line" data-level="object">
          {#if named}<span class="lvl">{objectLevelLabel}</span>{/if}
          {#if creditValue}{creditValue}{/if}
          {#if creditValue && named && license} · {/if}{#if named && license}{license}{/if}
        </span>
      {/if}
    </span>
    <button class="info" onclick={() => (open = !open)} aria-expanded={open} aria-label="About & rights" title="About & rights">ⓘ</button>
    {#if open}
      <div class="panel">
        {#if exCreditValue}<p><span class="k">Exhibit · {exCreditLabel}</span><span class="v">{exCreditValue}</span></p>{/if}
        {#if exLicense}<p><span class="k">Exhibit · License</span><span class="v">{#if exhibitRights?.rights}<a href={exhibitRights.rights} target="_blank" rel="noopener noreferrer">{exLicense}</a>{:else}{exLicense}{/if}</span></p>{/if}
        {#if showObject && creditValue}<p><span class="k">{named ? `${objectLevelLabel} · ` : ""}{creditLabel}</span><span class="v">{creditValue}</span></p>{/if}
        {#if showObject && license}<p><span class="k">{named ? `${objectLevelLabel} · ` : ""}License</span><span class="v">{#if rights?.rights}<a href={rights.rights} target="_blank" rel="noopener noreferrer">{license}</a>{:else}{license}{/if}</span></p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Quiet mono credit line — found, not announced (tracked mono). Recession comes ONLY from the ink token's
     own alpha (--ink-*-secondary = .62) — NOT a second `opacity`. Two reasons: (1) opacity is a GROUP
     property, so putting it on .credit also dimmed the positioned .panel child (a descendant can't claw it
     back) — that was the translucent-expandable bug; (2) even on the line alone, .62-token × .62-opacity ≈
     .38 alpha drops the credit (an IIIF requiredStatement = MUST-display) below readable contrast. One dim,
     from the token. */
  .credit { display: inline-flex; align-items: baseline; gap: var(--space-2); position: relative; font-family: var(--font-ui), monospace; font-size: 0.72rem; letter-spacing: 0.06em; line-height: 1.5; }
  .credit.paper { color: var(--ink-paper-secondary); }
  .credit.canvas { color: var(--ink-canvas-secondary); }
  .line { font-style: normal; }
  /* One level = one inline line (unchanged). Two levels stack, and only then do they need naming —
     the level word is the ONLY thing distinguishing two credit sentences that may read alike. */
  .lines { display: contents; }
  .credit.stacked .lines { display: flex; flex-direction: column; gap: 2px; }
  .lvl { color: var(--ink-paper-muted); opacity: 0.72; margin-right: var(--space-2); }
  .credit.canvas .lvl { color: var(--ink-canvas-muted); }
  .credit.stacked { align-items: flex-start; }
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
