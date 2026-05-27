<script lang="ts">
  // The `?` cheat-sheet — a read-only overlay GENERATED from the shortcut registry (never hand-maintained,
  // so it can't drift from the wired handlers). Curator voice; "curator's study" paper card over a dark scrim.
  import { SHORTCUTS, SHORTCUT_GROUPS, type Shortcut } from "./shortcuts.js";

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const byGroup = (g: Shortcut["group"]) => SHORTCUTS.filter((s) => s.group === g);
  // Split a display string ("[ ]", "← →", "⌘S") into its individual key caps.
  const caps = (keys: string) => keys.split(" ").filter(Boolean);
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onclose}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onclick={(e) => e.stopPropagation()}>
      <header>
        <h2>Keyboard shortcuts</h2>
        <button class="close" onclick={onclose} aria-label="Close">✕</button>
      </header>
      <div class="groups">
        {#each SHORTCUT_GROUPS as g}
          <section>
            <h3>{g}</h3>
            <dl>
              {#each byGroup(g) as s}
                <div class="row">
                  <dt>{#each caps(s.keys) as c}<kbd>{c}</kbd>{/each}</dt>
                  <dd>{s.label}</dd>
                </div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
      <p class="foot">Press <kbd>?</kbd> or <kbd>Esc</kbd> to close.</p>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: var(--space-6); background: rgba(20, 19, 16, 0.62); }
  .sheet {
    width: min(40rem, 100%); max-height: 86vh; overflow-y: auto; box-sizing: border-box;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: 1px solid var(--border-paper-emphasis); border-radius: var(--radius-md);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5); padding: var(--space-6);
  }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-4); }
  header h2 { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; color: var(--ink-paper-primary); }
  .close { cursor: pointer; background: none; border: none; font-size: 1rem; color: var(--ink-paper-muted); padding: 0 var(--space-1); }
  .close:hover { color: var(--accent); }

  .groups { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  section h3 { margin: 0 0 var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  dl { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; align-items: baseline; gap: var(--space-4); }
  dt { flex-shrink: 0; min-width: 5.5rem; display: flex; gap: var(--space-1); }
  dd { margin: 0; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.4; color: var(--ink-paper-secondary); }
  kbd { font-family: var(--font-mono); font-size: 0.72rem; line-height: 1.4; color: var(--ink-paper-primary); background: var(--surface-paper-hover); border: 1px solid var(--border-paper-emphasis); border-bottom-width: 2px; border-radius: var(--radius-sm); padding: 1px var(--space-2); }
  .foot { margin: var(--space-5) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-paper-muted); }
</style>
