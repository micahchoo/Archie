<script lang="ts">
  // Thin Svelte 5 shell over @render/mount (ADR-0002 / Q-2). Binding/edit LOGIC lives in
  // createCanvasController + the @render/core AnnotationSession (both headless-tested); this
  // component only wires the surface to $state, drawing props, and lifecycle callbacks.
  // NOT in the tsc/test gate (real OSD render = browser verification).
  import { onMount, onDestroy } from "svelte";
  import { createMount, type FitOptions, type MountSurface, type DrawTool, type MarkerStyle, type FrameOverlay } from "@render/mount";
  import type { W3CAnnotation } from "@render/core";
  import { createCanvasController, type CanvasController } from "./controller.js";

  let {
    zoomOnSelect = false,
    source,
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
    styleOf,
    frame,
  }: {
    /** Reader UX: clicking a marker on the canvas zooms to it (controller option). */
    zoomOnSelect?: boolean;
    source: string;
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
    /** Per-marker style by annotation id — colours a marker by its Reading (ADR-0007). Undefined = default. */
    styleOf?: (id: string) => MarkerStyle | undefined;
    /** A canvas-wide coverage border framing the whole object (7e1f). null clears; undefined = leave as-is. */
    frame?: FrameOverlay | null;
  } = $props();

  // Emit the selected marker's current screen rect (OSD re-anchors natively, so this just re-reads).
  function emitRect() {
    if (surface && onmarkerrect) onmarkerrect(selected != null ? surface.markerScreenRect(selected) : null);
  }

  let el: HTMLDivElement;
  let surface: MountSurface | undefined;
  let controller: CanvasController | undefined;
  let offViewport: (() => void) | undefined; // unsubscribe from OSD pan/zoom (popover re-anchor)
  let status = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");

  onMount(async () => {
    try {
      surface = await createMount(el, { source, ...(canvasId ? { canvasId } : {}), ...(getFitOptions ? { getFitOptions } : {}) });
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
      // Follow the selected marker as the viewport moves (OSD-native re-anchor — donor pattern, no dep).
      offViewport = surface.onViewportChange(emitRect);
      emitRect();
      status = "ready";
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : "Could not load the image";
    }
  });

  // Read the reactive props FIRST, before any `surface?.`/`if (surface)` guard — otherwise the
  // optional-chain short-circuits on the (async) initially-undefined surface and the effect never
  // subscribes to the prop, so it never re-runs when the prop changes (Svelte 5 dep-tracking gotcha).
  $effect(() => { const a = annotations; if (surface) surface.setAnnotations(a); emitRect(); });
  $effect(() => { const sf = styleOf; if (surface) surface.setStyle(sf); });
  // Coverage border (7e1f) — read `frame` first (dep-tracking gotcha); undefined = leave as-is, null clears.
  $effect(() => { const fr = frame; if (surface && fr !== undefined) surface.setFrame(fr); });
  $effect(() => { const t = tool; if (surface) surface.setDrawingTool(t); });
  $effect(() => { const d = drawing; if (surface) surface.setDrawingEnabled(d); });
  $effect(() => { const s = selected; if (controller && s !== controller.selected) controller.select(s); emitRect(); });
  // A Section's camera target (not an annotation) → fit the region. Read `focus` first (dep-tracking gotcha).
  $effect(() => { const f = focus; if (f && surface) surface.fitRegion(f); });

  onDestroy(() => { offViewport?.(); controller?.destroy(); });
</script>

<div class="archie-canvas-wrap">
  <div bind:this={el} class="archie-canvas"></div>
  {#if status !== "ready"}
    <div class="overlay" class:error={status === "error"}>
      {#if status === "loading"}
        <span class="dot"></span><span>Loading the object…</span>
      {:else}
        <span class="warn">⚠</span><span>{errorMsg}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .archie-canvas-wrap { position: relative; width: 100%; height: 100%; }
  .archie-canvas { width: 100%; height: 100%; }
  /* Markers need a shadow to stay recognizable on LIGHT surfaces (light folios/paper) — the thin
     stroke alone vanishes against pale parchment. A subtle drop-shadow on the SVG shape group. */
  :global(.a9s-annotationlayer .a9s-annotation) { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55)); }
  /* Loading / error states over the light table (system.md §Reader States). */
  .overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: var(--surface-canvas, #181714); color: var(--ink-canvas-secondary, #a09b8e);
    font-family: var(--font-ui, system-ui), sans-serif; font-size: 0.875rem; letter-spacing: 0.02em;
  }
  .overlay.error { color: var(--accent, #c44536); }
  .warn { font-size: 1.1rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #c44536); animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
