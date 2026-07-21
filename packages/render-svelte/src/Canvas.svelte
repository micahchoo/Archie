<script lang="ts">
  // Thin Svelte 5 shell over @render/mount (ADR-0002 / Q-2). Binding/edit LOGIC lives in
  // createCanvasController + the @render/core AnnotationSession (both headless-tested); this
  // component only wires the surface to $state, drawing props, and lifecycle callbacks.
  // NOT in the tsc/test gate (real OSD render = browser verification).
  import { onMount, onDestroy } from "svelte";
  import { createMount, zoomBand, dotsVisibleForBand, rectCenter, type ZoomBand, type ScreenRect, type FitOptions, type MountSurface, type DrawTool, type MarkerStyle, type FrameOverlay, type NativeFetch } from "@render/mount";
  import { type W3CAnnotation, type TileSourceDescriptor } from "@render/core";
  import { createCanvasController, type CanvasController } from "./controller.js";

  let {
    zoomOnSelect = false,
    locator = false,
    source,
    tileSource,
    canvasId,
    annotations = [],
    selected = $bindable<string | null>(null),
    focus = null,
    tool = "rectangle",
    drawing = false,
    getFitOptions,
    oncreate,
    onupdate,
    ondelete,
    onmarkerrect,
    rectIds,
    onmarkerrects,
    styleOf,
    frame,
    onzoom,
    dots,
    nativeFetch,
  }: {
    /** Reader UX: clicking a marker on the canvas zooms to it (controller option). */
    zoomOnSelect?: boolean;
    /** Worklist 1.1: show the locator mini-map (OSD navigator) — viewport-within-image. */
    locator?: boolean;
    source: string;
    /** A structured tile-source descriptor (geo-annotation extension) — when set, mounts a slippy-map
     *  basemap surface instead of the `source` image/IIIF string. Annotations still target `canvasId`. */
    tileSource?: TileSourceDescriptor;
    canvasId?: string;
    annotations?: W3CAnnotation[];
    selected?: string | null;
    /** A region fragment to fit the viewport to, independent of selection — a narrative Section's camera
     *  target (ADR-0005). `xywh=...` fits the region; `t=...` no-ops on this spatial canvas. */
    focus?: string | null;
    tool?: DrawTool;
    drawing?: boolean;
    getFitOptions?: () => FitOptions;
    oncreate?: (a: W3CAnnotation) => void;
    onupdate?: (a: W3CAnnotation) => void;
    ondelete?: (id: string) => void;
    /** The selected marker's on-screen rect — streamed on select, every pan/zoom frame, and after a
     *  geometry edit — so the host can anchor an editing popover to it (ADR-0006). Null when nothing is
     *  selected or the marker isn't resolvable (e.g. off-screen during an animation frame). */
    onmarkerrect?: (rect: { left: number; top: number; right: number; bottom: number } | null) => void;
    /** Worklist 2.1 (marginalia): which markers to stream rects for (usually every listed note). */
    rectIds?: string[];
    /** Batched rect stream — ALL `rectIds` rects per viewport frame (rAF-throttled), the
     *  MarginColumn's input. Unresolvable ids map to null. */
    onmarkerrects?: (rects: Record<string, { left: number; top: number; right: number; bottom: number } | null>) => void;
    /** Per-marker style by annotation id — colours a marker by its Reading (ADR-0007). Undefined = default. */
    styleOf?: (id: string) => MarkerStyle | undefined;
    /** A canvas-wide coverage border framing the whole object (7e1f). null clears; undefined = leave as-is. */
    frame?: FrameOverlay | null;
    /** Live zoom-magnitude readout (Archie-93fd scale cue) — fired once the surface is ready and again
     *  on every viewport change, with the SAME raw ratio (current zoom / home zoom) zoom-band.ts bands.
     *  The host formats it with `formatZoomRatio` (@render/mount) and renders its own chrome — this
     *  component stays free of app-specific chrome placement (studio's a9fc "nothing floats over the
     *  artefact" vs. the viewer's canvas-corner overlays are contradictory idioms; see App.svelte /
     *  Reader.svelte for where each surface actually renders the cue). */
    onzoom?: (ratio: number) => void;
    /** LOD reading aid (Archie-c1d9): a location dot per note. At the FAR band a small dot is drawn at
     *  each marker's on-screen centre (a region outline is near-invisible at fit-width); the dots hide in
     *  mid/near where the real marks carry the signal. The SAME set is plotted inside the OSD navigator
     *  (locator) as note-position dots. `colour` = the note's Reading hue; `label` = its accessible name
     *  (the note's prose snippet). Undefined/empty = no dot layer. Clicking a dot selects (bind:selected). */
    dots?: { id: string; colour: string; label: string }[];
    /** Desktop-only (Tauri) native-fetch escape hatch, threaded to the mount so a remote image / IIIF
     *  info.json opens on CORS-restricted / redirecting hosts. The studio passes it only when isTauri();
     *  the web viewer never sets it, so behavior there is byte-identical (see @render/mount NativeFetch). */
    nativeFetch?: NativeFetch;
  } = $props();

  // Emit the selected marker's current screen rect (OSD re-anchors natively, so this just re-reads).
  function emitRect() {
    if (surface && onmarkerrect) onmarkerrect(selected != null ? surface.markerScreenRect(selected) : null);
  }
  // Batched stream for the marginalia column (worklist 2.1) — rAF-throttled so a pan emits at most
  // one batched read per frame regardless of how often OSD fires update-viewport.
  let rectsRaf = 0;
  function emitRects() {
    if (!surface || !onmarkerrects || !rectIds || rectsRaf) return;
    rectsRaf = requestAnimationFrame(() => {
      rectsRaf = 0;
      if (surface && onmarkerrects && rectIds) onmarkerrects(surface.markerScreenRects(rectIds));
    });
  }
  // Scale cue (Archie-93fd) — OSD re-derives the ratio itself (getZoomRatio), so this just re-reads,
  // same shape as emitRect. Not rAF-throttled: it's a single division, and the host only ever renders
  // the ROUNDED text (formatZoomRatio), so an extra call between two identical-looking frames is free.
  function emitZoom() {
    if (surface && onzoom) onzoom(surface.getZoomRatio());
  }

  // LOD far-band dots (Archie-c1d9) — at the FAR band a region outline is a near-invisible few-pixel
  // box, so we paint a small dot per note at its marker's on-screen centre as a LOCATION signal; the
  // dots hide in mid/near where the real WebGL marks carry it. Positions ride the SAME rAF-throttled
  // markerScreenRects stream the marginalia column uses (so a pan emits at most one batched read per
  // frame), and the band is re-read off getZoomRatio each frame. `dotBand`/`dotRects` are $state so the
  // template re-renders; `dotsVisibleForBand` owns the band gate, `rectCenter` the placement.
  //
  // These dots ARE the marker-level a11y contract now (Archie-3e12): each is a real, positioned,
  // clickable <button> carrying the note's aria-label (its prose snippet) but tabindex="-1" — OUT of
  // the tab order. The former labelMarkers() post-pass stamped ARIA onto `.a9s-annotation[data-id]`
  // SVG nodes that Annotorious 3 never renders (marks go to a WebGL canvas — probe 2026-07-19), so it
  // matched zero elements and did nothing; deleted. The INDEX (note cards / section beats) remains the
  // PRIMARY keyboard surface — dots are a mouse hit-target + a screen-reader label at fit-width, not a
  // tab maze through off-screen marks.
  let dotBand = $state<ZoomBand>("far");
  let dotRects = $state<Record<string, ScreenRect | null>>({});
  let dotsRaf = 0;
  function emitDots() {
    if (!surface || !dots || dots.length === 0 || dotsRaf) return;
    dotsRaf = requestAnimationFrame(() => {
      dotsRaf = 0;
      if (!surface || !dots) return;
      dotBand = zoomBand(surface.getZoomRatio());
      // Off-band the {#each} is gone entirely — skip the O(annotations) rect pass too (review nit).
      if (!dotsVisibleForBand(dotBand)) return;
      dotRects = surface.markerScreenRects(dots.map((d) => d.id));
    });
  }
  // Navigator note-dots (Archie-c1d9): plotted inside the OSD navigator by the mount (setNavigatorDots),
  // which owns that DOM. Only the id+colour cross the seam; the mount resolves each note's image-space
  // position and maps it into navigator px. No-op when the locator is off.
  function syncNavDots() {
    if (surface) surface.setNavigatorDots(dots && locator ? dots.map((d) => ({ id: d.id, colour: d.colour })) : []);
  }

  let el: HTMLDivElement;
  let surface: MountSurface | undefined;
  let controller: CanvasController | undefined;
  let offViewport: (() => void) | undefined; // unsubscribe from OSD pan/zoom (popover re-anchor)
  // Set in onDestroy. The mount is async, so a {#key canvasId} remount can unmount THIS instance before
  // createMount resolves — at which point `controller` (the normal teardown, controller.destroy() →
  // surface.destroy()) is still undefined, so onDestroy's controller?.destroy() no-ops and the
  // eventually-resolved surface (its OSD viewer AND any native-fetched image blob) would orphan. The
  // onMount continuation checks this flag and tears the surface down itself.
  let destroyed = false;
  let status = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");

  onMount(async () => {
    try {
      surface = await createMount(el, { source, ...(tileSource ? { tileSource } : {}), ...(canvasId ? { canvasId } : {}), ...(getFitOptions ? { getFitOptions } : {}), ...(locator ? { locator } : {}), ...(nativeFetch ? { nativeFetch } : {}) });
      if (destroyed) { surface.destroy(); surface = undefined; return; } // unmounted mid-mount (remount race) — tear down here; onDestroy's controller was still undefined
      surface.setAnnotations(annotations);
      if (styleOf) surface.setStyle(styleOf);
      if (frame !== undefined) surface.setFrame(frame);
      if (oncreate) surface.onCreate(oncreate);
      if (onupdate) surface.onUpdate(onupdate);
      if (ondelete) surface.onDelete(ondelete);
      controller = createCanvasController(surface, { zoomOnSurfaceSelect: zoomOnSelect });
      controller.onSelectChange((id) => {
        selected = id;
      });
      if (selected !== null) controller.select(selected);
      // Apply the CURRENT drawing state now that surface exists — the $effects below only
      // re-run on tool/drawing CHANGES, so a state set during the async mount gap would be lost.
      surface.setDrawingTool(tool);
      surface.setDrawingEnabled(drawing);
      // Same mount-gap catch-up for the focus region (a narrative Section.start, ADR-0005): the line-130
      // $effect only fires on focus CHANGES, but a REMOUNT (switching objects via {#key canvasId}) sets
      // `focus` BEFORE this async mount resolves — surface was undefined when the effect first ran, and it
      // is not reactive, so it never re-fires. Fit it once here, or a cross-object navigate (studio's
      // narrative card → another object, and the viewer's cross-object section) never frames its region.
      if (focus) surface.fitRegion(focus);
      // Follow the selected marker as the viewport moves (OSD-native re-anchor — donor pattern, no dep).
      offViewport = surface.onViewportChange(() => { emitRect(); emitRects(); emitZoom(); emitDots(); });
      emitRect();
      emitRects();
      emitZoom();
      syncNavDots();
      emitDots();
      status = "ready";
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : "Couldn't load this media item.";
    }
  });

  // Read the reactive props FIRST, before any `surface?.`/`if (surface)` guard — otherwise the
  // optional-chain short-circuits on the (async) initially-undefined surface and the effect never
  // subscribes to the prop, so it never re-runs when the prop changes (Svelte 5 dep-tracking gotcha).
  $effect(() => { const a = annotations; if (surface) { surface.setAnnotations(a); emitRect(); } });
  $effect(() => { void rectIds; void annotations; if (surface) emitRects(); });
  // Far-band dots ride the marker rect stream; re-solve when the dot set or annotations change.
  $effect(() => { void dots; void annotations; if (surface) emitDots(); });
  // Navigator note-dots: re-sync when the dot set (or locator) changes — the mount reconciles the DOM.
  $effect(() => { void dots; void locator; if (surface) syncNavDots(); });
  $effect(() => { const sf = styleOf; if (surface) surface.setStyle(sf); });
  // Coverage border (7e1f) — read `frame` first (dep-tracking gotcha); undefined = leave as-is, null clears.
  $effect(() => { const fr = frame; if (surface && fr !== undefined) surface.setFrame(fr); });
  $effect(() => { const t = tool; if (surface) surface.setDrawingTool(t); });
  $effect(() => { const d = drawing; if (surface) surface.setDrawingEnabled(d); });
  $effect(() => { const s = selected; if (controller && s !== controller.selected) controller.select(s); emitRect(); });
  // A Section's camera target (not an annotation) → fit the region. Read `focus` first (dep-tracking gotcha).
  $effect(() => { const f = focus; if (f && surface) surface.fitRegion(f); });

  onDestroy(() => { destroyed = true; if (rectsRaf) cancelAnimationFrame(rectsRaf); if (dotsRaf) cancelAnimationFrame(dotsRaf); offViewport?.(); controller?.destroy(); });
