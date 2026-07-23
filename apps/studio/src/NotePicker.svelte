<script lang="ts">
/**
 * @surface {popover}
 * @composes {Note-to-section palette}
 * @variants {empty results, grouped by object (current-object header), flat result list}
 * @constraint {popover: scrim dismiss — selection IS the open-state; search resets on open}
 */
  // "Add a section from a note" — the narrative create-row companion to ⌘K (CmdK.svelte). Same warm-paper
  // catalog drawer, same catalog-card idiom; where ⌘K CITES a target (splices an archie: link), this one
  // SEEDS a section from an existing Note (its object + camera + prose — ADR-0005 model-(A) mitigation). It
  // replaces the old native <select> so "from a note" reads the same as citing: a searchable, keyboard-driven
  // picker rather than a cramped OS dropdown. Presentation only — the parent (App.svelte) performs the create.
  //
  // Modality (Archie-5968): a scrimmed surface via the shared helper — scrim-click + Esc + focus trap/return
  // + single-scrim come from `modality`; only the list-navigation keys (↑↓ / ↵) stay local.
  import { scrimmed, trapFocus, modality } from "./modality.svelte";
  import { snippetParts } from "./snippet";

  interface NoteEntry {
    id: string;
    objectId: string;
    start?: string;
    where: string; // the object the note lives on — the catalog "where" meta line
    text: string;  // the note's FULL stripped prose — searched whole, clamped visually, seeds the section verbatim
  }

  let {
    open = false,
    notes = [],
    currentObjectId = "",
    onpick,
    onclose,
  }: {
    open?: boolean;
    notes?: NoteEntry[];
    currentObjectId?: string; // the object being viewed — its notes sort to the top, under their own header
    onpick: (note: NoteEntry) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");
  let active = $state(0);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return notes;
    return notes.filter((n) => `${n.text} ${n.where}`.toLowerCase().includes(q));
  });
  // Notes on the object you're viewing sort to the top; notes elsewhere in the exhibit follow. `rows` is the
  // flat concatenation the keyboard/active index walks; `hereCount` is where the second group begins, and
  // headers show ONLY when both groups are present (one group needs no label).
  const here = $derived(filtered.filter((n) => n.objectId === currentObjectId));
  const rows = $derived([...here, ...filtered.filter((n) => n.objectId !== currentObjectId)]);
  const hereCount = $derived(here.length);
  const showHeaders = $derived(hereCount > 0 && hereCount < rows.length);
  const hereLabel = $derived(rows[0]?.where || "this object");

  // Reset each time the drawer opens; keep `active` in range as the filter narrows. (Initial focus is the
  // modality helper's job — `use:scrimmed` focuses the search input, the first focusable in the panel.)
  $effect(() => {
    if (open) { query = ""; active = 0; }
  });
  $effect(() => { if (active >= rows.length) active = Math.max(0, rows.length - 1); });
  // Two-line cards mean fewer rows fit the drawer — keep the keyboard-active card in view.
  let listEl = $state<HTMLUListElement | null>(null);
  $effect(() => {
    listEl?.querySelectorAll("button")[active]?.scrollIntoView({ block: "nearest" });
  });

  // List navigation only — Esc/scrim-click/focus-trap are the shared helper's (Esc arrives via App's
  // global keydown → modality.handleEsc, so it works whether or not focus is in this input).
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, rows.length - 1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); return; }
    if (e.key === "Enter") { e.preventDefault(); const sel = rows[active]; if (sel) onpick(sel); }
  }
</script>

{#if open}
  <!-- Soft warm scrim over the gallery ground; the drawer itself is warm paper. Click-away closes. -->
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}>
    <div class="drawer" role="dialog" aria-modal="true" aria-label="Add a section from a note" tabindex="-1"
      use:scrimmed={{ onClose: onclose }} onkeydown={trapFocus} onclick={(e) => e.stopPropagation()}>
      <div class="search">
        <span class="seal" aria-hidden="true">¶</span>
        <input
          bind:value={query}
          onkeydown={onKeydown}
          type="text"
          placeholder="Search your notes to turn one into a section…"
          spellcheck="false"
        />
        <kbd>esc</kbd>
      </div>

      <p class="lead">The new section starts on the note's object, framed by its camera, with its text as the opening prose.</p>

      <ul class="results" bind:this={listEl}>
        {#if rows.length === 0}
          <li class="empty">No notes match — refine the text, or start a blank section instead.</li>
        {:else}
          {#each rows as n, i (n.id)}
            <!-- Catalog card, two registers: a quiet meta line (kind · where), then the note's prose on
                 its own full-width lines, clamped — the old single-line row squeezed the text against a
                 right-aligned "where" and truncated away everything distinguishing. The excerpt windows
                 to the search match (snippetParts) so a deep hit is visible, and emphasized. -->
            {@const p = snippetParts(n.text, query)}
            {#if showHeaders && i === 0}<li class="group-head">On {hereLabel}</li>{/if}
            {#if showHeaders && i === hereCount}<li class="group-head">Elsewhere in the exhibit</li>{/if}
            <li>
              <button
                class:active={i === active}
                onmouseenter={() => (active = i)}
                onclick={() => onpick(n)}
              >
                <span class="meta">
                  <span class="kind">note</span>
                  {#if n.where && (!showHeaders || i >= hereCount)}<span class="where">{n.where}</span>{/if}
                </span>
                <span class="label">{p.pre}{#if p.match}<mark>{p.match}</mark>{p.post}{/if}</span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>

      <p class="hint"><kbd>↑↓</kbd> move · <kbd>↵</kbd> add section · it opens on the note's object</p>
    </div>
  </div>
{/if}

<style>
  /* Mirrors CmdK.svelte exactly — the catalog drawer floats over the gallery ground on warm paper, a quiet
     accent-muted tint marks the active row. Kept a sibling (not a shared component) to match this repo's
     hand-rolled scrim+dialog idiom; if a third picker appears, extract the shared shell then. */
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

  /* Orienting lead — what picking a note produces, promoted from the footer hint. */
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
    display: flex; flex-direction: column; align-items: stretch; gap: var(--space-1);
    width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-2) var(--space-3); margin-bottom: 2px;
    background: transparent; color: var(--ink-paper-primary);
    border: none; border-left: 2px solid transparent; border-radius: var(--radius-sm);
    transition: background 140ms ease, border-color 140ms ease;
  }
  .results button.active { background: var(--accent-muted); border-left-color: var(--accent); }
  .meta { display: flex; align-items: baseline; gap: var(--space-3); }
  .kind {
    font-family: var(--font-mono); font-size: var(--text-ui-xs); letter-spacing: 0.14em;
    color: var(--accent); text-transform: uppercase; opacity: 0.62;
  }
  .label {
    font-family: var(--font-body); font-size: 1rem; line-height: 1.35;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
  }
  .label mark { background: var(--accent-muted); color: inherit; font-weight: 600; border-radius: 2px; padding: 0 1px; }
  .where { font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: var(--space-5); font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  /* Group divider — "On <object>" vs "Elsewhere in the exhibit"; quiet uppercase label, not a card. */
  .group-head { padding: var(--space-3) var(--space-3) var(--space-1); font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-paper-muted); }

  .hint {
    margin: 0; padding: var(--space-2) var(--space-5) var(--space-3);
    border-top: 1px solid var(--border-canvas);
    font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted);
  }
  .hint kbd { margin: 0 1px; }
</style>
