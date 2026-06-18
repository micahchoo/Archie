<script lang="ts">
  // The Readings surface: a centered modal that EXPLAINS the concept where it's edited (user: the
  // side-drawer felt fragmented and under-explained). Replaces the two-step gate (ReadingHelp teaching
  // modal → drawer, ADR-0007's first-add flow) — the copy that taught the concept once now lives
  // permanently in the modal header, so there is nothing to gate or remember in localStorage.
  // Editing itself stays in ReadingsEditor (id-stable renames, descriptions, palette swatches).
  import type { Reading } from "@render/core";
  import ReadingsEditor from "./ReadingsEditor.svelte";

  let { open, readings, palette, onchange, onadd, onclose }: {
    open: boolean;
    readings: Reading[];
    palette: string[];
    onchange: (next: Reading[]) => void;
    /** A newly-added reading's id — the caller may make it the active filter. */
    onadd?: (id: string) => void;
    onclose: () => void;
  } = $props();
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onclose}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Readings">
    <button class="x" onclick={onclose} aria-label="Close">×</button>
    <header>
      <p class="eyebrow">Readings</p>
      <h2>Ways of reading this source</h2>
      <p class="lede">
        A reading is one way of interpreting this source — a <em>Cipher</em> reading beside a
        <em>Hoax</em> reading. Rival readings sit side by side; they are never merged.
        Name, colour, and describe each one here.
      </p>
      <ul class="points">
        <li>Notes you write while a reading is active belong to <strong>it alone</strong>. The
          <strong>base stays visible</strong> under every reading, so shared ground is always there.</li>
        <li>Each reading's <strong>colour</strong> sets its marks apart on the image.</li>
        <li>The <strong>description</strong> appears under the reading's name in the published
          legend — it's how visitors learn what this way of seeing claims.</li>
        <li><strong>Renaming is safe</strong> — notes stay attached. Removing a reading keeps its
          notes, shown under “All notes”.</li>
      </ul>
    </header>
    <div class="body">
      <ReadingsEditor {readings} {palette} {onchange} {onadd} />
    </div>
    <div class="actions"><button type="button" class="done soft-btn" onclick={onclose}>Done</button></div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgba(59,49,56,0.58); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(38rem, calc(100vw - var(--space-8))); max-height: 86vh; overflow-y: auto; box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border: none; border-radius: var(--radius-lg); padding: var(--space-6);
    box-shadow: var(--shadow-lift-mid);
  }
  .x { position: absolute; top: var(--space-4); right: var(--space-4); cursor: pointer; background: none; border: none; font-family: var(--font-display); font-size: 1.3rem; line-height: 1; color: var(--ink-paper-muted); padding: 0 var(--space-1); transition: color 160ms ease; }
  .x:hover { color: var(--ink-paper-primary); }
  header { margin-bottom: var(--space-4); }
  .eyebrow { margin: 0 0 var(--space-2); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 400; line-height: 1.2; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0 0 var(--space-3); }
  .lede em { font-style: italic; color: var(--ink-paper-primary); }
  .points { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
  .points li { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  .points strong { font-weight: 600; color: var(--ink-paper-primary); }
  .body { border-top: 1px solid var(--border-canvas); }
  .actions { display: flex; justify-content: flex-end; margin-top: var(--space-4); }
  .done { font-size: 0.8125rem; letter-spacing: 0.06em; padding: var(--space-2) var(--space-4); }
</style>
