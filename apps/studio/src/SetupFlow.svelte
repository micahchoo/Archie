<script lang="ts">
  // FIRST RUN — "where should this library live?" (Q-15).
  //
  // One question per screen, and the second screen is asked ONLY when its answer changes something
  // (`qualityMatters`). The c367 wall put four destinations, two tiers, a recommendation, a residual
  // findings panel and two export actions on one surface, every time — ~15 blocks to read before the
  // button. Most of it was answering questions the author had not asked yet.
  //
  // What this keeps from c367, deliberately: the probe's recommendation arrives PRE-SELECTED, and an
  // unavailable destination is drawn with its own reason rather than dropped or swapped
  // (`export-surface.ts`'s header records the defect that decided it). What changes is only WHEN each
  // question is put, and how loudly a refusal is drawn — quiet and muted, never red caps.
  import type { ArchiveProbe, DestinationId, QualityTier } from "./archive-probe.js";
  import { humanBytes } from "./archive-probe.js";
  import { SITE_DESTINATIONS, TIER_BLURB, TIER_LABEL, qualityMatters } from "./export-surface.js";
  import type { DestinationRow } from "./export-surface.js";
  import Spinner from "./Spinner.svelte";

  let {
    probe = null,
    probing = false,
    probeDone = 0,
    probeTotal = 0,
    rows = [],
    exhibitCount = 0,
    destination = null,
    tier = "archival",
    canPublishHere = false,
    unscaledSelectors = [],
    onselectdestination,
    onselecttier,
    onconfirm,
    onexport,
    onpreview,
    oncancel,
  }: {
    probe?: ArchiveProbe | null;
    probing?: boolean;
    probeDone?: number;
    probeTotal?: number;
    /** Every destination row for the current tier (`rowsFor`) — including unavailable ones, which are
     *  drawn quiet with their reason. This component filters to SITE destinations; the zip is an
     *  artifact and lives in the export menu. */
    rows?: DestinationRow[];
    exhibitCount?: number;
    destination?: DestinationId | null;
    tier?: QualityTier;
    canPublishHere?: boolean;
    unscaledSelectors?: { exhibitSlug: string; reason: string }[];
    onselectdestination: (id: DestinationId) => void;
    onselecttier: (t: QualityTier) => void;
    /** Commit: go to the chosen destination's own flow (GitHub wizard / folder picker / …). */
    onconfirm: () => void;
    /** Leave for the artifact half — "I wanted a file, not a site." */
    onexport?: () => void;
    onpreview?: () => void;
    oncancel: () => void;
  } = $props();

  /** Which question is on screen. `where` is always first; `quality` is reachable only when the chosen
   *  destination makes the tier matter, so for most libraries this flow is ONE screen. */
  let step = $state<"where" | "quality">("where");

  const siteRows = $derived(rows.filter((r) => SITE_DESTINATIONS.includes(r.id)));
  const chosenRow = $derived(siteRows.find((r) => r.id === destination) ?? null);
  /** Nothing fits anywhere. A menu of refusals is worse than one honest sentence, so the probe's own
   *  blockers replace the list — each of them names a number. (Carried from the wall unchanged.) */
  const deadEnd = $derived(!!probe && !probe.recommendation && siteRows.every((r) => !r.available));
  const askQuality = $derived(!!probe && !!destination && qualityMatters(probe, destination));

  /** The primary button's job depends on whether a second question is owed. Two screens are still ≤2
   *  clicks to publish, and the author never sees a control whose answer changes nothing. */
  function primary() {
    if (step === "where" && askQuality) { step = "quality"; return; }
    onconfirm();
  }
  const primaryLabel = $derived(step === "where" && askQuality ? "Next" : "Publish");
</script>

