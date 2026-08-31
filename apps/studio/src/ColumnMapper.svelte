<script lang="ts">
  /**
   * @surface component
   * @composes column-mapper
   * @constraint chrome only: the mapping grid's state lives in the HOST (a per-column string grid,
   *   advanced by column-mapper.ts setTargetAt); this renders header × first-row-sample × target
   *   dropdown and reports every choice through `ontarget`. The host owns the vocabulary —
   *   MetadataImport points columns at FieldTargets ("Archie field"), the annotation CSV mapper
   *   (csv-import.ts, Archie-96e6) points them at dialect roles.
   *
   * The mapping step, extracted verbatim from MetadataImport.svelte (Archie-3754 → Archie-96e6) so a
   * second importer presents the IDENTICAL step instead of a bespoke one — that duplication is the
   * outcome Archie-96e6 exists to prevent. The first DATA row is shown beside each column so the
   * author maps against real values, not guesses.
   */
  import { groupOptions, type MapperOption } from "./column-mapper.js";

  let {
    header,
    sample,
    targets,
    options,
    ontarget,
    heading = "Your columns",
    targetHead = "Target",
    targetAria = (h: string) => h,
  }: {
    /** The sheet's header row — one row per column. */
    header: string[];
    /** The first data row, shown beside each column so the mapping is made against real values. */
    sample: string[];
    /** Per-column dropdown value, width-aligned with `header` ("" = not mapped). */
    targets: string[];
    /** What a column can be pointed at — the host's vocabulary. */
    options: MapperOption[];
    ontarget: (column: number, value: string) => void;
    heading?: string;
    /** The third column's heading ("Archie field" for the catalogue import). */
    targetHead?: string;
    /** The sr-only label naming the column a dropdown points (the host supplies the vocabulary). */
    targetAria?: (header: string, index: number) => string;
  } = $props();

  const groups = $derived(groupOptions(options));
</script>

<div class="field">
  <span class="field-head">{heading}</span>
  <table class="mapping">
    <thead>
      <tr><th scope="col">Column</th><th scope="col">First row</th><th scope="col">{targetHead}</th></tr>
    </thead>
    <tbody>
      {#each header as h, i (i)}
        <tr>
          <th scope="row">{h || `Column ${i + 1}`}</th>
          <td class="sample">{sample[i] ?? ""}</td>
          <td>
            <label class="control">
              <span class="sr-only">{targetAria(h || `column ${i + 1}`, i)}</span>
              <select value={targets[i] ?? ""} onchange={(e) => ontarget(i, e.currentTarget.value)}>
                {#each groups as g (g.name)}
                  {#if g.name}
                    <optgroup label={g.name}>
                      {#each g.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                    </optgroup>
                  {:else}
                    {#each g.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                  {/if}
                {/each}
              </select>
            </label>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  /* Field / select / table idiom mirrors MetadataImport.svelte — Svelte scopes styles per component,
     so the shared step carries its own copy of exactly the rules its markup uses. */
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .field-head {
    font-family: var(--font-ui);
    font-size: var(--text-ui-xs, 0.7rem);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ink-canvas-muted);
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  select {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    padding: var(--space-2) var(--space-3);
    background: var(--surface-canvas-raised);
    color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm);
    transition: border-color 160ms ease, box-shadow 160ms ease;
    cursor: pointer;
  }
  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border-canvas);
    vertical-align: middle;
  }
  thead th {
    font-size: var(--text-ui-xs, 0.7rem);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-canvas-muted);
    font-weight: 500;
  }
  tbody th {
    font-weight: 600;
    color: var(--ink-canvas-primary);
  }
  .sample {
    color: var(--ink-canvas-secondary);
    max-width: 16ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mapping td:last-child {
    width: 40%;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
