<script lang="ts">
  // UndoControls (Archie-9da0) — the note-undo affordance plus the SESSION-SCOPE disclosure.
  //
  // DECISION ON RECORD (Archie-69a6 human grill, 2026-07-28): undo is deliberately session-scoped —
  // it does NOT survive save+reload, because the overlay is memory and the append-only log (ADR-0003)
  // is the only durable thing. This component states that limit in the surface rather than solving
  // durability; the same property is pinned by undo.test.ts ("THE BOUNDARY").
  let { canUndo, canRedo, onundo, onredo }: {
    canUndo: boolean;
    canRedo: boolean;
    onundo: () => void;
    onredo: () => void;
  } = $props();
</script>

<div class="undo-controls" role="group" aria-label="Note history">
  <button type="button" disabled={!canUndo} onclick={onundo} title="Undo the last note change (⌘Z)">↶ Undo</button>
  <button type="button" disabled={!canRedo} onclick={onredo} title="Redo a note change you undid (⇧⌘Z)">↷ Redo</button>
  <span class="scope-note">Undo lasts this visit — it doesn't survive closing the exhibit.</span>
</div>

<style>
  .undo-controls {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  button {
    border: 1px solid var(--line, #ccc);
    background: var(--surface, #fff);
    color: var(--ink, #222);
    border-radius: 6px;
    padding: 0.2rem 0.55rem;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .scope-note {
    color: var(--ink-soft, #777);
    font-size: 0.8rem;
  }
</style>
