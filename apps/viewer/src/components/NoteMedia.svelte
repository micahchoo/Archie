<script lang="ts">
  // A note's media as sized-down clickable tiles (CONTEXT §"Local view loop"): image thumbnail,
  // video poster, audio waveform — all open the lightbox. Used in Reader's detail + NarrativeReader's
  // popup so every kind appears "the same way".
  import type { NoteMediaItem } from "@render/core";

  let { media = [], onopen }: { media: NoteMediaItem[]; onopen: (index: number) => void } = $props();

  // Deterministic waveform bar heights (the av-cover motif) — decoration, not a real decode.
  const bars = Array.from({ length: 11 }, (_, b) => 28 + ((b * 53) % 64));

  // Broken-media fallback (empty/error gate): track which tiles failed to load so a missing image/video
  // shows a quiet placeholder instead of the browser's broken-image glyph. Keyed by URL, NOT index — this
  // component instance is REUSED across notes (the popup is an un-keyed {#if}), so an index-keyed set would
  // bleed a failed tile onto the next note's same-index (healthy) tile. URLs are per-note (blob: in portable).
  let failed = $state(new Set<string>());
  function markFailed(url: string) { failed.add(url); failed = new Set(failed); }
</script>

{#if media.length}
  <div class="strip">
    {#each media as m, i (m.url + i)}
      <!-- The author's description IS the tile's name when there is one (V66/V67). Without it every tile
           in a note announced identically ("Open image, button"), so a reader with several could not tell
           them apart. The kind still leads, because the control's job is to open a thing of that kind. -->
      <button class="tile {m.kind}" onclick={() => onopen(i)}
              aria-label={m.alt ? `Open ${m.kind}: ${m.alt}` : `Open ${m.kind}`}>
        {#if failed.has(m.url)}
          <span class="tile-failed">Couldn’t load</span>
        {:else if m.kind === "image"}
          <!-- alt="" is correct HERE and only here: the button above already carries the name, so labelling
               the child too would make AT announce the same text twice. -->
          <img src={m.url} alt="" loading="lazy" onerror={() => markFailed(m.url)} />
        {:else if m.kind === "video"}
          <!-- preload metadata → shows the first frame as a poster; muted, no controls (a thumbnail). -->
          <video src={m.url} muted preload="metadata" tabindex="-1" onerror={() => markFailed(m.url)}></video>
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
    background: var(--surface-canvas-raised); border: none;
    transition: transform 160ms ease;
  }
  /* No lift: the tile sits IN the note's flow. Raised fill at rest, 2px rise on hover — both
     already here. (Archie-1244 / 5c1d Option C) */
  .tile:hover { transform: translateY(-2px); }
  .tile img, .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* Broken-media fallback: a quiet label instead of the browser's broken-image glyph. */
  .tile-failed { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-family: var(--font-ui); font-size: var(--text-ui-xs); letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-canvas-muted); }

  /* Audio waveform motif — soft warm-line bars on warm paper (the av-cover motif). */
  .tile.audio { display: flex; align-items: center; justify-content: center; }
  .wave { display: flex; align-items: center; gap: 3px; height: 46px; }
  .wave span { width: 3px; border-radius: var(--radius-sm); background: var(--accent-3); display: block; }

  .badge {
    position: absolute; bottom: 6px; right: 7px;
    font-family: var(--font-ui, monospace); font-size: 0.72rem; line-height: 1; padding: 3px 7px; border-radius: var(--radius-sm);
    background: var(--surface-canvas-raised); color: var(--ink-canvas-secondary);
    /* KEPT (Archie-1244): this badge is absolutely positioned OVER image pixels it cannot
       predict, so its solid fill can coincide with the photo's own tones. Same category as
       App.svelte's sticky .rail-pos and ExhibitOverview's .selection-tray — the lift survives
       where a surface sits over content it does not control, not merely because it is a card. */
    box-shadow: var(--shadow-lift-low);
  }
</style>
