<script lang="ts">
  // Note lightbox (CONTEXT §"Local view loop") — a clicked note tile opens here: a modal carousel of
  // ALL the note's media (image / audio / video) with the note's text beside them. ← → / Esc navigate;
  // backdrop or × close. Audio/video play natively (consistent with MediaPlayer).
  import ProseCites from "./ProseCites.svelte";
  import { dialog } from "../lib/dialog-a11y.js";
  import type { NoteMediaItem } from "@render/core";

  let {
    media = [],
    text = "",
    index = 0,
    onclose,
  }: {
    media: NoteMediaItem[];
    text?: string;
    index?: number;
    onclose: () => void;
  } = $props();

  let i = $state(index);
  const many = $derived(media.length > 1);
  const cur = $derived(media[i]);
  function prev() { if (media.length) i = (i - 1 + media.length) % media.length; }
  function next() { if (media.length) i = (i + 1) % media.length; }
  // Arrow-stepping stays on the window (it's a carousel-wide accelerator); ESC + focus-trap + return-focus
  // are owned by the `use:dialog` action below (Q-5), so ESC is NOT bound here (no double-close).
  function onkey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="lb-scrim" role="presentation" onclick={onclose}></div>
<!-- Dialog a11y (Q-5): `use:dialog` traps Tab inside the lightbox, focuses the close button on open,
     binds ESC, and returns focus to the trigger (the tile that opened it) on close. -->
<div class="lb" role="dialog" aria-modal="true" aria-label="Note" use:dialog={{ onclose }}>
  <button class="lb-close" onclick={onclose} aria-label="Close">×</button>

  {#if cur}
    <div class="lb-stage">
      {#if many}<button class="nav prev" onclick={prev} aria-label="Previous">‹</button>{/if}

      {#if cur.kind === "image"}
        <img src={cur.url} alt="" />
      {:else if cur.kind === "video"}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={cur.url} controls autoplay></video>
      {:else}
        <div class="audio-stage">
          <span class="now">Audio</span>
          <audio src={cur.url} controls autoplay></audio>
        </div>
      {/if}

      {#if many}<button class="nav next" onclick={next} aria-label="Next">›</button>{/if}
      {#if many}<span class="counter">{i + 1} / {media.length}</span>{/if}
    </div>
  {/if}

  {#if text}
    <div class="lb-text"><ProseCites {text} /></div>
  {/if}
</div>

<style>
  .lb-scrim { position: fixed; inset: 0; background: var(--scrim-dim); backdrop-filter: blur(3px); z-index: 60; }
  .lb {
    position: fixed; z-index: 61; top: 50%; left: 50%; transform: translate(-50%, -50%);
    display: flex; flex-direction: column; gap: var(--space-4);
    width: min(92vw, 1100px); max-height: 92vh; box-sizing: border-box; padding: var(--space-4);
  }
  .lb-close {
    position: absolute; top: -2px; right: -2px; z-index: 62;
    background: none; border: none; cursor: pointer; color: var(--ink-canvas-secondary);
    font-family: var(--font-ui, monospace); font-size: 2rem; line-height: 1;
  }
  .lb-close:hover { color: var(--ink-canvas-primary); }

  .lb-stage { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; flex: 1; }
  .lb-stage img, .lb-stage video { max-width: 100%; max-height: 72vh; object-fit: contain; border-radius: var(--radius-md); background: var(--surface-canvas-raised); box-shadow: var(--shadow-lift-mid); }

  .audio-stage { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); width: min(40rem, 80vw); }
  .audio-stage .now { font-family: var(--font-ui, monospace); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-canvas-secondary); opacity: 0.6; }
  .audio-stage audio { width: 100%; }

  .nav {
    position: absolute; top: 50%; transform: translateY(-50%); z-index: 62;
    width: 44px; height: 44px; border-radius: 50%; cursor: pointer;
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    border: 1px solid var(--border-canvas);
    font-family: var(--font-ui, monospace); font-size: 1.5rem; line-height: 1;
    box-shadow: var(--shadow-lift-low);
    transition: color 160ms ease, box-shadow 160ms ease;
  }
  .nav:hover { color: var(--ink-canvas-primary); box-shadow: var(--shadow-lift-mid); }
  .nav.prev { left: var(--space-3); }
  .nav.next { right: var(--space-3); }
  .counter {
    position: absolute; bottom: var(--space-3); left: 50%; transform: translateX(-50%);
    font-family: var(--font-mono, monospace); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-canvas-secondary); opacity: 0.62;
    background: var(--surface-canvas-raised); padding: 3px 12px; border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lift-low);
  }

  .lb-text {
    flex-shrink: 0; max-height: 24vh; overflow: auto;
    font-family: var(--font-body, serif); font-size: 1.0625rem; line-height: 1.65; color: var(--ink-canvas-primary);
    background: var(--surface-canvas-raised); border-left: 3px solid var(--accent);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lift-low); padding: var(--space-3) var(--space-4);
  }
  .lb-text :global(p) { margin: 0 0 var(--space-2); }
  .lb-text :global(p:last-child) { margin-bottom: 0; }
  .lb-text :global(a) { color: var(--accent-2); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.15em; cursor: pointer; }
  .lb-text :global(a[href*="#/"]:not(.cite-card))::after { content: "¶" / ""; margin-left: 0.15em; font-size: 0.7em; vertical-align: 0.35em; opacity: 0.6; text-decoration: none; }
  .lb-text :global(strong) { font-weight: 700; }
  .lb-text :global(em) { font-style: italic; }
</style>
