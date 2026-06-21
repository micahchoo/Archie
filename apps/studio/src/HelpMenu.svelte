<script lang="ts">
  // The ? help affordance — a round button that drops a small menu (Tutorial / Shortcuts).
  // Moored in a header; used in BOTH the editor chrome and the library home so they never drift.
  // Owns only its own open state; the actions are delegated to the parent.
  let { ontutorial, onshortcuts }: { ontutorial: () => void; onshortcuts: () => void } = $props();
  let open = $state(false);
</script>

<div class="help-wrap">
  <button class="help-btn" onclick={() => (open = !open)} title="Help"
    aria-label="Help" aria-haspopup="menu" aria-expanded={open}>?</button>
  {#if open}
    <div class="help-backdrop" role="presentation" onclick={() => (open = false)}></div>
    <div class="help-menu" role="menu">
      <button role="menuitem" onclick={() => { open = false; ontutorial(); }}>Start the tutorial</button>
      <button role="menuitem" onclick={() => { open = false; onshortcuts(); }}>Keyboard shortcuts <kbd>?</kbd></button>
    </div>
  {/if}
</div>

<style>
  .help-wrap { position: relative; display: inline-flex; }
  .help-btn {
    border-radius: 50%; min-width: 1.9rem; height: 1.9rem; padding: 0; cursor: pointer;
    text-align: center; font: inherit; font-weight: 400; line-height: 1;
    background: var(--surface-canvas-raised); color: var(--ink-paper-secondary);
    border: 1px solid var(--border-canvas, rgba(26, 60, 35, 0.14));
    transition: color 160ms ease, border-color 160ms ease;
  }
  .help-btn:hover { color: var(--ink-paper-primary); border-color: var(--accent); }
  .help-backdrop { position: fixed; inset: 0; z-index: 90; }
  .help-menu {
    position: absolute; top: calc(100% + 0.4rem); right: 0; z-index: 91;
    display: flex; flex-direction: column; min-width: 13rem; padding: var(--space-1);
    background: var(--surface-canvas-raised); border-radius: var(--radius-md); box-shadow: var(--shadow-lift-mid);
  }
  .help-menu button {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
    width: 100%; text-align: left; background: none; border: none; cursor: pointer;
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    font: inherit; font-size: 0.92rem; color: var(--ink-paper-primary);
  }
  .help-menu button:hover { background: var(--surface-paper-hover, rgba(26, 60, 35, 0.06)); }
</style>
