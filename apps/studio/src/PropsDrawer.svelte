<script lang="ts">
  // A right-side slide-in panel for transient editing where there's no sidebar to spend — the Library
  // (LibraryHome) and Exhibit (ExhibitOverview) rights surfaces (rights grill Q6, the "header-button →
  // drawer" pattern). Paper-surfaced so it hosts the RightsEditor's paper-toned fields. Scrim-dismiss.
  import type { Snippet } from "svelte";
  let { open, title, onclose, children }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();
</script>

{#if open}
  <div class="scrim" onclick={onclose} role="presentation"></div>
  <div class="drawer" role="dialog" aria-label={title} aria-modal="true">
    <header>
      <h2>{title}</h2>
      <button class="x" onclick={onclose} aria-label="Close">×</button>
    </header>
    <div class="body">{@render children()}</div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgba(20, 18, 14, 0.32); }
  .drawer {
    position: fixed; z-index: 41; top: 0; right: 0; height: 100vh; width: min(380px, 92vw);
    display: flex; flex-direction: column;
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border-left: 1px solid var(--border-paper-emphasis); box-shadow: -8px 0 24px rgba(20, 18, 14, 0.18);
    animation: slide-in 0.18s ease;
  }
  @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .drawer > header {
    display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
    padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-paper);
  }
  .drawer > header h2 {
    margin: 0; font-family: var(--font-display), serif; font-size: 1.1rem; font-weight: 600; color: var(--ink-paper-primary);
  }
  .x {
    border: none; background: transparent; cursor: pointer; font-size: 1.3rem; line-height: 1;
    color: var(--ink-paper-secondary); padding: 0 var(--space-1);
  }
  .x:hover { color: var(--accent); }
  .body { padding: var(--space-5); overflow-y: auto; }
</style>
