<script lang="ts">
  // Reading sheet — a clicked "expand" lifts a long note (or section) into a large centred surface
  // over a dimmed backdrop, for distraction-free reading. Reuses NoteLightbox's scrim language (same
  // warm dim + blur + Esc/backdrop close), but is TEXT-focused: warm paper, generous measure, scrolls.
  // The prose renders through ProseCites so intra-Library cites stay live inside the sheet.
  import ProseCites from "./ProseCites.svelte";

  let { text = "", label = "Note", onclose }: { text?: string; label?: string; onclose: () => void } = $props();

  function onkey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onclose(); }
  }
</script>

<svelte:window onkeydown={onkey} />

<!-- Scrim + sheet as SIBLINGS (NoteLightbox pattern): clicks inside the sheet don't reach the scrim,
     so no stopPropagation; the scrim is a click-to-close backdrop and Esc closes via the window. -->
<div class="sheet-scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={label}>
  <button class="sheet-close" onclick={onclose} aria-label="Close reading sheet">×</button>
  <div class="sheet-body"><ProseCites {text} /></div>
</div>

<style>
  /* Same warm dim + blur as NoteLightbox (visual consistency) — the read stays the star. */
  .sheet-scrim { position: fixed; inset: 0; background: var(--scrim-dim); backdrop-filter: blur(3px); z-index: 60; }
  .sheet {
    position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(92vw, 680px); max-height: 86vh; box-sizing: border-box;
    display: flex; flex-direction: column;
    padding: var(--space-7, var(--space-6)) var(--space-7, var(--space-6)) var(--space-6);
    background: var(--surface-paper); color: var(--ink-paper-primary);
    border: none; border-radius: var(--radius-lg, var(--radius-md));
    box-shadow: var(--shadow-lift-mid);
  }
  .sheet-close {
    position: absolute; top: var(--space-3); right: var(--space-3);
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem; line-height: 1; cursor: pointer;
    background: none; border: none; color: var(--ink-paper-muted);
    border-radius: 999px; transition: color 160ms ease, background 160ms ease;
  }
  .sheet-close:hover { color: var(--accent); background: var(--surface-paper-hover); }
  .sheet-close:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 1px; }
  /* Generous reading measure; scrolls inside the sheet when the note runs long. */
  .sheet-body { overflow-y: auto; font-family: var(--font-body); font-size: 1.15rem; line-height: 1.7; color: var(--ink-paper-primary); }
  @media (prefers-reduced-motion: reduce) {
    .sheet-close { transition: none; }
  }
</style>