<header>
  <p class="eyebrow">Publish</p>
  <h2>{step === "where" ? "Where should this library live?" : "How much quality do you need?"}</h2>
  {#if step === "where"}
    {#if probe}
      <p class="lede">{probe.folder.mediaFiles.toLocaleString()} {probe.folder.mediaFiles === 1 ? "item" : "items"} across {exhibitCount} {exhibitCount === 1 ? "exhibit" : "exhibits"}. Archie builds the same finished site whichever you pick, and remembers your answer — you won't be asked again.</p>
    {:else}
      <p class="lede">Archie builds the same finished site whichever you pick, and remembers your answer.</p>
    {/if}
  {:else}
    <p class="lede">{chosenRow ? `This changes what ${chosenRow.label} can take from you.` : "This changes what your destination can take."}</p>
  {/if}
</header>

{#if step === "where"}
  {#if !probe && probing}
    <p class="note probe-status" role="status">
      <Spinner size={16} />
      Sizing your library{#if probeTotal > 0} — {probeDone.toLocaleString()} of {probeTotal.toLocaleString()} items{/if}…
    </p>
  {:else if deadEnd && probe}
    <div class="blocker" role="alert">
      <p class="b-head">There's no route out for a library this size yet</p>
      {#each probe.blockers as b}<p class="b-sub">{b}</p>{/each}
    </div>
  {:else if probe}
    <fieldset class="dests">
      <legend class="sr-only">Destination</legend>
      {#if probe.recommendation}<p class="rec-why">{probe.recommendation.why}</p>{/if}
      {#each siteRows as row (row.id)}
        <!-- A greyed row is a REAL, VISIBLE row carrying its real reason. It is never dropped and
             never replaced by another destination. Quiet, not red: an author who cannot take this
             route still learns what it was and what it would need. -->
        <label class="dest" class:unavailable={!row.available} class:chosen={destination === row.id}
          data-destination={row.id} data-available={row.available}>
          <input type="radio" name="destination" value={row.id} checked={destination === row.id}
            disabled={!row.available} onchange={() => onselectdestination(row.id)} />
          <span class="d-main">
            <span class="d-title">
              {row.label}
              {#if row.recommended}<span class="d-rec">Recommended</span>{/if}
            </span>
            <span class="d-blurb">{row.blurb}</span>
            <!-- Facts on an available row; the reason on an unavailable one. Never both — the wall
                 showed reason AND blurb AND facts on every row, which is how one screen grew to
                 fifteen blocks. -->
            {#if row.available}
              <span class="d-facts">{row.facts}</span>
            {:else}
              <span class="d-reason">{row.reason}</span>
            {/if}
          </span>
        </label>
      {/each}
    </fieldset>
  {:else}
    <!-- No probe seam at all (a host that did not wire one). A stated absence, not a fake menu. -->
    <p class="note">Archie couldn't size your library, so there's no recommendation this time. Pick a destination and it will tell you if it doesn't fit.</p>
  {/if}
{:else}
  <fieldset class="tiers">
    <legend class="sr-only">Quality</legend>
    {#each ["archival", "web"] as const as t}
      <label class="tier" class:chosen={tier === t}>
        <input type="radio" name="quality" value={t} checked={tier === t} onchange={() => onselecttier(t)} />
        <span class="d-main">
          <span class="d-title">{TIER_LABEL[t]}{#if probe}<span class="t-size">{humanBytes(probe.tiers[t].publishedBytes)}</span>{/if}</span>
          <span class="d-blurb">{TIER_BLURB[t]}</span>
        </span>
      </label>
    {/each}
  </fieldset>

  {#if unscaledSelectors.length > 0 && tier === "web"}
    <!-- The web tier's residual correctness finding (Archie-4b0a): a selector the scaler refused to
         move rather than mangle. Shown HERE, beside the control that causes it, and only when that
         tier is actually selected — on the wall it was permanent furniture. -->
    <div class="broken" role="status">
      <p class="b-head">{unscaledSelectors.length} {unscaledSelectors.length === 1 ? "note lands" : "notes land"} in the wrong place at Web quality</p>
      <p class="b-sub">These were drawn with a shape Archie can't resize exactly, so on a resized image they'll sit off their subject. Archival quality places them correctly.</p>
      <ul>
        {#each unscaledSelectors.slice(0, 5) as u}<li><code>/{u.exhibitSlug}</code> · {u.reason}</li>{/each}
        {#if unscaledSelectors.length > 5}<li class="more">…and {unscaledSelectors.length - 5} more</li>{/if}
      </ul>
    </div>
  {/if}
{/if}

<div class="actions">
  {#if step === "quality"}
    <button type="button" class="ghost" onclick={() => (step = "where")}>← Back</button>
  {/if}
  {#if step === "where" && onpreview}
    <button type="button" class="ghost" onclick={onpreview}>Preview as reader</button>
  {/if}
  <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
  {#if probe && !deadEnd}
    <button class="primary" disabled={!canPublishHere} onclick={primary}>{primaryLabel}</button>
  {/if}
</div>

{#if step === "where" && onexport && probe && !deadEnd}
  <div class="extras">
    <button type="button" class="x-link" data-action="open-export-menu" onclick={onexport}>
      Export a copy instead — a working copy, a readable copy, or a deposit copy →
    </button>
  </div>
{/if}

<style>
  /* The destination/tier row styling is MOVED VERBATIM from Publish.svelte's wall — this refactor
     changes when each question is asked, not how a row looks. The one deliberate change is the
     refusal colour (see `.d-reason` below). */
  /* The one-flow option set (Archie-c367): four destination rows, always all four. */
  .dests, .tiers {
    display: flex; flex-direction: column; gap: var(--space-2);
    border: none; margin: 0 0 var(--space-4); padding: 0; min-width: 0;
  }
  .dests legend, .tiers legend {
    font-family: var(--font-ui); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--ink-paper-muted); padding: 0; margin-bottom: var(--space-2);
  }
  .rec-why { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.55; color: var(--ink-paper-secondary); margin: 0 0 var(--space-2); }
  .dest, .tier {
    display: flex; gap: var(--space-3); align-items: flex-start; cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); border: 1px solid transparent; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  }
  .dest:hover:not(.unavailable), .tier:hover { background: var(--surface-paper-hover); }
  .dest.chosen, .tier.chosen { border-color: var(--accent-2); box-shadow: var(--shadow-lift-mid); }
  /* GREYED WITH ITS REASON. Dimmed and not selectable — but still drawn, still legible, and its
     reason line keeps full contrast, because the reason is the entire point of leaving it on screen. */
  .dest.unavailable { cursor: not-allowed; opacity: 0.62; box-shadow: none; background: transparent; }
  .dest input, .tier input { margin-top: 0.28rem; flex: none; accent-color: var(--accent-2); }
  .d-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
  .d-title { font-family: var(--font-display); font-size: 1.1rem; font-weight: 400; color: var(--ink-paper-primary); display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .d-rec { font-family: var(--font-ui); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent-2); }
  .t-size { font-family: var(--font-mono); font-size: 0.8rem; color: var(--ink-paper-muted); }
  .d-reason { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.5; color: var(--ink-paper-primary); }
  /* The refusal is QUIET (spec LD5). The wall drew it `--semantic-error` red, which made the two
     things an author could NOT do the loudest text on the screen — see the screenshot that opened
     this redesign. It keeps full legibility against the dimmed row (the reason is the whole point of
     leaving the row on screen); it just no longer shouts. */
  .d-reason { opacity: 1; color: var(--ink-paper-secondary); }
  .d-blurb { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; color: var(--ink-paper-secondary); }
  .d-facts { font-family: var(--font-mono); font-size: 0.76rem; color: var(--ink-paper-muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .probe-status { display: flex; align-items: center; gap: var(--space-2); }
  .note { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.55; color: var(--ink-paper-secondary); }
  .blocker, .broken { border: 1px solid var(--border-paper); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); }
  .b-head { font-family: var(--font-display); font-size: 0.95rem; margin: 0 0 var(--space-1); color: var(--ink-paper-primary); }
  .b-sub { font-family: var(--font-body); font-size: 0.82rem; line-height: 1.5; margin: 0; color: var(--ink-paper-secondary); }
  .broken ul { margin: var(--space-2) 0 0; padding-left: 1.1rem; font-family: var(--font-body); font-size: 0.8rem; color: var(--ink-paper-secondary); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4); }
  .extras { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-paper); }
  .x-link { font-family: var(--font-body); font-size: 0.85rem; text-align: left; cursor: pointer; padding: var(--space-2) 0; background: transparent; border: 0; color: var(--ink-paper-secondary); text-decoration: underline; text-underline-offset: 3px; }
  .x-link:hover { color: var(--ink-paper-primary); }
</style>
