<script lang="ts">
  // Identity prompt (CONTEXT invention #6 + UX principle #2 "surface decisions at the moment they
  // acquire meaning"). A local display name, asked at the FIRST "Import changes" — the instant your work
  // is about to mix with a collaborator's — never at launch. Skip → Anonymous (gentle re-prompt later).
  // The name becomes the merge DAG's lastEditor, shown to collaborators in the conflict cards. Browser-only.
  let {
    open = false,
    onsave,
    onskip,
  }: {
    open?: boolean;
    onsave: (name: string) => void;
    onskip: () => void;
  } = $props();

  let name = $state("");
  function save() { const n = name.trim(); if (n) onsave(n); }
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={onskip}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Your display name">
    <header>
      <p class="eyebrow">Before you sync</p>
      <h2>What name should collaborators see?</h2>
      <p class="lede">You're about to merge someone else's changes. This name marks your edits in the shared history — it stays on this computer, and you can change it any time.</p>
    </header>
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} placeholder="e.g. Micah Alex" autocomplete="off" autofocus />
      <div class="actions">
        <button type="button" class="ghost" onclick={onskip}>Skip — stay Anonymous</button>
        <button type="submit" class="primary" disabled={name.trim() === ""}>Save name</button>
      </div>
    </form>
  </div>
{/if}

<style>
  /* Soft Static dialog — warm paper floating over a hazy warm scrim (no navy, no pixel edges). */
  .scrim { position: fixed; inset: 0; background: rgba(59, 49, 56, 0.55); z-index: 40; }
  .dialog {
    position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(30rem, calc(100vw - var(--space-8))); box-sizing: border-box;
    background: var(--surface-canvas-raised); color: var(--ink-paper-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lift-mid);
    padding: var(--space-6);
  }
  header { margin-bottom: var(--space-5); }
  /* .eyebrow is the global quiet tracked-mono label — found, not announced */
  h2 { font-family: var(--font-display); font-size: 1.6rem; font-weight: 400; line-height: 1.18; margin: var(--space-1) 0 var(--space-2); color: var(--ink-paper-primary); }
  .lede { font-family: var(--font-body); font-size: 1.0625rem; line-height: 1.6; color: var(--ink-paper-secondary); margin: 0; }

  form { display: flex; flex-direction: column; gap: var(--space-4); }
  input {
    font-family: var(--font-body); font-size: 1.1rem; padding: var(--space-3) var(--space-3);
    background: var(--surface-canvas); color: var(--ink-paper-primary);
    border: 1px solid var(--border-canvas-emphasis); border-radius: var(--radius-sm);
  }
  input:focus { outline: none; border-color: var(--accent); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-3); align-items: center; }
  button { font-family: var(--font-ui); font-size: 0.8125rem; font-weight: 500; padding: var(--space-2) var(--space-4); border-radius: var(--radius-sm); cursor: pointer; transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease; }
  /* Secondary/ghost — quiet warm paper button, soft border, ink text */
  .ghost { background: var(--surface-paper-card); color: var(--ink-paper-secondary); border: 1px solid var(--border-canvas-emphasis); font-family: var(--font-ui); letter-spacing: 0.02em; }
  .ghost:hover { background: var(--surface-paper-hover); color: var(--ink-paper-primary); border-color: var(--border-canvas-emphasis); }
  /* Primary CTA — the single rationed signal: warm orange, soft glow, no hard edge */
  .primary { background: var(--accent); color: var(--ink-on-accent); border: 1px solid var(--accent); font-family: var(--font-ui); font-weight: 600; letter-spacing: 0.02em; box-shadow: var(--shadow-signal-glow); }
  .primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
  .primary:disabled { background: var(--accent-muted); color: var(--ink-paper-muted); border-color: transparent; cursor: default; box-shadow: none; }
</style>
