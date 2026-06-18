<script lang="ts">
  // ONE place to author Readings (user: the inline-input + create-time-swatches + describe-prompt
  // trio was fragmented). Hosted by ReadingsModal, whose header carries the explanatory copy —
  // this component is just the rows. Renaming NEVER changes a reading's id — notes reference
  // readings by id; ids mint once, on add.
  import type { Reading } from "@render/core";

  let { readings, palette, onchange, onadd }: {
    readings: Reading[];
    palette: string[];
    onchange: (next: Reading[]) => void;
    /** A newly-added reading's id — the caller may make it the active filter. */
    onadd?: (id: string) => void;
  } = $props();

  let newName = $state("");

  /** Drop an empty description rather than storing "". */
  const clean = (r: Reading): Reading => {
    const { description, ...rest } = r;
    return description?.trim() ? { ...rest, description: description.trim() } : rest;
  };
  const patch = (id: string, fields: Partial<Reading>) =>
    onchange(readings.map((r) => (r.id === id ? clean({ ...r, ...fields }) : r)));

  function mintId(name: string): string {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `r${readings.length + 1}`;
    let id = base, n = 2;
    while (readings.some((r) => r.id === id)) id = `${base}-${n++}`;
    return id;
  }
  function add() {
    const nm = newName.trim();
    if (!nm) return;
    const id = mintId(nm);
    onchange([...readings, { id, name: nm, colour: palette[readings.length % palette.length]! }]);
    onadd?.(id);
    newName = "";
  }
</script>

{#if readings.length === 0}
  <p class="empty">No readings yet — name your first below.</p>
{/if}
{#each readings as r (r.id)}
  <section class="reading">
    <div class="row">
      <span class="swatches" role="group" aria-label="Colour for {r.name}">
        {#each palette as c (c)}
          <button type="button" class="swatch" class:on={r.colour === c} style="background:{c}" onclick={() => patch(r.id, { colour: c })} aria-label="Use this colour" title="Use this colour"></button>
        {/each}
      </span>
      <input class="name" value={r.name} aria-label="Reading name"
        onchange={(e) => { const v = e.currentTarget.value.trim(); if (v) patch(r.id, { name: v }); else e.currentTarget.value = r.name; }} />
      <button type="button" class="remove" onclick={() => onchange(readings.filter((x) => x.id !== r.id))} title="Remove this reading — its notes stay, shown under “General notes”" aria-label="Remove {r.name}">✕</button>
    </div>
    <textarea rows="2" placeholder="Describe this reading in a sentence or two"
      value={r.description ?? ""} aria-label="Description for {r.name}"
      onchange={(e) => patch(r.id, { description: e.currentTarget.value })}></textarea>
  </section>
{/each}
<form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
  <input bind:value={newName} placeholder="Name a reading — e.g. Conservation, Symbolism" aria-label="New reading name" />
  <button type="submit" disabled={newName.trim() === ""}>Add</button>
</form>

<style>
  /* Paper-side panel content (the PropsDrawer surface) — mirrors DetailsEditor's quiet form idiom. */
  .empty { font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-secondary); margin: 0 0 var(--space-3); }
  .reading { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) 0; border-bottom: 1px solid var(--border-canvas); }
  .row { display: flex; align-items: center; gap: var(--space-2); }
  .swatches { display: inline-flex; gap: 5px; }
  .swatch { width: 18px; height: 18px; padding: 0; border: 2px solid transparent; border-radius: 50%; cursor: pointer; }
  .swatch.on { border-color: var(--accent); box-shadow: var(--shadow-signal-glow); }
  .name {
    flex: 1; font-family: var(--font-body); font-size: 0.9rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .name:focus { outline: none; border-color: var(--accent-2); }
  .remove { background: none; border: none; cursor: pointer; padding: 6px var(--space-2); color: var(--ink-paper-muted); font-family: var(--font-ui); font-size: 0.9rem; }
  .remove:hover { color: var(--semantic-error); }
  textarea {
    width: 100%; box-sizing: border-box; resize: vertical;
    font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; padding: var(--space-2) var(--space-3);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  textarea:focus { outline: none; border-color: var(--accent-2); }
  .add { display: flex; gap: var(--space-2); padding-top: var(--space-3); }
  .add input {
    flex: 1; font-family: var(--font-body); font-size: 0.9rem; padding: var(--space-1) var(--space-2);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
  }
  .add input:focus { outline: none; border-color: var(--accent-2); }
  .add button {
    font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; letter-spacing: 0.08em;
    padding: var(--space-1) var(--space-3); cursor: pointer;
    background: var(--accent); color: var(--ink-on-accent); border: none; border-radius: var(--radius-sm);
    box-shadow: var(--shadow-signal-glow); transition: box-shadow 160ms ease, background 160ms ease;
  }
  .add button:hover:not(:disabled) { background: var(--accent-hover); }
  .add button:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); box-shadow: none; cursor: default; }
</style>
