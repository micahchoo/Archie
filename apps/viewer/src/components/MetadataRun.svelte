<script lang="ts">
  // Exhibit-level metadata as ONE quiet inline run under the title/summary (Archie-b50f —
  // prototypes/metadata-panel variant B's header, for EXHIBIT fields only; object fields live in the
  // reader sidebar's Details tab, never duplicated here). The exhibit header is a wide, open surface,
  // so the run reads as a caption line rather than a panel: key and value on one baseline, pairs
  // separated by space, wrapping naturally.
  //
  // No clamp here, deliberately: clamping would need an expand control, and a control in the header
  // competes with "choose an object", which is the header's whole job. Exhibit-level fields are short
  // by nature (creator / date / subject — DEFAULT_METADATA_FIELDS.exhibit); a long one wraps.
  // Repeats keep a visible delimiter — "; " between values — for the same reason the panel bullets
  // them: two values run together read as one.
  //
  // TONE (Archie-36e6): the exhibit header sits on --surface-canvas, but the three readers show the
  // same exhibit-level run in a PAPER sidebar. Same run, two grounds — so the ink tokens are switched
  // by tone rather than hard-coded, exactly as Credit.svelte does it.
  import type { MetadataRow } from "@render/core";

  let { rows, tone = "canvas" }: { rows: MetadataRow[]; tone?: "paper" | "canvas" } = $props();
</script>

{#if rows.length > 0}
  <dl class="run {tone}">
    {#each rows as row (row.key)}
      <div class="pair">
        <dt>{row.label}</dt>
        <dd>{row.values.map((v) => v.text).join("; ")}</dd>
      </div>
    {/each}
  </dl>
{/if}

<style>
  /* Found, not announced: the same tracked-uppercase key voice as the reader panel, on the dark
     light-table ground (canvas ink tokens — this header sits on --surface-canvas). */
  .run { margin: var(--space-4) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); max-width: 42rem; }
  .pair { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
  dt {
    font-family: var(--font-ui), monospace; font-size: 0.62rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase; white-space: nowrap;
  }
  .canvas dt { color: var(--ink-canvas-muted); }
  .paper dt { color: var(--ink-paper-muted); }
  dd { margin: 0; font-family: var(--font-body), sans-serif; font-size: 0.85rem; line-height: 1.6; }
  .canvas dd { color: var(--ink-canvas-secondary); }
  .paper dd { color: var(--ink-paper-secondary); }
  /* In a reader sidebar the run is a narrow column, not a wide caption line. */
  .paper.run { flex-direction: column; gap: var(--space-2); max-width: none; margin: var(--space-2) 0 0; }
</style>
