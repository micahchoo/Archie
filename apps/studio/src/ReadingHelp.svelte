<script lang="ts">
  // First-time teaching modal for the "+ Reading" action (ADR-0007). A Reading is a mutually-exclusive
  // interpretive pass over the source; a note belongs to AT MOST ONE reading or the always-visible base;
  // readings carry colours. Curator voice — name what a reading IS and does, no dev jargon (no "Layer",
  // retired by ADR-0007). Warm-paper card over a dark scrim, matching ShortcutsHelp. Dismissible-and-
  // remembered: showing it once is enough; the parent gates on a localStorage flag so it never re-nags.
  let {
    open,
    onproceed,
    onclose,
  }: {
    open: boolean;
    /** Continue to naming a reading (the primary path: learn, then add). */
    onproceed: () => void;
    /** Dismiss without adding (scrim / Esc / ✕) — still counts as "seen". */
    onclose: () => void;
  } = $props();
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onclose}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="About readings"
      onclick={(e) => e.stopPropagation()}>
      <button class="close" onclick={onclose} aria-label="Close">✕</button>
      <p class="eyebrow">Readings</p>
      <h2>One way of reading this source</h2>
      <p class="lede">
        A reading is one way of interpreting this source — like a <em>Cipher</em> reading
        beside a <em>Hoax</em> reading. It's a pass you can show on its own.
      </p>
      <ul class="points">
        <li>Notes you write while a reading is active belong to <strong>it alone</strong> — a
          note sits in one reading, or in the base that everyone sees.</li>
        <li>The <strong>base stays visible</strong> under whichever reading a visitor picks, so
          shared ground is always there.</li>
        <li>Each reading gets its own <strong>colour</strong>, so its marks read apart from the
          rest on the image.</li>
      </ul>
      <div class="actions">
        <button type="button" class="ghost" onclick={onclose}>Not now</button>
        <button type="button" class="primary" onclick={onproceed}>Name a reading…</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: var(--space-6); background: rgba(20, 19, 16, 0.62); }
  .sheet {
    position: relative;
    width: min(32rem, 100%); max-height: 86vh; overflow-y: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-lg);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5); padding: var(--space-6);
  }
  .close { position: absolute; top: var(--space-4); right: var(--space-4); cursor: pointer; background: none; border: none; font-size: 1rem; color: var(--ink-paper-muted); padding: 0 var(--space-1); }
  .close:hover { color: var(--accent); }
  .eyebrow { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui-md); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
  h2 { font-family: var(--font-display); font-size: 1.75rem; font-weight: 600; line-height: 1.1; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.45; color: var(--ink-paper-secondary); margin: 0 0 var(--space-4); }
  .lede em { font-style: italic; color: var(--ink-paper-primary); }
  .points { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
  .points li { font-family: var(--font-body); font-size: 0.95rem; line-height: 1.45; color: var(--ink-paper-secondary); }
  .points strong { font-weight: 600; color: var(--ink-paper-primary); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
  button.ghost, button.primary { font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; }
  .ghost { background: none; color: var(--ink-paper-secondary); border: 1px solid var(--border-paper-emphasis); }
  .ghost:hover { color: var(--ink-paper-primary); border-color: var(--ink-paper-secondary); }
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); }
  .primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
</style>
