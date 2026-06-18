<script lang="ts">
  // Add-map modal (geo-annotation Phase 3, Q3 — INVENTED UX, human-gated). Pick a CURATED basemap (terms
  // permit static-site embedding, attribution baked in → resolves D6), set the bounded extent, name it;
  // emits a tileSource descriptor + label. The grilling's ideal extent gesture is "draw a box on a world
  // locator" (Q3); this first cut uses bounds fields + region presets, with the draw-box as the owed polish.
  import { lngLatToPixel, pixelToLngLat, type TileSourceDescriptor } from "@render/core";

  let { onadd, onclose }: {
    onadd: (m: { label: string; tileSource: TileSourceDescriptor }) => void;
    onclose: () => void;
  } = $props();

  // CURATED providers — only basemaps whose terms permit static embedding (D6); attribution baked in.
  const PROVIDERS = [
    { id: "osm", name: "OpenStreetMap", template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 },
    { id: "carto-light", name: "Carto — Light (Positron)", template: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors, © CARTO", maxZoom: 19 },
    { id: "carto-dark", name: "Carto — Dark (Dark Matter)", template: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors, © CARTO", maxZoom: 19 },
  ];
  const REGIONS: Array<{ name: string; bounds: [number, number, number, number] }> = [
    { name: "Whole world", bounds: [-180, -85, 180, 85] },
    { name: "Europe", bounds: [-11, 35, 32, 60] },
    { name: "Greater London", bounds: [-0.51, 51.28, 0.33, 51.69] },
    { name: "Contiguous US", bounds: [-125, 24, -66, 50] },
  ];

  let providerId = $state(PROVIDERS[0]!.id);
  let label = $state("");
  let west = $state(-0.51), south = $state(51.28), east = $state(0.33), north = $state(51.69); // default: a region, not the world
  let maxZoom = $state(14);
  let useCustom = $state(false);
  let customTemplate = $state("");
  let customAttribution = $state("");

  const provider = $derived(PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!);
  const templateOk = $derived(!useCustom || /\{z\}/.test(customTemplate) && /\{x\}/.test(customTemplate) && /\{y\}/.test(customTemplate));
  const valid = $derived(east > west && north > south && maxZoom >= 1 && maxZoom <= 22 && templateOk);

  function applyRegion(b: [number, number, number, number]) { [west, south, east, north] = b; }

  // --- Graphical clamping (Q3): drag a box on a world locator to set the extent; drag handles to clamp. ---
  const S = 320; // locator square size (px) — a Web-Mercator world tile rendered SxS
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const toPx = (lng: number, lat: number): { x: number; y: number } => lngLatToPixel({ lng, lat }, { tileSize: S, maxZoom: 0 });
  const toLL = (x: number, y: number): { lng: number; lat: number } => pixelToLngLat({ x: clamp(x, 0, S), y: clamp(y, 0, S) }, { tileSize: S, maxZoom: 0 });
  // The current bounds as a pixel rect on the locator (NW corner + size).
  const boxPx = $derived.by(() => { const nw = toPx(west, north); const se = toPx(east, south); return { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y }; });
  // The selected basemap's z0 tile = the whole world (a backdrop to draw on); fall back to OSM if custom is blank.
  const worldTileUrl = $derived.by(() => {
    const t = useCustom ? customTemplate : provider.template;
    const filled = t.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
    return /\{[zxy]\}/.test(filled) ? "https://tile.openstreetmap.org/0/0/0.png" : filled;
  });

  type DragMode = "new" | "move" | "nw" | "ne" | "sw" | "se";
  let locatorEl: SVGSVGElement;
  let drag = $state<{ mode: DragMode; ox: number; oy: number } | null>(null);
  function ptr(e: PointerEvent): { x: number; y: number } {
    const r = locatorEl.getBoundingClientRect();
    return { x: clamp(e.clientX - r.left, 0, S), y: clamp(e.clientY - r.top, 0, S) };
  }
  function order(): void { if (west > east) [west, east] = [east, west]; if (south > north) [south, north] = [south, north]; }
  function dragDown(mode: DragMode, e: PointerEvent): void {
    e.preventDefault();
    locatorEl.setPointerCapture(e.pointerId);
    const p = ptr(e);
    drag = { mode, ox: p.x, oy: p.y };
    if (mode === "new") { const ll = toLL(p.x, p.y); west = ll.lng; east = ll.lng; north = ll.lat; south = ll.lat; }
  }
  function dragMove(e: PointerEvent): void {
    if (!drag) return;
    const p = ptr(e);
    if (drag.mode === "new") {
      const a = toLL(drag.ox, drag.oy), b = toLL(p.x, p.y);
      west = Math.min(a.lng, b.lng); east = Math.max(a.lng, b.lng); north = Math.max(a.lat, b.lat); south = Math.min(a.lat, b.lat);
    } else if (drag.mode === "move") {
      const nw0 = toPx(west, north), se0 = toPx(east, south);
      const w = se0.x - nw0.x, h = se0.y - nw0.y;
      const dx = p.x - drag.ox, dy = p.y - drag.oy;
      const nx = clamp(nw0.x + dx, 0, S - w), ny = clamp(nw0.y + dy, 0, S - h);
      const nw = toLL(nx, ny), se = toLL(nx + w, ny + h);
      west = nw.lng; north = nw.lat; east = se.lng; south = se.lat;
      drag.ox = p.x; drag.oy = p.y;
    } else {
      const ll = toLL(p.x, p.y);
      if (drag.mode.includes("w")) west = ll.lng;
      if (drag.mode.includes("e")) east = ll.lng;
      if (drag.mode.includes("n")) north = ll.lat;
      if (drag.mode.includes("s")) south = ll.lat;
      order();
    }
  }
  function dragUp(): void { drag = null; }
  const HANDLES: Array<{ m: DragMode; fx: (b: { x: number; y: number; w: number; h: number }) => number; fy: (b: { x: number; y: number; w: number; h: number }) => number }> = [
    { m: "nw", fx: (b) => b.x, fy: (b) => b.y },
    { m: "ne", fx: (b) => b.x + b.w, fy: (b) => b.y },
    { m: "sw", fx: (b) => b.x, fy: (b) => b.y + b.h },
    { m: "se", fx: (b) => b.x + b.w, fy: (b) => b.y + b.h },
  ];

  function submit() {
    if (!valid) return;
    const base = { kind: "xyz" as const, tileSize: 256, minZoom: 0, maxZoom, bounds: [west, south, east, north] as [number, number, number, number] };
    const tileSource: TileSourceDescriptor = useCustom
      ? { ...base, template: customTemplate.trim(), ...(customAttribution.trim() ? { attribution: customAttribution.trim() } : {}) }
      : { ...base, template: provider.template, attribution: provider.attribution };
    onadd({ label: label.trim() || `${provider.name} map`, tileSource });
  }
</script>

<div class="scrim" role="presentation" onclick={onclose}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Add a map" onclick={(e) => e.stopPropagation()}>
    <header><h2>Add a map</h2><button class="x" type="button" onclick={onclose} aria-label="Close">✕</button></header>

    <label class="field">Basemap
      <select bind:value={providerId} disabled={useCustom}>
        {#each PROVIDERS as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </label>
    <p class="attr">{useCustom ? (customAttribution || "Set attribution below — required by most providers") : provider.attribution}</p>

    <label class="field">Name <input bind:value={label} placeholder={`${provider.name} map`} /></label>

    <fieldset class="extent">
      <legend>Region shown — the map is bounded to this (ADR-0015)</legend>
      <div class="presets">{#each REGIONS as r}<button type="button" onclick={() => applyRegion(r.bounds)}>{r.name}</button>{/each}</div>
      <!-- Graphical clamping (Q3): drag on the world to draw a region; drag the corner handles to clamp it. -->
      <div class="locator" style="width:{S}px;height:{S}px">
        <img src={worldTileUrl} alt="World basemap" width={S} height={S} draggable="false" />
        <svg bind:this={locatorEl} width={S} height={S} class:dragging={drag !== null}
          onpointerdown={(e) => dragDown("new", e)} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp}>
          <rect class="sel" x={boxPx.x} y={boxPx.y} width={Math.max(0, boxPx.w)} height={Math.max(0, boxPx.h)}
            onpointerdown={(e) => { e.stopPropagation(); dragDown("move", e); }} />
          {#each HANDLES as h}
            <rect class="handle" x={h.fx(boxPx) - 5} y={h.fy(boxPx) - 5} width="10" height="10"
              onpointerdown={(e) => { e.stopPropagation(); dragDown(h.m, e); }} />
          {/each}
        </svg>
      </div>
      <div class="bounds">
        <label>W<input type="number" step="any" bind:value={west} /></label>
        <label>S<input type="number" step="any" bind:value={south} /></label>
        <label>E<input type="number" step="any" bind:value={east} /></label>
        <label>N<input type="number" step="any" bind:value={north} /></label>
        <label>Max&nbsp;zoom<input type="number" min="1" max="22" bind:value={maxZoom} /></label>
      </div>
      <p class="hint">Drag on the map to draw a region; drag a corner handle to clamp it. Or pick a preset / type exact bounds.</p>
    </fieldset>

    <details bind:open={useCustom}>
      <summary>Advanced: custom tile URL</summary>
      <input bind:value={customTemplate} placeholder={"https://…/{z}/{x}/{y}.png"} />
      <input bind:value={customAttribution} placeholder="Attribution (e.g. © Provider)" />
    </details>

    <footer>
      <button type="button" class="cancel" onclick={onclose}>Cancel</button>
      <button type="button" class="add" disabled={!valid} onclick={submit}>Add map</button>
    </footer>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.5); }
  .modal { width: min(540px, 92vw); max-height: 88vh; overflow: auto; background: var(--surface-paper, #f5f3ee); color: var(--ink-paper-primary, #2a2722); border-radius: var(--radius-lg, 8px); padding: var(--space-5, 20px); box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3); font-family: var(--font-ui, system-ui), sans-serif; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4, 16px); }
  header h2 { margin: 0; font-size: 1.15rem; }
  .x { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: inherit; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: var(--space-3, 12px); font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-paper-secondary, #6b6557); }
  .field select, .field input, .bounds input, details input { font: inherit; font-size: 0.95rem; text-transform: none; letter-spacing: normal; padding: 6px 8px; border: 1px solid var(--border-paper, #cfc8ba); border-radius: 4px; background: #fff; color: var(--ink-paper-primary, #2a2722); }
  .attr { margin: -6px 0 var(--space-3, 12px); font-size: 0.72rem; color: var(--ink-paper-muted, #8a8275); }
  .extent { border: 1px solid var(--border-paper, #cfc8ba); border-radius: 6px; padding: var(--space-3, 12px); margin-bottom: var(--space-3, 12px); }
  .extent legend { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-paper-secondary, #6b6557); padding: 0 6px; }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--space-2, 8px); }
  .presets button { font: inherit; font-size: 0.78rem; padding: 3px 10px; border: 1px solid var(--border-paper, #cfc8ba); border-radius: 999px; background: #fff; cursor: pointer; color: inherit; }
  /* Graphical clamping locator (Q3): a world tile with an SVG box overlay you drag to set/clamp the extent. */
  .locator { position: relative; margin: var(--space-2, 8px) auto; border: 1px solid var(--border-paper, #cfc8ba); border-radius: 4px; overflow: hidden; touch-action: none; }
  .locator img { display: block; width: 100%; height: 100%; user-select: none; -webkit-user-drag: none; opacity: 0.92; }
  .locator svg { position: absolute; inset: 0; cursor: crosshair; }
  .locator svg.dragging { cursor: grabbing; }
  .locator .sel { fill: var(--accent, #3a6b4c); fill-opacity: 0.2; stroke: var(--accent, #3a6b4c); stroke-width: 1.5; cursor: move; }
  .locator .handle { fill: #fff; stroke: var(--accent, #3a6b4c); stroke-width: 1.5; cursor: pointer; }
  .bounds { display: flex; flex-wrap: wrap; gap: 8px; }
  .bounds label { display: flex; align-items: center; gap: 4px; font-size: 0.78rem; }
  .bounds input { width: 5.5rem; }
  .hint { margin: var(--space-2, 8px) 0 0; font-size: 0.72rem; color: var(--ink-paper-muted, #8a8275); }
  details { margin-bottom: var(--space-3, 12px); font-size: 0.85rem; }
  details summary { cursor: pointer; color: var(--ink-paper-secondary, #6b6557); }
  details input { display: block; width: 100%; box-sizing: border-box; margin-top: 8px; }
  footer { display: flex; justify-content: flex-end; gap: 8px; }
  footer button { font: inherit; padding: 7px 16px; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-paper, #cfc8ba); background: #fff; color: inherit; }
  footer .add { background: var(--accent, #3a6b4c); color: #fff; border-color: transparent; }
  footer .add:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
