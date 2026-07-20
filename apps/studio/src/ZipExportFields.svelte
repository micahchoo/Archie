<!-- The control cluster every .archie.zip save surface shares: name the file, pick the exhibits.
     Three consumers — the Publish dialog's working-copy panel, its local-publish zip fallback, and
     the Save dialog (SaveZipDialog) — so the fields, their notes, and the opts composition live
     here ONCE. The parent owns the bindables (name/selected), the action buttons, and the phase
     machine; `exportOpts` composes what the flows' download/save seams take. -->
<script lang="ts" module>
  /** Every exhibit checked — the opening state of each save surface (no remembered subset: a
   *  partial copy is an explicit, per-save choice, never hidden state). */
  export function allSelected(exhibits: { slug: string }[]): Record<string, boolean> {
    return Object.fromEntries(exhibits.map((e) => [e.slug, true]));
  }
  /** The suggested name with the suffix stripped for editing (the field shows it as a fixed adornment). */
  export function baseNameOf(suggested: string): string {
    return (suggested || "library").replace(/\.archie\.zip$/, "").replace(/\.zip$/, "");
  }
  /** Compose the flows' export opts from the fields: the name always carries the `.archie.zip`
   *  suffix; `slugs` is present only for a strict subset (absent = the whole library — the
   *  pre-chooser contract every opts-less caller keeps). */
  export function exportOpts(name: string, selected: Record<string, boolean>, exhibits: { slug: string }[]): { name?: string; slugs?: string[] } {
    const base = baseNameOf(name.trim());
    const slugs = exhibits.filter((e) => selected[e.slug]).map((e) => e.slug);
    return { ...(base ? { name: `${base}.archie.zip` } : {}), ...(slugs.length === exhibits.length ? {} : { slugs }) };
  }
  /** How many exhibits are checked — parents disable their save action at 0. */
  export function selectedCount(selected: Record<string, boolean>, exhibits: { slug: string }[]): number {
    return exhibits.filter((e) => selected[e.slug]).length;
  }
</script>

<script lang="ts">
  let {
    exhibits,
    name = $bindable(""),
    selected = $bindable({}),
    subsetWarning = "",
  }: {
    exhibits: { slug: string; title: string }[];
    /** File name WITHOUT the .archie.zip suffix (shown as a fixed adornment). */
    name?: string;
    selected?: Record<string, boolean>;
    /** Surface-specific consequence of a partial copy (shown only when a subset is picked). */
    subsetWarning?: string;
  } = $props();
  const count = $derived(selectedCount(selected, exhibits));
</script>

<div class="fields">
  <label>File name
    <span class="zip-name">
      <input bind:value={name} autocomplete="off" spellcheck="false" aria-label="File name (the .archie.zip ending is added for you)" />
      <span class="zip-ext">.archie.zip</span>
    </span>
  </label>
  <fieldset class="ex-list">
    <legend>Exhibits to include</legend>
    {#each exhibits as ex (ex.slug)}
      <label class="cb"><input type="checkbox" bind:checked={selected[ex.slug]} /><span class="cb-text">{ex.title}</span></label>
    {/each}
  </fieldset>
  {#if count === 0}
    <p class="note">Pick at least one exhibit — an empty copy has nothing to open.</p>
  {:else if count < exhibits.length && subsetWarning}
    <p class="note">{subsetWarning}</p>
  {/if}
</div>

<style>
  /* Mirrors the Publish dialog's form chrome (label/input/cb) so the cluster reads the same on
     every surface it appears in. */
  .fields { display: flex; flex-direction: column; }
  label { display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); }
  input {
    font-family: var(--font-body); font-size: 1rem; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  input:focus { outline: none; border-color: var(--accent-2); }
  .zip-name { display: flex; align-items: center; gap: var(--space-2); }
  .zip-name input { flex: 1; min-width: 0; }
  .zip-ext { font-family: var(--font-mono); font-size: 0.85rem; color: var(--ink-paper-muted); }
  .ex-list { border: 0; margin: var(--space-4) 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .ex-list legend { font-family: var(--font-ui); font-size: 0.7rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-paper-muted); margin-bottom: var(--space-2); padding: 0; }
  .cb { flex-direction: row; align-items: flex-start; gap: var(--space-2); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cb input { margin-top: 2px; accent-color: var(--accent-2); padding: 0; }
  .cb-text { font-family: var(--font-body); font-size: 0.8125rem; color: var(--ink-paper-primary); }
  .note { font-family: var(--font-body); font-size: 0.78rem; line-height: 1.6; color: var(--ink-paper-muted); margin: 0; }
</style>
