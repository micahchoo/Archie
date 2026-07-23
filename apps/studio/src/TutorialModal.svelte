<script lang="ts">
/**
 * @surface dialog
 * @composes standalone
 * @variants {open}
 * @constraint {dialog: single-scrim invariant}
 */
  // Onboarding tutorial — embeds the docs/learn slide decks (synced to public/learn) in an
  // iframe. The decks own their own slide nav + cross-step flow; this is just the framed shell.
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();
  // Scrimmed surface via the shared helper (Archie-5968): drops the private svelte:window Esc handler —
  // Esc now arrives through App's global keydown → modality.handleEsc, with scrim-click + focus trap/return.
  import { scrimmed, trapFocus, modality } from "./modality.svelte";

  // public/learn is served under the app's base ( /studio/ in build, configured base in dev ).
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  const src = `${base}learn/0001-the-archie-journey.html`;
</script>

{#if open}
  <div class="scrim" role="presentation" onclick={() => modality.dismiss()}>
    <div class="panel" role="dialog" aria-modal="true" aria-label="Archie tutorial" tabindex="-1"
      use:scrimmed={{ onClose: onclose }} onkeydown={trapFocus} onclick={(e) => e.stopPropagation()}>
      <header>
        <h2>Tutorial</h2>
        <button class="close" onclick={onclose} aria-label="Close tutorial">✕</button>
      </header>
      <iframe class="frame" src={src} title="Archie onboarding tutorial"></iframe>
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 110;
    display: flex; align-items: center; justify-content: center; padding: var(--space-5);
    background: var(--scrim-dim, rgba(26, 60, 35, 0.82));
  }
  .panel {
    width: min(64rem, 100%); height: min(46rem, 92vh);
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--surface-canvas-raised);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-lift-mid);
  }
  header {
    display: flex; align-items: center; justify-content: space-between; flex: none;
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-canvas, rgba(26, 60, 35, 0.12));
  }
  header h2 {
    margin: 0; font-family: var(--font-display); font-size: 1.3rem; font-weight: 400;
    color: var(--ink-paper-primary);
  }
  .close {
    cursor: pointer; background: none; border: none; font-size: 1rem;
    color: var(--ink-paper-muted); padding: 0 var(--space-1); border-radius: var(--radius-sm);
    transition: color 160ms ease;
  }
  .close:hover { color: var(--ink-paper-primary); }
  .frame { flex: 1 1 auto; width: 100%; border: 0; display: block; }
</style>
