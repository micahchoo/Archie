<script lang="ts">
  // Marginalia rail — direction C, density clusters (Archie-dff3). A near-invisible spatial index of
  // this object's notes, sitting BESIDE the canvas (a layout column, never floating over the artefact
  // — standing rule Archie-a9fc). It reuses the surviving engine: the Canvas `onmarkerrects` stream
  // gives each note's on-screen region rect; `clusterMarginalia` merges near notes into counted chips;
  // `@render/core` `layoutMarginalia` places those chips without overlap (and buckets the overflow into
  // ↑/↓ gutters, same as the reverted card column did). What direction C adds over the flat inspector
  // list is spatial correspondence (a chip beside its region) + a density signal (the heat band).
  //
  // Disclosure / degradation (the ticket's governing constraint — "as non-invasive as possible"):
  //   • no notes            → the rail is not rendered at all (the host gates on items.length).
  //   • sparse (< 4 notes)  → NEAR-INVISIBLE: a thin rail of faint ticks, no heat band, no chip chrome
  //                           ("no cluster chrome for 2 notes"). Pointer intent (hover / keyboard focus)
  //                           widens it and reveals the chips — nothing until you reach for it.
  //   • dense (≥ 4 notes)   → the crowded case C is built for: quiet counted chips + a faint heat band,
  //                           always placed beside their regions. Still minimum visual weight (paper
  //                           chips, rationed accent), the image stays the hero.
  import { layoutMarginalia } from "@render/core";
  import { clusterMarginalia, marginaliaDensity, heatOpacity } from "./marginalia-clusters.js";

  type Rect = { left: number; top: number; right: number; bottom: number };
  let {
    items,
    rects,
    selected = null,
    onselect,
    onhover,
  }: {
    /** The visible notes, in list order (ids match `rects` keys). `lead` is the chip's first line. */
    items: { id: string; lead: string }[];
    /** Marker screen rects in PAGE coords (Canvas `onmarkerrects` stream). Null = unresolvable. */
    rects: Record<string, Rect | null>;
    /** The focused note (drives which chip/cluster is pinned + ringed). */
    selected?: string | null;
    /** Selecting a chip/row selects the note — the SAME channel a canvas-marker click uses. */
    onselect?: (id: string) => void;
    /** Hovering a chip solos the note's mark on the canvas (null clears). */
    onhover?: (id: string | null) => void;
  } = $props();

  const CHIP_H = 46; // compact chip height estimate (count badge + 2-line lead clamp)
  const ROW_H = 30; // a stack row inside an expanded multi-note cluster
  const GAP = 8;

  let el = $state<HTMLElement | null>(null);
  let openCluster = $state<string | null>(null); // the expanded multi-note stack
  let revealed = $state(false); // sparse-mode pointer-intent disclosure

  const density = $derived(marginaliaDensity(items.length));
  const leadOf = $derived(Object.fromEntries(items.map((i) => [i.id, i.lead] as const)));

  // Cluster + place on every rect frame. The rail box is re-read each pass so scroll/pan/zoom ride
  // along with the rect stream (the canvas emits on every viewport change).
  const model = $derived.by(() => {
    void rects; // dep: re-solve on each marker frame
    const box = el?.getBoundingClientRect();
    if (!box || items.length === 0) return null;
    const anchor = (id: string) => {
      const r = rects[id];
      return r ? (r.top + r.bottom) / 2 - box.top : NaN;
    };
    const clusters = clusterMarginalia(
      items.map((i) => ({ id: i.id, anchorY: anchor(i.id) })),
      CHIP_H + GAP,
    );
    // Place the chips without overlap — reusing the ported solver. The cluster holding the selection
    // is PINNED (its expanded stack must never evict itself); the rest solve into the bands around it.
    const selCluster = selected ? clusters.find((c) => c.ids.includes(selected)) : undefined;
    const heightOf = (c: (typeof clusters)[number]) =>
      openCluster === c.id && c.ids.length > 1 ? CHIP_H + c.ids.length * ROW_H : CHIP_H;
    const layout = layoutMarginalia(
      clusters.map((c) => ({ id: c.id, anchorY: c.anchorY, height: heightOf(c) })),
      { viewportH: box.height, gap: GAP, ...(selCluster ? { pinId: selCluster.id } : {}) },
    );
    return {
      clusters,
      byId: new Map(clusters.map((c) => [c.id, c] as const)),
      topOf: Object.fromEntries(layout.placed.map((p) => [p.id, p.top] as const)),
      above: layout.above,
      below: layout.below,
    };
  });

  // The chips are shown when crowded, or on pointer intent in the sparse near-invisible state.
  const showChips = $derived(density === "dense" || revealed);

  function clickCluster(id: string) {
    const c = model?.byId.get(id);
    if (!c) return;
    if (c.ids.length === 1) onselect?.(c.ids[0]!);
    else openCluster = openCluster === id ? null : id;
  }
  // Selecting a note opens its containing cluster so the selected row is visible.
  $effect(() => {
    if (!selected || !model) return;
    const c = model.clusters.find((cl) => cl.ids.includes(selected));
    if (c && c.ids.length > 1) openCluster = c.id;
  });
