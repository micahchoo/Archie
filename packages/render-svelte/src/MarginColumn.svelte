<script lang="ts">
  // MarginColumn (MARGINALIA-PLAN cut D/F shared shell — worklist 2.1). Notes as MARGINALIA: each
  // card positions itself beside its region's vertical position in the current viewport and
  // reflows as the canvas pans/zooms. The LOGIC is core's layoutMarginalia (headless-tested);
  // this component only measures (column box, card heights), projects the solved tops, and draws
  // the hover leader. Card CONTENT is the host's snippet — Studio passes an editing card, the
  // Viewer a read-only preview. Degrades to a plain list when the column is too short or the
  // note count too high (the solver result is simply unused — nothing breaks).
  import { layoutMarginalia } from "@render/core";
  import type { Snippet } from "svelte";

  type Rect = { left: number; top: number; right: number; bottom: number };
  let {
    items,
    rects,
    selected = null,
    gap = 10,
    maxCards = 40,
    card,
    onselect,
  }: {
    /** The notes to lay out, in list order (ids must match `rects` keys). */
    items: { id: string }[];
    /** Marker screen rects in PAGE coords (Canvas `onmarkerrects` stream). Null = unresolvable. */
    rects: Record<string, Rect | null>;
    /** The focused card (Studio: the note being edited; Viewer: the selected note). */
    selected?: string | null;
    gap?: number;
    /** Above this count the margin degrades to a plain list (layout cost + legibility). */
    maxCards?: number;
    /** Card content: (id, focused) — the host owns what a card IS. */
    card: Snippet<[string, boolean]>;
    onselect?: (id: string) => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);
  let heights = $state<Record<string, number>>({});
  const FALLBACK_H = 56; // pre-measurement estimate; converges after the card's first paint

  // Solve on every rect frame. The column box is re-read per pass (scroll/resize ride along with
  // the rect stream — the canvas emits on every viewport change, which covers the margin too).
  const layout = $derived.by(() => {
    void rects; // dep: re-solve on each marker frame
    // (heights tracked implicitly: heights[id] is read directly in the items.map below)
    const box = el?.getBoundingClientRect();
    if (!box || box.height < 200 || items.length === 0 || items.length > maxCards) return null;
    return {
      box,
      ...layoutMarginalia(
        items.map(({ id }) => {
          const r = rects[id];
          return { id, anchorY: r ? (r.top + r.bottom) / 2 - box.top : NaN, height: heights[id] ?? FALLBACK_H };
        }),
        // The focused card is PINNED — its open editor must never evict itself (solver guarantee).
        { viewportH: box.height, gap, ...(selected != null ? { pinId: selected } : {}) },
      ),
    };
  });
  const topOf = $derived(layout ? Object.fromEntries(layout.placed.map((p) => [p.id, p.top])) : {});

  let hovered = $state<string | null>(null);
  // Hairline leader: from the column's canvas edge at the mark's height to the attended card.
  const leader = $derived.by(() => {
    const id = hovered ?? selected;
    if (!layout || !id || !(id in topOf)) return null;
    const r = rects[id];
    if (!r) return null;
    const anchorY = (r.top + r.bottom) / 2 - layout.box.top;
    return { anchorY, cardY: topOf[id]! + Math.min(heights[id] ?? FALLBACK_H, 40) / 2 };
  });
</script>

<div class="margin-column" bind:this={el}>
  {#if layout}
    {#if leader}
      <svg class="leader" aria-hidden="true"><line x1="0" y1={leader.anchorY} x2="14" y2={leader.cardY} /></svg>
    {/if}
    {#if layout.above.length > 0}
      <button type="button" class="gutter up" onclick={() => onselect?.(layout.above[layout.above.length - 1]!)}>
        <span aria-hidden="true">↑</span> {layout.above.length} above
      </button>
    {/if}
    <div class="cards" role="list">
      {#each layout.placed as p (p.id)}
        <div
          class="margin-card"
          role="listitem"
          data-id={p.id}
          class:focused={selected === p.id}
          style={`top:${p.top}px`}
          bind:clientHeight={heights[p.id]}
          onpointerenter={() => (hovered = p.id)}
          onpointerleave={() => (hovered = null)}
        >
          {@render card(p.id, selected === p.id)}
        </div>
      {/each}
    </div>
    {#if layout.below.length > 0}
      <button type="button" class="gutter down" onclick={() => onselect?.(layout.below[0]!)}>
        <span aria-hidden="true">↓</span> {layout.below.length} below
      </button>
    {/if}
  {:else}
    <!-- Degrade: short column / too many notes / no rects yet → today's plain list. -->
    <ul class="margin-list">
      {#each items as it (it.id)}
        <li class:focused={selected === it.id}>{@render card(it.id, selected === it.id)}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .margin-column { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  .margin-card { position: absolute; left: 16px; right: 0; transition: top 120ms ease-out; }
  .margin-card.focused { z-index: 2; }
  .leader { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
  /* Hairline leader: a warm cord-blue connector from the mark to the attended card (a quiet line,
     not the rationed signal-orange — that stays reserved for the one focal action). */
  .leader line { stroke: var(--accent-2); stroke-width: 1.5; opacity: 0.5; }
  /* "N more ↑/↓" gutter affordances → quiet Spline-mono soft buttons (secondary treatment): warm
     paper, soft border, ink text, rounded. Not orange — these are not the focal action. */
  .gutter {
    position: absolute; left: 16px; right: 0; z-index: 3;
    font-family: var(--font-ui); font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
    padding: 4px 10px; cursor: pointer;
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    color: var(--ink-canvas-secondary);
    box-shadow: var(--shadow-lift-low);
    transition: background 160ms ease, color 160ms ease;
  }
  .gutter:hover { background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); }
  .gutter.up { top: 0; }
  .gutter.down { bottom: 0; }
  .margin-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; max-height: 100%; }
  @media (prefers-reduced-motion: reduce) { .margin-card { transition: none; } }
</style>
