<script lang="ts">
  // Add-map modal (geo-annotation Phase 3, Q3 — INVENTED UX, human-gated). Pick a CURATED basemap (terms
  // permit static-site embedding, attribution baked in → resolves D6), set the bounded extent on a
  // pan/zoom world locator (drag the box / drag handles to clamp · drag the map to pan · wheel/± to zoom),
  // name it; emits a tileSource descriptor + label. Bounds fields + presets remain for precision.
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
  let west = $state(-0.51), south = $state(51.28), east = $state(0.33), north = $state(51.69); // a region, not the world
  let maxZoom = $state(14);
  let useCustom = $state(false);
  let customTemplate = $state("");
  let customAttribution = $state("");

  const provider = $derived(PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!);
  const templateOk = $derived(!useCustom || (/\{z\}/.test(customTemplate) && /\{x\}/.test(customTemplate) && /\{y\}/.test(customTemplate)));
  const valid = $derived(east > west && north > south && maxZoom >= 1 && maxZoom <= 22 && templateOk);

  // --- Locator (mini slippy map): pixel↔lng/lat at a chosen zoom; pan + zoom for precise clamping. ---
  const S = 320; // locator viewport (px)
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const ext = (z: number): { tileSize: number; maxZoom: number } => ({ tileSize: 256, maxZoom: z });
  const llToWorld = (lng: number, lat: number, z: number) => lngLatToPixel({ lng, lat }, ext(z));
  const worldToLL = (x: number, y: number, z: number) => pixelToLngLat({ x, y }, ext(z));

  let locZoom = $state(8);
  let locCenter = $state<{ lng: number; lat: number }>({ lng: -0.09, lat: 51.485 });

  const origin = $derived.by(() => { const c = llToWorld(locCenter.lng, locCenter.lat, locZoom); return { x: c.x - S / 2, y: c.y - S / 2, z: locZoom }; });
  const screenToLL = (sx: number, sy: number) => worldToLL(origin.x + sx, origin.y + sy, origin.z);
  const llToScreen = (lng: number, lat: number) => { const w = llToWorld(lng, lat, origin.z); return { x: w.x - origin.x, y: w.y - origin.y }; };
  // basemap tiles covering the viewport at the current zoom (positioned absolutely inside the locator)
  const tiles = $derived.by(() => {
    const z = origin.z, n = 2 ** z;
    const t = useCustom ? customTemplate : provider.template;
    const out: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let tx = Math.floor(origin.x / 256); tx <= Math.floor((origin.x + S) / 256); tx++) {
      for (let ty = Math.floor(origin.y / 256); ty <= Math.floor((origin.y + S) / 256); ty++) {
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const url = t.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
        if (/\{[zxy]\}/.test(url)) continue; // unfilled (invalid custom template) → skip
        out.push({ key: `${z}/${tx}/${ty}`, url, left: tx * 256 - origin.x, top: ty * 256 - origin.y });
      }
    }
    return out;
  });
  const boxPx = $derived.by(() => { const nw = llToScreen(west, north); const se = llToScreen(east, south); return { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y }; });

  type DragMode = "move" | "pan" | "nw" | "ne" | "sw" | "se";
  let locatorEl: HTMLDivElement;
  let drag = $state<{ mode: DragMode; ox: number; oy: number } | null>(null);
  function ptr(e: MouseEvent): { x: number; y: number } { const r = locatorEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function order(): void { if (west > east) [west, east] = [east, west]; if (south > north) [south, north] = [south, north]; }
  function dragDown(mode: DragMode, e: PointerEvent): void { e.preventDefault(); locatorEl.setPointerCapture(e.pointerId); const p = ptr(e); drag = { mode, ox: p.x, oy: p.y }; }
  function dragMove(e: PointerEvent): void {
    if (!drag) return;
    const p = ptr(e);
    if (drag.mode === "pan") {
      const c = llToWorld(locCenter.lng, locCenter.lat, origin.z);
      locCenter = worldToLL(c.x - (p.x - drag.ox), c.y - (p.y - drag.oy), origin.z);
      drag.ox = p.x; drag.oy = p.y;
    } else if (drag.mode === "move") {
      const nw = llToScreen(west, north), se = llToScreen(east, south);
      const dx = p.x - drag.ox, dy = p.y - drag.oy;
      const a = screenToLL(nw.x + dx, nw.y + dy), b = screenToLL(se.x + dx, se.y + dy);
      west = a.lng; north = a.lat; east = b.lng; south = b.lat;
      drag.ox = p.x; drag.oy = p.y;
    } else {
      const ll = screenToLL(p.x, p.y);
      if (drag.mode.includes("w")) west = ll.lng;
      if (drag.mode.includes("e")) east = ll.lng;
      if (drag.mode.includes("n")) north = ll.lat;
      if (drag.mode.includes("s")) south = ll.lat;
      order();
    }
  }
  function dragUp(): void { drag = null; }
  // Zoom keeping the geographic point under (mx,my) fixed on screen — "zoom at mouse", not at centre.
  function zoomAt(mx: number, my: number, d: number): void {
    const nz = clamp(locZoom + d, 0, Math.min(provider.maxZoom, 18));
    if (nz === locZoom) return;
    const g = screenToLL(mx, my); // geo under the cursor at the current zoom
    const gw = llToWorld(g.lng, g.lat, nz); // its world px at the new zoom
    locZoom = nz;
    locCenter = worldToLL(gw.x - mx + S / 2, gw.y - my + S / 2, nz); // recentre so g stays under (mx,my)
  }
  const zoomBy = (d: number): void => zoomAt(S / 2, S / 2, d); // the ± buttons zoom at centre
  function onWheel(e: WheelEvent): void { e.preventDefault(); const p = ptr(e); zoomAt(p.x, p.y, e.deltaY < 0 ? 1 : -1); }
  // Set the region to exactly the current locator viewport ("Use view").
  function selectCurrent(): void { const nw = screenToLL(0, 0), se = screenToLL(S, S); west = nw.lng; north = nw.lat; east = se.lng; south = se.lat; }

  // Centre + fit the locator to the current box (run on preset pick + "fit" button).
  function fitToBox(): void {
    locCenter = { lng: (west + east) / 2, lat: (south + north) / 2 };
    for (let z = 18; z >= 0; z--) {
      const w = llToWorld(east, south, z).x - llToWorld(west, north, z).x;
      const h = llToWorld(west, south, z).y - llToWorld(east, north, z).y;
      if (w <= S * 0.85 && h <= S * 0.85) { locZoom = z; return; }
    }
    locZoom = 0;
  }
  function applyRegion(b: [number, number, number, number]) { [west, south, east, north] = b; fitToBox(); }

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
      <div class="presets">{#each REGIONS as r}<button type="button" onclick={() => applyRegion(r.bounds)}>{r.name}</button>{/each}
        <button type="button" class="action" onclick={selectCurrent} title="Set the region to exactly what's shown in the locator now">⊡ Use view</button>
        <button type="button" onclick={fitToBox} title="Centre & zoom the locator on the region">Fit ⤢</button>
      </div>
      <!-- Pan/zoom locator (Q3): drag the box / handles to clamp · drag the map to pan · wheel or ± to zoom. -->
      <div class="locator" bind:this={locatorEl} role="application" aria-label="Region locator"
        style="width:{S}px;height:{S}px" onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} onwheel={onWheel}>
        <div class="tiles">{#each tiles as t (t.key)}<img src={t.url} alt="" draggable="false" style="left:{t.left}px;top:{t.top}px" />{/each}</div>
        <svg width={S} height={S} class:dragging={drag !== null} onpointerdown={(e) => dragDown("pan", e)}>
          <rect class="sel" x={boxPx.x} y={boxPx.y} width={Math.max(0, boxPx.w)} height={Math.max(0, boxPx.h)}
            onpointerdown={(e) => { e.stopPropagation(); dragDown("move", e); }} />
          {#each HANDLES as h}
            <rect class="handle" x={h.fx(boxPx) - 5} y={h.fy(boxPx) - 5} width="10" height="10"
              onpointerdown={(e) => { e.stopPropagation(); dragDown(h.m, e); }} />
          {/each}
        </svg>
        <div class="zoom-ctrls">
          <button type="button" onclick={() => zoomBy(1)} aria-label="Zoom in">+</button>
          <button type="button" onclick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
        </div>
        <span class="loc-z">z{locZoom}</span>
      </div>
      <div class="bounds">
        <label>W<input type="number" step="any" bind:value={west} /></label>
        <label>S<input type="number" step="any" bind:value={south} /></label>
        <label>E<input type="number" step="any" bind:value={east} /></label>
        <label>N<input type="number" step="any" bind:value={north} /></label>
        <label>Max&nbsp;zoom<input type="number" min="1" max="22" bind:value={maxZoom} /></label>
      </div>
      <p class="hint">Drag the box (or its corner handles) to clamp · drag the map to pan · wheel or ± to zoom · or type exact bounds.</p>
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
  .presets .action { margin-left: auto; }
  /* Pan/zoom locator (Q3). */
  .locator { position: relative; margin: var(--space-2, 8px) auto; border: 1px solid var(--border-paper, #cfc8ba); border-radius: 4px; overflow: hidden; touch-action: none; background: #aadaff; }
  .locator .tiles { position: absolute; inset: 0; }
  .locator .tiles img { position: absolute; width: 256px; height: 256px; user-select: none; -webkit-user-drag: none; }
  .locator svg { position: absolute; inset: 0; cursor: grab; }
  .locator svg.dragging { cursor: grabbing; }
  .locator .sel { fill: var(--accent, #3a6b4c); fill-opacity: 0.2; stroke: var(--accent, #3a6b4c); stroke-width: 1.5; cursor: move; }
  .locator .handle { fill: #fff; stroke: var(--accent, #3a6b4c); stroke-width: 1.5; cursor: pointer; }
  .zoom-ctrls { position: absolute; top: 6px; left: 6px; display: flex; flex-direction: column; gap: 2px; }
  .zoom-ctrls button { width: 24px; height: 24px; font-size: 1rem; line-height: 1; border: 1px solid var(--border-paper, #cfc8ba); background: rgba(255, 255, 255, 0.92); border-radius: 4px; cursor: pointer; color: #2a2722; }
  .loc-z { position: absolute; bottom: 6px; left: 6px; font: 0.7rem var(--font-mono, monospace); background: rgba(0, 0, 0, 0.55); color: #fff; padding: 1px 5px; border-radius: 3px; }
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
