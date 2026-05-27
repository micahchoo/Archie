<script lang="ts">
  // A note's media as sized-down clickable tiles (CONTEXT §"Local view loop"): image thumbnail,
  // video poster, audio waveform — all open the lightbox. Used in Reader's detail + NarrativeReader's
  // popup so every kind appears "the same way".
  import type { NoteMediaItem } from "@render/core";

  let { media = [], onopen }: { media: NoteMediaItem[]; onopen: (index: number) => void } = $props();

  // Deterministic waveform bar heights (the av-cover motif) — decoration, not a real decode.
  const bars = Array.from({ length: 11 }, (_, b) => 28 + ((b * 53) % 64));

  // Broken-media fallback (empty/error gate): track which tiles failed to load so a missing image/video
  // shows a quiet placeholder instead of the browser's broken-image glyph.
  let failed = $state(new Set<number>());
  function markFailed(i: number) { failed.add(i); failed = new Set(failed); }
</script>

{#if media.length}
  <div class="strip">
    {#each media as m, i (m.url + i)}
      <button class="tile {m.kind}" onclick={() => onopen(i)} aria-label={`Open ${m.kind}`}>
        {#if failed.has(i)}
          <span class="tile-failed">couldn’t load</span>
        {:else if m.kind === "image"}
          <img src={m.url} alt="" loading="lazy" onerror={() => markFailed(i)} />
        {:else if m.kind === "video"}
          <!-- preload metadata → shows the first frame as a poster; muted, no controls (a thumbnail). -->
          <video src={m.url} muted preload="metadata" tabindex="-1" onerror={() => markFailed(i)}></video>
          <span class="badge">▶</span>
        {:else}
          <span class="wave" aria-hidden="true">{#each bars as h}<span style={`height:${h}%`}></span>{/each}</span>
          <span class="badge">♪</span>
        {/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .strip { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-3); }
  .tile {
    position: relative; cursor: zoom-in; padding: 0; overflow: hidden;
    width: 132px; height: 92px; border-radius: var(--radius-sm);
    background: var(--surface-canvas); border: 1px solid var(--border-paper);
    transition: border-color 120ms ease, transform 120ms ease;
  }
  .tile:hover { border-color: var(--accent); transform: translateY(-1px); }
  .tile img, .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* Broken-media fallback: a quiet label instead of the browser's broken-image glyph. */
  .tile-failed { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-family: var(--font-ui); font-size: var(--text-ui-xs); color: var(--ink-canvas-muted); font-style: italic; }

  /* Audio waveform motif — forest-green bars on the dark light-table (matches the av-cover SVG). */
  .tile.audio { display: flex; align-items: center; justify-content: center; }
  .wave { display: flex; align-items: center; gap: 3px; height: 46px; }
  .wave span { width: 3px; border-radius: 2px; background: var(--accent); display: block; }

  .badge {
    position: absolute; bottom: 5px; right: 6px;
    font-size: 0.72rem; line-height: 1; padding: 3px 6px; border-radius: var(--radius-sm);
    background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary);
    border: 1px solid var(--border-canvas-emphasis);
  }
</style>