</script>

<div class="archie-canvas-wrap">
  <div bind:this={el} class="archie-canvas"></div>
  <!-- LOD far-band dots (Archie-c1d9): a location dot per note at fit-width, hidden in mid/near.
       Each dot is position:fixed at the marker's viewport-space centre (the same coord space the
       editing popover anchors in — markerScreenRects), so there is NO covering layer to intercept
       pointer events between dots. Real, clickable, aria-labelled buttons — the marker-level a11y home. -->
  {#if dots && dots.length > 0 && status === "ready" && dotsVisibleForBand(dotBand)}
    {#each dots as d (d.id)}
      {@const r = dotRects[d.id]}
      {#if r}
        {@const c = rectCenter(r)}
        <button
          type="button"
          class="marker-dot"
          style={`left:${c.x}px;top:${c.y}px;--dot-colour:${d.colour}`}
          aria-label={d.label}
          tabindex="-1"
          onclick={() => (selected = d.id)}
        ></button>
      {/if}
    {/each}
  {/if}
  {#if status !== "ready"}
    <div class="overlay" class:error={status === "error"}>
      {#if status === "loading"}
        <span class="dot"></span><span>Loading…</span>
      {:else}
        <span class="warn">⚠</span><span>{errorMsg}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .archie-canvas-wrap { position: relative; width: 100%; height: 100%; }
  .archie-canvas { width: 100%; height: 100%; }
  /* LOD far-band dot (Archie-c1d9): a small, quiet location mark — filled with the note's Reading hue,
     a hairline ring for contrast on any tile, centred on its marker. Fixed-positioned (viewport coords
     from markerScreenRects); only the dot itself is a pointer target (no covering layer). No label. */
  .marker-dot {
    position: fixed;
    width: 9px; height: 9px; padding: 0;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: var(--dot-colour, #3a8c5d);
    border: 1px solid rgba(0, 0, 0, 0.55);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
    cursor: pointer;
    z-index: 35; /* above canvas overlays (25/30), below the studio modal scrim band (40) — review nit */
    opacity: 0.9;
    transition: transform 120ms ease, opacity 120ms ease;
  }
  .marker-dot:hover { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
  .marker-dot:focus-visible { outline: 2px solid var(--accent, #d98a2b); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .marker-dot { transition: none; } }
  /* NOTE (Archie-a6fb): the mark drop-shadow + zoom-band weighting CSS that used to live here
     targeted `.a9s-annotation`, which Annotorious 3 never renders (marks go to a WebGL canvas, no
     per-shape SVG node — probe 2026-07-19). It matched zero elements for a month; deleted. The
     zoom-band weight is now applied through the style channel (withZoomBand → setStyle) by the
     host that wants it (studio App.svelte); the arrival pulse likewise (viewer Reader.svelte). */
  /* Loading / error states (Soft Static §Reader States). Quiet Spline-mono caption chrome —
     wide tracking, uppercase, reduced opacity — over warm paper. Reads as a found label, not
     announced arcade status. */
  .overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: var(--surface-canvas); color: var(--ink-canvas-secondary);
    font-family: var(--font-ui); font-size: 0.8125rem; letter-spacing: 0.16em; text-transform: uppercase;
    opacity: 0.62;
  }
  .overlay.error { color: var(--semantic-error); opacity: 1; }
  .warn { font-size: 1.1rem; }
  .dot { width: 7px; height: 7px; border-radius: var(--radius-sm); background: var(--accent); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
