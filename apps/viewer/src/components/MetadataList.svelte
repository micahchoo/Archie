<script lang="ts">
  // The descriptive-metadata list (Archie-b50f — prototypes/metadata-panel variant A, ported). Renders
  // the projection from `metadataRows`; it owns no rules, only their typography. Two carry-forward
  // decisions live in this markup:
  //
  //  • REPEATS get a delimiter. One label, values stacked — but two unlabelled stacked values read
  //    ambiguously (is the second a continuation of the first, or its own value?). A multi-value row
  //    renders a real <ul> inside its <dd>: a screen reader announces "list, 2 items", and sighted
  //    readers get a hanging middot per item, so a WRAPPED line (indented under the bullet) can never
  //    be mistaken for a NEW value. A single-value row gets no bullet — no ambiguity, no noise.
  //  • LONG values clamp to 3 lines (the note-card clamp count) with a `.text-link` "Show more". The
  //    text is never truncated in the DOM, so the clamp costs a screen reader nothing.
  //
  // The key/value voice is lifted from Credit.svelte's ⓘ panel (.k/.v) on purpose: rights and metadata
  // are adjacent in the sidebar and must read as ONE typographic family with the native slots still
  // visibly a different FORM (mono tracked credit line vs. this hanging-key list) — never rows here.
  import type { MetadataRow } from "@render/core";

  let { rows }: { rows: MetadataRow[] } = $props();

  // Expansion is per VALUE (a row can hold one long value among short ones), keyed row+index. A plain
  // $state object is deeply reactive in Svelte 5, so assigning a key re-renders that value alone.
  let expanded = $state<Record<string, boolean>>({});
  const vkey = (row: MetadataRow, i: number): string => `${row.key}#${i}`;
</script>

{#snippet value(row: MetadataRow, i: number)}
  {@const v = row.values[i]!}
  {@const k = vkey(row, i)}
  <!-- ONE block per value (text + its toggle) so a repeat's bullet gutter has a single flex partner
       to align wrapped lines against, whether or not the value is clamped. -->
  <span class="cell">
  <span class="v" class:clamped={v.long && !expanded[k]}>{v.text}</span>
  {#if v.long}
    <button
      type="button"
      class="text-link more"
      aria-expanded={!!expanded[k]}
      aria-label={expanded[k] ? `Show less of ${row.label}` : `Show more of ${row.label}`}
      onclick={() => (expanded[k] = !expanded[k])}
    >{expanded[k] ? "Show less" : "Show more"}</button>
  {/if}
  </span>
{/snippet}

<dl class="meta">
  {#each rows as row (row.key)}
    <div class="row">
      <dt>{row.label}</dt>
      <dd>
        {#if row.values.length === 1}
          {@render value(row, 0)}
        {:else}
          <ul class="repeats">
            {#each row.values as _v, i (vkey(row, i))}
              <li>{@render value(row, i)}</li>
            {/each}
          </ul>
        {/if}
      </dd>
    </div>
  {/each}
</dl>

<style>
  .meta { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-4); }
  .row { display: flex; flex-direction: column; gap: 2px; }

  /* The key: Credit.svelte's ⓘ-panel `.k` recipe verbatim — tracked uppercase mono chrome, quiet. */
  dt {
    font-family: var(--font-ui), monospace; font-size: 0.62rem; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-paper-muted); opacity: 0.62;
  }
  dd { margin: 0; font-family: var(--font-body), sans-serif; font-size: 0.86rem; line-height: 1.6; color: var(--ink-paper-primary); }

  /* Repeat delimiter: a middot in its own fixed gutter, the value block beside it. Because the value
     is a separate flex item, its WRAPPED lines align under the text rather than under the bullet —
     that offset is what stops a wrapped line reading as a second value. */
  .repeats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .repeats li { display: flex; gap: 0.45em; }
  .repeats li::before { content: "·"; flex: none; color: var(--ink-paper-muted); opacity: 0.62; }
  .cell { display: block; min-width: 0; }

  /* 3-line clamp — the note-card clamp count. Applied ONLY to a value the projection flagged long
     (i.e. one that has a Show more), so no value is ever clipped without a way to open it. */
  .v.clamped {
    display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  }
  .more { display: inline-block; margin-top: var(--space-1); font-size: 0.78rem; }
</style>