</script>

<div
  class="marginalia-rail"
  class:dense={density === "dense"}
  class:revealed
  role="group"
  aria-label="Notes by region — density rail"
  bind:this={el}
  onpointerenter={() => (revealed = true)}
  onpointerleave={() => {
    revealed = false;
    onhover?.(null);
  }}
>
  {#if model}
    <!-- Heat band (dense only): where notes pile up, drawn on the rail's canvas-facing edge — a
         reading signal about the image, never a bar over it. -->
    {#if density === "dense"}
      <div class="heat-layer" aria-hidden="true">
        {#each model.clusters as c (c.id)}
          <div
            class="heat"
            class:sel={selected != null && c.ids.includes(selected)}
            style={`top:${c.top - 6}px;height:${c.bottom - c.top + 12}px;background:rgba(200,97,31,${heatOpacity(c.ids.length)})`}
          ></div>
        {/each}
      </div>
    {/if}

    {#if showChips}
      {#if model.above.length > 0}
        <button type="button" class="gutter up" onclick={() => onselect?.(model.above[model.above.length - 1]!)}>
          <span aria-hidden="true">↑</span> {model.above.length} more
        </button>
      {/if}
      <div class="chips" role="list">
        {#each model.clusters as c (c.id)}
          {#if c.id in model.topOf}
            {@const multi = c.ids.length > 1}
            {@const open = openCluster === c.id}
            {@const selHere = selected != null && c.ids.includes(selected)}
            <div
              class="cluster"
              class:sel={selHere}
              class:dim={openCluster != null && openCluster !== c.id && !selHere}
              role="listitem"
              style={`top:${model.topOf[c.id]}px`}
            >
              <button
                type="button"
                class="chip"
                aria-expanded={multi ? open : undefined}
                onclick={() => clickCluster(c.id)}
                onpointerenter={() => onhover?.(c.ids[0]!)}
              >
                <span class="count" class:one={!multi} aria-hidden="true">{c.ids.length}</span>
                <span class="lead">{leadOf[c.ids[0]!] ?? "(untitled)"}</span>
              </button>
              {#if multi && open}
                <div class="stack">
                  {#each c.ids as id (id)}
                    <button
                      type="button"
                      class="row"
                      class:sel={selected === id}
                      onclick={() => onselect?.(id)}
                      onpointerenter={() => onhover?.(id)}
                    >
                      {leadOf[id] ?? "(untitled)"}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
      {#if model.below.length > 0}
        <button type="button" class="gutter down" onclick={() => onselect?.(model.below[0]!)}>
          <span aria-hidden="true">↓</span> {model.below.length} more
        </button>
      {/if}
    {:else}
      <!-- Sparse, at rest: near-invisible ticks — one faint mark per note-cluster at its region's
           height. No heat band, no chip chrome. Reach for the rail (hover / focus) to reveal chips. -->
      <div class="ticks" aria-hidden="true">
        {#each model.clusters as c (c.id)}
          <div class="tick" class:sel={selected != null && c.ids.includes(selected)} style={`top:${c.anchorY}px`}></div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* A layout column beside the canvas (never an overlay). Sparse: a hair-thin ticks rail that widens
     on pointer intent. Dense: a quiet chip column. Width is the only thing that moves, and only on
     deliberate hover or the sparse→dense crossing — never per marker frame. */
  .marginalia-rail {
    position: relative;
    flex: 0 0 auto;
    width: 30px;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-canvas);
    border-left: 1px solid var(--border-canvas);
    transition: width 160ms ease;
  }
  .marginalia-rail.dense { width: 236px; }
  .marginalia-rail.revealed:not(.dense) { width: 224px; }

  .heat-layer { position: absolute; inset: 0; left: 0; width: 4px; pointer-events: none; }
  .heat { position: absolute; left: 0; width: 4px; border-radius: 2px; transition: background 160ms ease; }
  .heat.sel { box-shadow: 0 0 0 1px var(--accent); width: 5px; }

  .ticks { position: absolute; inset: 0; }
  /* Faint marks: a note's vertical position on the rail = its region's position on the image. */
  .tick {
    position: absolute; right: 8px; width: 14px; height: 2px; border-radius: 1px;
    background: var(--ink-canvas-secondary); opacity: 0.35;
  }
  .tick.sel { background: var(--accent); opacity: 0.9; width: 18px; }

  .chips { position: absolute; inset: 0; left: 10px; }
  .cluster {
    position: absolute; left: 8px; right: 8px;
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas);
    border-radius: var(--radius-sm); overflow: hidden;
    transition: top 120ms ease-out, opacity 140ms ease, border-color 140ms ease;
    box-shadow: var(--shadow-lift-low);
  }
  .cluster.dim { opacity: 0.42; }
  .cluster.sel { border-color: var(--accent); box-shadow: 0 2px 10px #0000001f; }

  .chip {
    display: flex; gap: 8px; align-items: flex-start; width: 100%;
    padding: 8px 10px; cursor: pointer; text-align: left;
    background: none; border: none; color: var(--ink-canvas-primary); font: inherit;
  }
  .count {
    flex: 0 0 auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: #fff; font-size: 0.72rem; font-weight: 600; line-height: 1;
  }
  /* A single-note "cluster" gets a quiet neutral dot, not the accent — the count only earns colour
     once it's aggregating more than one note (the crowded signal). */
  .count.one { background: var(--surface-canvas-overlay); color: var(--ink-canvas-secondary); }
  .lead {
    font-size: 0.8rem; line-height: 1.35; color: var(--ink-canvas-primary);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
  }

  .stack { border-top: 1px solid var(--border-canvas); }
  .row {
    display: block; width: 100%; text-align: left; cursor: pointer;
    padding: 7px 10px 7px 38px; border: none; border-bottom: 1px solid #0000000d;
    background: none; color: var(--ink-canvas-primary); font: inherit;
    font-size: 0.78rem; line-height: 1.35;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .row:last-child { border-bottom: none; }
  .row.sel { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .chip:hover, .row:hover { background: var(--surface-canvas-overlay); }

  .gutter {
    position: absolute; left: 8px; right: 8px; z-index: 3;
    font-family: var(--font-ui); font-size: 0.66rem; letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; cursor: pointer; text-align: center;
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: var(--radius-sm);
    color: var(--ink-canvas-secondary); box-shadow: var(--shadow-lift-low);
  }
  .gutter:hover { background: var(--surface-canvas-overlay); color: var(--ink-canvas-primary); }
  .gutter.up { top: 4px; }
  .gutter.down { bottom: 4px; }

  @media (prefers-reduced-motion: reduce) {
    .marginalia-rail, .cluster, .heat { transition: none; }
  }
</style>
