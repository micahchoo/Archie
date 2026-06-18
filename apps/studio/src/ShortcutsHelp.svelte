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
  /* Soft Static cheat-sheet — warm paper card floating over a hazy warm scrim. */
  .scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: var(--space-6); background: rgba(59, 49, 56, 0.55); }
  .sheet {
    width: min(40rem, 100%); max-height: 86vh; overflow-y: auto; box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid); padding: var(--space-6);
  }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-4); }
  header h2 { margin: 0; font-family: var(--font-display); font-size: 1.5rem; font-weight: 400; color: var(--ink-paper-primary); }
  .close { cursor: pointer; background: none; border: none; font-size: 1rem; color: var(--ink-paper-muted); padding: 0 var(--space-1); border-radius: var(--radius-sm); transition: color 160ms ease; }
  .close:hover { color: var(--ink-paper-primary); }

  .groups { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  /* Section labels — quiet tracked-mono eyebrows, found not announced */
  section h3 { margin: 0 0 var(--space-2); font-family: var(--font-ui); font-size: var(--text-ui-xs); font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-paper-secondary); opacity: 0.6; }
  dl { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .row { display: flex; align-items: baseline; gap: var(--space-4); }
  dt { flex-shrink: 0; min-width: 5.5rem; display: flex; gap: var(--space-1); }
  dd { margin: 0; font-family: var(--font-body); font-size: 0.95rem; line-height: 1.6; color: var(--ink-paper-secondary); }
  /* Soft rounded warm key caps — quiet mono on warm paper, no hard edge */
  kbd { font-family: var(--font-mono); font-size: 0.72rem; line-height: 1.4; color: var(--ink-paper-secondary); background: var(--surface-paper-card); border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm); box-shadow: var(--shadow-lift-low); padding: 1px var(--space-2); text-transform: uppercase; }
  .foot { margin: var(--space-5) 0 0; font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-paper-muted); opacity: 0.62; }
</style>
