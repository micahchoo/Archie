<script lang="ts">
  // Marginalia rail — direction B, collapsed tick rail (Archie-dff3, superseding direction C's
  // density clusters per user verdict). A near-invisible spatial index of this object's notes,
  // sitting BESIDE the canvas (a layout column, never floating over the artefact — standing rule
  // Archie-a9fc). It reuses the surviving engine: the Canvas `onmarkerrects` stream gives each
  // note's on-screen region rect; `@render/core` `layoutMarginalia` places one tick per note without
  // overlap (nudging close anchors apart by a min gap) and buckets off-screen notes into ▲/▼ edge
  // counts. Prototype: prototypes/marginalia-presentation/b-tick-rail.html + its README's case for B
  // — "the smallest possible departure that removes exactly [the always-on floating card column]:
  // the margin becomes marks, the canvas stays the hero."
  //
  // NO in-rail card and NO note text anywhere (deviation from the pure prototype, per the earlier
  // user-verdict strip on direction C): reading a note is the INSPECTOR's job. The rail is WHERE +
  // HOW MUCH only — a tick per note, coloured by its reading; click/hover drive the SAME
  // selected/hoverNote channels the inspector list and canvas marks use, so the rail never becomes a
  // second edit surface.
  //
  // Tick width is UNIFORM, not encoded from the marker rect's on-screen extent. The prototype encodes
  // width from note-TEXT length (a stable, zoom-independent metric) — with no text left to measure,
  // the only candidate replacement is the marker rect's screen-space size, which is POST-ZOOM/PAN and
  // recomputed on every `onmarkerrects` frame: a width driven by it would resize on every pan/zoom,
  // which is the opposite of "near-invisible until touched." Kept uniform; revisit only with a
  // zoom-invariant extent (e.g. the selector's own image-space size, not plumbed into this component).
  //
  // Disclosure: ticks-only at EVERY density (the direction-C density gate is gone) — a near-invisible
  // rail is the whole bet, not a crowded-only mode. Fixed ~34px width; it never resizes on hover
  // (nothing to reveal — the ticks are already the whole rail).
  import { layoutMarginalia } from "@render/core";

  type Rect = { left: number; top: number; right: number; bottom: number };
  let {
    items,
    rects,
    selected = null,
    onselect,
    onhover,
  }: {
    /** The visible notes, in list order (ids match `rects` keys). `colour` is the note's reading
     *  colour (hex) — the rail shows WHERE notes sit and HOW MANY, never note text (the inspector
     *  owns reading the note). */
    items: { id: string; colour: string }[];
    /** Marker screen rects in PAGE coords (Canvas `onmarkerrects` stream). Null = unresolvable. */
    rects: Record<string, Rect | null>;
    /** The focused note (drives which tick is pinned + fattened). */
    selected?: string | null;
    /** Selecting a tick selects the note — the SAME channel a canvas-marker click uses. */
    onselect?: (id: string) => void;
    /** Hovering a tick solos the note's mark on the canvas (null clears). */
    onhover?: (id: string | null) => void;
  } = $props();

  const GAP = 8; // min separation between tick anchors, px — matches the prototype's MINGAP

  let el = $state<HTMLElement | null>(null);

  const colourOf = $derived(Object.fromEntries(items.map((i) => [i.id, i.colour] as const)));

  // Place one tick per note. Ticks are treated as zero-height POINTS for the solver (height: 0) —
  // `layoutMarginalia`'s gap gives exactly the prototype's "nudge apart by a min-gap" behaviour, and
  // its capacity check buckets whatever truly can't fit into the below gutter instead of silently
  // overflowing the rail's bottom edge (an improvement over the prototype's naive point-pusher, which
  // has no such floor). The selected note's tick is PINNED so it always stays reachable, even when its
  // region is off-screen.
  const model = $derived.by(() => {
    void rects; // dep: re-solve on each marker frame
    const box = el?.getBoundingClientRect();
    if (!box || items.length === 0) return null;
    const anchor = (id: string) => {
      const r = rects[id];
      return r ? (r.top + r.bottom) / 2 - box.top : NaN;
    };
    const entries = items.map((i) => ({ id: i.id, anchorY: anchor(i.id), height: 0 }));
    const layout = layoutMarginalia(entries, {
      viewportH: box.height,
      gap: GAP,
      ...(selected ? { pinId: selected } : {}),
    });
    return {
      topOf: Object.fromEntries(layout.placed.map((p) => [p.id, p.top] as const)),
      above: layout.above,
      below: layout.below,
    };
  });
</script>

<div
  class="marginalia-rail"
  role="group"
  aria-label="Notes by region — tick rail"
  bind:this={el}
  onpointerleave={() => onhover?.(null)}
>
  {#if model}
    {#if model.above.length > 0}
      <button type="button" class="bucket up" onclick={() => onselect?.(model.above[model.above.length - 1]!)}>
        <span aria-hidden="true">▲</span>{model.above.length}
      </button>
    {/if}
    <div class="ticks" role="list">
      {#each items as it, i (it.id)}
        {#if it.id in model.topOf}
          <button
            type="button"
            class="tick"
            class:sel={selected === it.id}
            style={`top:${model.topOf[it.id]}px;background:${colourOf[it.id]}`}
            aria-label={`Note ${i + 1} of ${items.length}`}
            onclick={() => onselect?.(it.id)}
            onpointerenter={() => onhover?.(it.id)}
          ></button>
        {/if}
      {/each}
    </div>
    {#if model.below.length > 0}
      <button type="button" class="bucket down" onclick={() => onselect?.(model.below[0]!)}>
        <span aria-hidden="true">▼</span>{model.below.length}
      </button>
    {/if}
  {/if}
</div>

<style>
  /* A layout column beside the canvas (never an overlay) — FIXED width, never resizes: ticks are the
     whole rail at every density, so there is nothing to reveal on hover. */
  .marginalia-rail {
    position: relative;
    flex: 0 0 34px;
    width: 34px;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-canvas);
    border-left: 1px solid var(--border-canvas);
  }

  .ticks { position: absolute; inset: 0; }
  /* One mark per note, coloured by its reading; a note's vertical position on the rail = its
     region's position on the image. Faint until selected — near-invisible is the point. */
  .tick {
    position: absolute; left: 8px; z-index: 2;
    width: 14px; height: 2px; border-radius: 1px;
    padding: 0; margin: 0; border: none; cursor: pointer;
    opacity: 0.45;
    transition: opacity 120ms ease, height 120ms ease, width 120ms ease, left 120ms ease, top 120ms ease-out, box-shadow 140ms ease;
  }
  .tick:hover { opacity: 0.85; }
  /* Selected: fattens + colors — full-strength opacity, thicker, and a ring so it reads at a glance
     even among several same-coloured ticks. */
  .tick.sel {
    left: 6px; width: 20px; height: 4px; opacity: 1;
    box-shadow: 0 0 0 1px var(--accent);
  }

  .bucket {
    position: absolute; left: 3px; right: 3px; z-index: 3;
    display: flex; align-items: center; justify-content: center; gap: 2px;
    font-family: var(--font-ui); font-size: 0.64rem; font-weight: 600;
    padding: 3px 0; cursor: pointer; text-align: center;
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    color: var(--ink-canvas-secondary); box-shadow: var(--shadow-lift-low);
  }
  .bucket:hover { background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); }
  .bucket.up { top: 4px; }
  .bucket.down { bottom: 4px; }

  @media (prefers-reduced-motion: reduce) {
    .tick { transition: none; }
  }
</style>
