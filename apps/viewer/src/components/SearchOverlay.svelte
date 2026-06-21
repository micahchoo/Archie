<script lang="ts">
  // Mode-independent finder overlay (Q-3/Q-4). ONE discovery surface mounted at the ExhibitView level
  // that works in BOTH grid and narrative exhibits (the narrative has no note list, so this overlay is
  // its only finder). It is a PURE FINDER: it never touches canvas/reading state — selecting a result
  // emits `select(noteId)` and ExhibitView's arriveAtNote flips to the right reading + object + fits the
  // camera. The index is built over the FLATTENED note tree (base + every reading page), so a note that
  // lives only in a non-active reading is still findable (search-index.flattenExhibitNotes).
  import { tagsOfAnnotation, type W3CAnnotation } from "@render/core";
  import {
    buildSearchIndex,
    filterResults,
    flattenExhibitNotes,
    type StoredDoc,
  } from "../lib/search-index.js";
  import { dialog } from "../lib/dialog-a11y.js";

  let { data, initialTag = null, onselect, onclose }: {
    /** The published exhibit's note tree — base notes + per-reading overlays, flattened into the index. */
    data: {
      annotationsByObject: Record<string, W3CAnnotation[]>;
      readingAnnotationsByObject: Record<string, Record<string, W3CAnnotation[]>>;
    };
    /** Pre-scope the finder with this tag active as a facet (a tag chip elsewhere opened the overlay). */
    initialTag?: string | null;
    /** A result was picked → land on that note (ExhibitView.arriveAtNote). The overlay closes itself. */
    onselect: (noteId: string) => void;
    onclose: () => void;
  } = $props();

  // Build the flat index ONCE per open (the note tree is stable for a loaded exhibit). flattenExhibitNotes
  // de-dupes by id across base + reading overlays, so each note is one searchable doc.
  const flat = flattenExhibitNotes(data);
  const index = buildSearchIndex(flat);

  // The full tag vocabulary across the exhibit — the facet chips the finder offers (sorted, de-duped).
  const allTags = $derived.by(() => {
    const s = new Set<string>();
    for (const a of flat) for (const t of tagsOfAnnotation(a)) s.add(t);
    return [...s].sort((x, y) => x.localeCompare(y));
  });

  let query = $state("");
  // Active tag facets (OR'd by filterResults). Seeded from a chip that opened the overlay pre-scoped.
  let activeTags = $state<string[]>(initialTag ? [initialTag] : []);

  function toggleTag(t: string): void {
    activeTags = activeTags.includes(t) ? activeTags.filter((x) => x !== t) : [...activeTags, t];
  }

  // PURE filter (search-index.filterResults): tags OR each other (union), the text query ANDs that union.
  const results = $derived<StoredDoc[]>(filterResults(index, query, activeTags));

  function choose(noteId: string): void {
    onselect(noteId); // ExhibitView.arriveAtNote — flips reading + object + fits camera
    onclose(); // a pure finder: close on select, never mutate canvas state here
  }
</script>

<!-- Scrim + panel as SIBLINGS (NoteLightbox/ReadingSheet pattern): the scrim is a click-to-close
     backdrop; Esc is wired by the dialog a11y pass (Q-5). -->
<div class="finder-scrim" role="presentation" onclick={onclose}></div>
<!-- Dialog a11y (Q-5): role=dialog + aria-modal; `use:dialog` traps Tab inside the panel, moves focus
     into it on open (lands on the search input), binds ESC, and returns focus to the trigger on close. -->
<div class="finder" role="dialog" aria-modal="true" aria-labelledby="finder-title" use:dialog={{ onclose }}>
  <header class="finder-head">
    <span class="eyebrow" id="finder-title">Find a note</span>
    <button class="finder-close" onclick={onclose} aria-label="Close finder">×</button>
  </header>

  <input
    class="finder-input"
    type="search"
    placeholder="Search notes across every reading…"
    aria-label="Search notes"
    data-dialog-autofocus
    bind:value={query}
  />

  {#if allTags.length > 0}
    <div class="finder-facets" role="group" aria-label="Filter by tag">
      {#each allTags as t (t)}
        <button
          type="button"
          class="facet"
          class:on={activeTags.includes(t)}
          aria-pressed={activeTags.includes(t)}
          onclick={() => toggleTag(t)}
        >#{t}</button>
      {/each}
    </div>
  {/if}

  <ul class="finder-results">
    {#each results as r (r.id)}
      <li>
        <button class="result" onclick={() => choose(r.id)}>
          <span class="result-body">{r.body}</span>
          {#if r.tags.length}<span class="result-tags">{#each r.tags as t}<span class="tag">#{t}</span>{/each}</span>{/if}
        </button>
      </li>
    {/each}
    {#if results.length === 0}
      <li class="finder-empty">No notes match{query ? ` “${query}”` : ""}{activeTags.length ? ` in ${activeTags.map((t) => `#${t}`).join(", ")}` : ""}.</li>
    {/if}
  </ul>
</div>

<style>
  /* Warm dim + blur scrim, matching NoteLightbox/ReadingSheet — the finder floats over the read. */
  .finder-scrim { position: fixed; inset: 0; background: var(--scrim-dim); backdrop-filter: blur(3px); z-index: 60; }
  .finder {
    position: fixed; z-index: 61; top: 12vh; left: 50%; transform: translateX(-50%);
    width: min(92vw, 640px); max-height: 76vh; box-sizing: border-box;
    display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-5) var(--space-5) var(--space-4);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-radius: var(--radius-lg, var(--radius-md));
    box-shadow: var(--shadow-lift-mid);
  }
  .finder-head { display: flex; align-items: baseline; justify-content: space-between; }
  .eyebrow { font-family: var(--font-ui), monospace; font-size: 0.65rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-muted); }
  .finder-close { background: none; border: none; cursor: pointer; color: var(--ink-paper-muted); font-size: 1.4rem; line-height: 1; padding: 0; transition: color 160ms ease; }
  .finder-close:hover { color: var(--accent); }

  .finder-input {
    width: 100%; box-sizing: border-box; padding: var(--space-3) var(--space-4);
    font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.4;
  }

  /* Tag facets — quiet mono chips; the active facets fill with the rationed connector accent. */
  .finder-facets { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .facet {
    font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ink-paper-secondary); background: var(--surface-paper-hover);
    border: 1px solid transparent; border-radius: var(--radius-sm); padding: 2px var(--space-3); cursor: pointer;
    transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .facet:hover { color: var(--ink-paper-primary); border-color: var(--border-canvas-emphasis); }
  .facet.on { color: var(--ink-on-accent, var(--ink)); background: var(--accent-2); border-color: var(--accent-2); }

  .finder-results { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
  .finder-results li { margin-bottom: var(--space-2); }
  .result {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: var(--space-3) var(--space-4);
    background: var(--surface-paper-card); color: var(--ink-paper-primary);
    border: none; border-left: 3px solid transparent; border-radius: var(--radius-md);
    box-shadow: var(--shadow-lift-low);
    font-family: var(--font-body); font-size: 1rem; line-height: 1.45;
    transition: background 160ms ease, border-color 160ms ease;
  }
  .result:hover { background: var(--surface-paper-hover); border-left-color: var(--accent); }
  .result-body { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .result-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }
  .tag { font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-secondary); background: var(--surface-paper-hover); padding: 2px var(--space-3); border-radius: var(--radius-sm); }

  .finder-empty { font-family: var(--font-body); font-size: 0.95rem; color: var(--ink-paper-secondary); padding: var(--space-4); background: var(--surface-paper-hover); border-radius: var(--radius-md); }
</style>
