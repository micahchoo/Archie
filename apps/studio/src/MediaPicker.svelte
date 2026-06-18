<script lang="ts">
  // The VISUAL companion to ⌘K (Archie-ea50, grill: "A — two complementary pickers, not one"). ⌘K
  // (CmdK.svelte) stays the fast keyboard text-cite; THIS is the eyes-first surface — a grid of tiles
  // for when the curator recognises the thing by its image, not its text. Both pickers hand the parent
  // the SAME result (a chosen item the parent maps to a ref + insert), so the insertion stays single-
  // sourced (App.svelte's pendingCiteInsert). Presentation only: the parent builds items + acts on pick.
  //
  // Warm paper, same idiom as CmdK — it belongs to the note-writing surface, not a foreign media browser.
  // A tile with no resolvable thumbnail (AV, or a not-yet-resolved asset) shows a labelled plate, never
  // a broken image — the label always carries the meaning.
  import { tick } from "svelte";

  export interface PickItem {
    id: string;
    label: string;
    /** Resolved thumbnail URL; "" / undefined → a labelled placeholder plate (AV / unresolved). */
    thumb?: string;
    /** Secondary line — where it lives (exhibit title) or its kind. */
    sub?: string;
  }

  let {
    open = false,
    title = "Choose",
    items = [],
    onpick,
    onclose,
  }: {
    open?: boolean;
    title?: string;
    items?: PickItem[];
    onpick: (item: PickItem) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let panelEl = $state<HTMLDivElement | null>(null);
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.label} ${it.sub ?? ""}`.toLowerCase().includes(q));
  });
  $effect(() => { if (open) { query = ""; void tick().then(() => panelEl?.focus()); } });
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => onclose()}>
    <div class="panel" role="dialog" aria-label={title} tabindex="-1" bind:this={panelEl}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === "Escape") { e.preventDefault(); onclose(); } }}>
      <div class="head">
        <span class="seal" aria-hidden="true">▦</span>
        <input bind:value={query} type="text" placeholder={title} spellcheck="false" aria-label={title} />
        <kbd>esc</kbd>
      </div>
      {#if filtered.length === 0}
        <p class="empty">Nothing to show here yet — add media to this exhibit, or use ⌘K to cite by text.</p>
      {:else}
        <ul class="grid">
          {#each filtered as it (it.id)}
            <li>
              <button type="button" onclick={() => onpick(it)} title={it.label}>
                <span class="thumb" class:plate={!it.thumb} style={it.thumb ? `background-image:url(${it.thumb})` : ""}>
                  {#if !it.thumb}<span class="plate-glyph" aria-hidden="true">◫</span>{/if}
                </span>
                <span class="tile-label">{it.label}</span>
                {#if it.sub}<span class="tile-sub">{it.sub}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="hint">Click a tile to cite it · or press <kbd>esc</kbd> and use <kbd>⌘K</kbd> to cite by text</p>
    </div>
  </div>
{/if}

<style>
  /* Mirrors CmdK's warm-paper drawer over the soft gallery ground — the two pickers are siblings. */
  .scrim {
    position: fixed; inset: 0; z-index: 60; display: flex; justify-content: center; align-items: flex-start;
    padding-top: 10vh; background: rgba(59, 49, 56, 0.42);
  }
  .panel {
    width: min(680px, 92vw); max-height: 74vh; display: flex; flex-direction: column; outline: none;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid); overflow: hidden;
  }
  .head { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-canvas); }
  .head .seal { font-family: var(--font-display); font-weight: 400; font-size: 1.2rem; color: var(--accent); }
  .head input { flex: 1; border: none; background: none; outline: none; font-family: var(--font-body); font-size: 1.0625rem; color: var(--ink-paper-primary); }
  .head input::placeholder { color: var(--ink-paper-muted); }
  kbd { font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-paper-secondary); text-transform: uppercase; letter-spacing: 0.14em; background: var(--surface-paper-hover); border-radius: var(--radius-sm); padding: 1px var(--space-2); }

  .grid { list-style: none; margin: 0; padding: var(--space-3); display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: var(--space-3); overflow-y: auto; }
  .grid button {
    display: flex; flex-direction: column; gap: var(--space-1); width: 100%; cursor: pointer; text-align: left;
    padding: var(--space-2); background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas); border-radius: var(--radius-md); transition: box-shadow 160ms ease, border-color 160ms ease;
  }
  .grid button:hover { border-color: var(--border-canvas-emphasis); box-shadow: var(--shadow-lift-low); }
  .thumb { display: block; aspect-ratio: 4 / 3; border-radius: var(--radius-sm); background-color: var(--surface-paper-hover); background-size: cover; background-position: center; }
  .thumb.plate { display: flex; align-items: center; justify-content: center; }
  .plate-glyph { font-size: 1.6rem; color: var(--ink-paper-muted); }
  .tile-label { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile-sub { font-family: var(--font-ui); font-size: var(--text-ui-xs); text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-paper-muted); opacity: 0.62; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: var(--space-5); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .hint { margin: 0; padding: var(--space-2) var(--space-5) var(--space-3); border-top: 1px solid var(--border-canvas); font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted); }
</style>
