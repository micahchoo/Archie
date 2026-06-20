<script lang="ts">
  // ⌘K — the "catalog drawer" for intra-Library linking (CONTEXT §95 linkability). While writing a
  // note, the curator CITES another note/exhibit in the same Library: this picker finds the target by
  // its text and the parent (App.svelte) splices an `archie:` ref into the Comment at the cursor.
  //
  // Deliberately NOT a dark IDE command bar (the default to reject): it is warm paper — it belongs to
  // the note-writing surface — and each candidate is a catalog card in the exact idiom of the sidebar
  // note cards (forest-green active border = the "link affordance" accent, system.md §19). Presentation
  // only: the parent builds the entries (incl. the encoded `archie:` ref) and performs the insertion.
  import { tick } from "svelte";

  interface CmdEntry {
    id: string;
    kind: "note" | "exhibit";
    exhibitSlug: string;
    exhibitTitle: string;
    label: string; // the note's text lead, or the exhibit title
    ref: string;   // the encoded archie: URI to insert
  }

  let {
    open = false,
    entries = [],
    onpick,
    onclose,
  }: {
    open?: boolean;
    entries?: CmdEntry[];
    onpick: (entry: CmdEntry) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let active = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return entries;
    return entries.filter((e) => `${e.label} ${e.exhibitTitle} ${e.exhibitSlug}`.toLowerCase().includes(q));
  });

  // Reset + focus each time the drawer opens; keep `active` in range as the filter narrows.
  $effect(() => {
    if (open) { query = ""; active = 0; void tick().then(() => inputEl?.focus()); }
  });
  $effect(() => { if (active >= filtered.length) active = Math.max(0, filtered.length - 1); });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onclose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); return; }
    if (e.key === "Enter") { e.preventDefault(); const sel = filtered[active]; if (sel) onpick(sel); }
  }
</script>

{#if open}
  <!-- Soft warm scrim over the gallery ground; the drawer itself is warm paper. Click-away closes. -->
  <div class="scrim" role="presentation" onclick={() => onclose()}>
    <div class="drawer" role="dialog" aria-label="Cite a note or exhibit" onclick={(e) => e.stopPropagation()}>
      <div class="search">
        <span class="seal" aria-hidden="true">¶</span>
        <input
          bind:this={inputEl}
          bind:value={query}
          onkeydown={onKeydown}
          type="text"
          placeholder="Search for a note or exhibit to link to…"
          spellcheck="false"
        />
        <kbd>esc</kbd>
      </div>

      <p class="lead">Links to a note or exhibit become clickable when you publish.</p>

      <ul class="results">
        {#if filtered.length === 0}
          <li class="empty">No notes or exhibits match — refine the text, or write the link by hand.</li>
        {:else}
          {#each filtered as e, i (e.id)}
            <li>
              <button
                class:active={i === active}
                onmouseenter={() => (active = i)}
                onclick={() => onpick(e)}
              >
                <span class="kind" class:exhibit={e.kind === "exhibit"}>{e.kind === "exhibit" ? "exhibit" : "note"}</span>
                <span class="label">{e.label}</span>
                <span class="where">{e.exhibitTitle}</span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>

      <p class="hint"><kbd>↑↓</kbd> move · <kbd>↵</kbd> insert link · it points to the target once you publish</p>
    </div>
  </div>
{/if}

<style>
  /* The catalog drawer floats over the gallery ground on warm paper — part of writing the note,
     not a foreign command bar. A quiet accent-muted tint marks the active row (no loud fill). */
  .scrim {
    position: fixed; inset: 0; z-index: 60;
    display: flex; justify-content: center; align-items: flex-start;
    padding-top: 12vh;
    background: rgba(59, 49, 56, 0.42); /* warm charcoal haze, soft veil */
  }
  .drawer {
    width: min(560px, 92vw); max-height: 70vh; display: flex; flex-direction: column;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid); /* soft warm lift, no hard offset */
    overflow: hidden;
  }

  /* Search row — the manuscript margin where you note a reference */
  .search { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-canvas); }
  .search .seal { font-family: var(--font-display); font-weight: 400; font-size: 1.2rem; color: var(--accent); }
  .search input {
    flex: 1; border: none; background: none; outline: none;
    font-family: var(--font-body); font-size: 1.0625rem; color: var(--ink-paper-primary);
  }
  .search input::placeholder { color: var(--ink-paper-muted); }

  /* Orienting lead — what Cite does + its outcome, promoted from the easily-missed footer hint so a
     first-time curator knows what picking a row will produce before they commit. */
  .lead { margin: 0; padding: var(--space-3) var(--space-5) 0; font-family: var(--font-body); font-size: 0.9rem; line-height: 1.5; color: var(--ink-paper-secondary); }

  kbd {
    font-family: var(--font-mono); font-size: var(--text-ui-xs); color: var(--ink-paper-secondary);
    text-transform: uppercase; letter-spacing: 0.14em;
    background: var(--surface-paper-hover); border-radius: var(--radius-sm);
    padding: 1px var(--space-2);
  }

  /* Results — catalog cards, the sidebar note-card idiom */
  .results { list-style: none; margin: 0; padding: var(--space-2); overflow-y: auto; }
  .results button {
    display: grid; grid-template-columns: auto 1fr auto; align-items: baseline; gap: var(--space-3);
    width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-2) var(--space-3); margin-bottom: 2px;
    background: transparent; color: var(--ink-paper-primary);
    border: none; border-left: 2px solid transparent; border-radius: var(--radius-sm);
    transition: background 140ms ease, border-color 140ms ease;
  }
  .results button.active { background: var(--accent-muted); border-left-color: var(--accent); }
  .kind {
    font-family: var(--font-mono); font-size: var(--text-ui-xs); letter-spacing: 0.14em;
    color: var(--accent); text-transform: uppercase; opacity: 0.62;
  }
  .kind.exhibit { color: var(--ink-paper-secondary); }
  .label {
    font-family: var(--font-body); font-size: 1rem; line-height: 1.3;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .where { font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted); white-space: nowrap; }
  .empty { padding: var(--space-5); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }

  .hint {
    margin: 0; padding: var(--space-2) var(--space-5) var(--space-3);
    border-top: 1px solid var(--border-canvas);
    font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted);
  }
  .hint kbd { margin: 0 1px; }
</style>
