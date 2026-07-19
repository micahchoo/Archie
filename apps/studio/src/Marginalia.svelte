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
    /** The visible notes, in list order (ids match `rects` keys). `colour` is the note's reading
     *  colour (hex) — the rail shows WHERE notes sit and HOW MANY, never note text (the inspector
     *  owns reading the note; user-verdict strip, Archie-dff3). */
    items: { id: string; colour: string }[];
    /** Marker screen rects in PAGE coords (Canvas `onmarkerrects` stream). Null = unresolvable. */
    rects: Record<string, Rect | null>;
    /** The focused note (drives which chip/cluster is pinned + ringed). */
    selected?: string | null;
    /** Selecting a chip/dot selects the note — the SAME channel a canvas-marker click uses. */
    onselect?: (id: string) => void;
    /** Hovering a chip/dot solos the note's mark on the canvas (null clears). */
    onhover?: (id: string | null) => void;
  } = $props();

  const CHIP_H = 30; // closed-chip height: count badge + reading-dots row, one line
  const DOT_H = 20; // an individual note's dot button, laid out when its cluster is expanded
  const GAP = 8;

  let el = $state<HTMLElement | null>(null);
  let openCluster = $state<string | null>(null); // the expanded multi-note cluster
  let revealed = $state(false); // sparse-mode pointer-intent disclosure

  const density = $derived(marginaliaDensity(items.length));
  const colourOf = $derived(Object.fromEntries(items.map((i) => [i.id, i.colour] as const)));

  // The distinct reading colours present in a cluster, in first-seen (top-to-bottom) order — the
  // closed chip's dot row is a composition signal ("which readings pile up here"), not one dot per
  // note (that would just be a second count).
  function readingColoursOf(c: { ids: string[] }): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of c.ids) {
      const colour = colourOf[id];
      if (colour !== undefined && !seen.has(colour)) {
        seen.add(colour);
        out.push(colour);
      }
    }
    return out;
  }

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
    // Place the chips without overlap — reusing the ported solver. Every cluster contributes its
    // chip; an OPEN multi-note cluster additionally contributes one small dot per member, positioned
    // at the MEMBER'S OWN anchor — expanding reveals each note's real screen position instead of a
    // text stack (the chip stays put as the collapse control).
    const entries: { id: string; anchorY: number; height: number }[] = [];
    for (const c of clusters) {
      entries.push({ id: c.id, anchorY: c.anchorY, height: CHIP_H });
      if (openCluster === c.id && c.ids.length > 1) {
        for (const id of c.ids) entries.push({ id, anchorY: anchor(id), height: DOT_H });
      }
    }
    // The pin keeps the selection's own row from being evicted: the selected note's dot when its
    // cluster is open and expanded, otherwise the cluster's chip.
    const selCluster = selected ? clusters.find((c) => c.ids.includes(selected)) : undefined;
    const pinId = selCluster
      ? selected && openCluster === selCluster.id && selCluster.ids.length > 1
        ? selected
        : selCluster.id
      : undefined;
    const layout = layoutMarginalia(entries, {
      viewportH: box.height,
      gap: GAP,
      ...(pinId ? { pinId } : {}),
    });
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
            {@const open = openCluster === c.id && multi}
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
                aria-label={multi ? `${c.ids.length} notes` : "Note"}
                onclick={() => clickCluster(c.id)}
                onpointerenter={() => onhover?.(c.ids[0]!)}
              >
                {#if multi}
                  <span class="count" aria-hidden="true">{c.ids.length}</span>
                  <span class="reading-dots" aria-hidden="true">
                    {#each readingColoursOf(c) as colour (colour)}
                      <span class="dot" style={`background:${colour}`}></span>
                    {/each}
                  </span>
                {:else}
                  <span class="dot solo" aria-hidden="true" style={`background:${colourOf[c.ids[0]!]}`}></span>
                {/if}
              </button>
            </div>
            {#if open}
              {#each c.ids as id, i (id)}
                {#if id in model.topOf}
                  <button
                    type="button"
                    class="note-dot"
                    class:sel={selected === id}
                    style={`top:${model.topOf[id]}px`}
                    aria-label={`Note ${i + 1} of ${c.ids.length}`}
                    onclick={() => onselect?.(id)}
                    onpointerenter={() => onhover?.(id)}
                  >
                    <span class="dot" aria-hidden="true" style={`background:${colourOf[id]}`}></span>
                  </button>
                {/if}
              {/each}
            {/if}
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
    display: flex; gap: 8px; align-items: center; width: 100%;
    padding: 6px 10px; cursor: pointer; text-align: left;
    background: none; border: none; color: var(--ink-canvas-primary); font: inherit;
  }
  .chip:hover { background: var(--surface-canvas-overlay); }
  .count {
    flex: 0 0 auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: #fff; font-size: 0.72rem; font-weight: 600; line-height: 1;
  }
  .reading-dots { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  /* Pure where + how-much (user-verdict strip, Archie-dff3): a dot per DISTINCT reading colour in the
     cluster, never note text — reading the note itself is the inspector's job. */
  .dot {
    width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto;
    border: 1px solid #00000022;
  }
  /* A single-note "cluster" IS its dot, slightly larger so it reads as content, not a stray mark. */
  .dot.solo { width: 11px; height: 11px; }

  /* An expanded cluster's individual members — each note's own dot, positioned at ITS anchor via the
     same overlap solver (layoutMarginalia), never a text list under the chip. */
  .note-dot {
    position: absolute; left: 10px; z-index: 2;
    width: 20px; height: 20px; padding: 0; margin: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-canvas-raised); border: 1px solid var(--border-canvas); border-radius: 50%;
    cursor: pointer; transition: top 120ms ease-out, border-color 140ms ease;
    box-shadow: var(--shadow-lift-low);
  }
  .note-dot:hover { border-color: var(--ink-canvas-secondary); }
  .note-dot.sel { border-color: var(--accent); box-shadow: 0 2px 10px #0000001f; }

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
    .marginalia-rail, .cluster, .heat, .note-dot { transition: none; }
  }
</style>
