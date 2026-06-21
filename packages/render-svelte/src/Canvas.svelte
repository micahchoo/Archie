<script lang="ts">
  // Thin Svelte 5 shell over @render/mount (ADR-0002 / Q-2). Binding/edit LOGIC lives in
  // createCanvasController + the @render/core AnnotationSession (both headless-tested); this
  // component only wires the surface to $state, drawing props, and lifecycle callbacks.
  // NOT in the tsc/test gate (real OSD render = browser verification).
  import { onMount, onDestroy } from "svelte";
  import { createMount, type FitOptions, type MountSurface, type DrawTool, type MarkerStyle, type FrameOverlay } from "@render/mount";
  import { commentOfAnnotation, stripMarkdown, type W3CAnnotation, type TileSourceDescriptor } from "@render/core";
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

  // a11y marker labels (Q-5): Annotorious renders each region as an SVG `.a9s-annotation[data-id=<id>]`,
  // owned deep in @render/mount — there's no per-marker label hook, so we post-pass the rendered DOM and
  // stamp accessible names. Markers are role="img" with an aria-label (the note's prose snippet) but
  // tabindex="-1": OUT of the tab order. The INDEX (note cards / section beats) is the keyboard surface —
  // tabbing to off-screen markers would be a maze. Re-run after each setAnnotations (Annotorious re-renders
  // async, so we wait one rAF). Best-effort: if the DOM/data-id contract ever changes, labels just don't
  // apply — the index keyboard path is unaffected.
  let labelRaf = 0;
  function labelMarkers() {
    if (!el || labelRaf) return;
    labelRaf = requestAnimationFrame(() => {
      labelRaf = 0;
      const byId = new Map<string, string>();
      let unlabelled = 0;
      for (const a of annotations) {
        if (!a.id) continue;
        const snippet = stripMarkdown(commentOfAnnotation(a)).trim();
        // number media-only/empty notes so a screen-reader user can tell two unlabelled marks apart (review)
        byId.set(a.id, snippet ? snippet.slice(0, 120) : `Region ${++unlabelled}`);
      }
      for (const node of el.querySelectorAll<SVGElement>(".a9s-annotation[data-id]")) {
        const id = node.getAttribute("data-id");
        const label = id ? byId.get(id) : undefined;
        if (!label) continue;
        node.setAttribute("role", "img");
        node.setAttribute("aria-label", label);
        node.setAttribute("tabindex", "-1"); // index-driven nav (Q-5): markers stay out of the tab order
      }
    });
  }

  let el: HTMLDivElement;
  let surface: MountSurface | undefined;
  let controller: CanvasController | undefined;
  let offViewport: (() => void) | undefined; // unsubscribe from OSD pan/zoom (popover re-anchor)
  let status = $state<"loading" | "ready" | "error">("loading");
  let errorMsg = $state("");

  onMount(async () => {
    try {
      surface = await createMount(el, { source, ...(tileSource ? { tileSource } : {}), ...(canvasId ? { canvasId } : {}), ...(getFitOptions ? { getFitOptions } : {}), ...(locator ? { locator } : {}) });
      surface.setAnnotations(annotations);
      labelMarkers();
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
      offViewport = surface.onViewportChange(() => { emitRect(); emitRects(); });
      emitRect();
      emitRects();
      status = "ready";
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : "Couldn't load this media item.";
    }
  });

  // Read the reactive props FIRST, before any `surface?.`/`if (surface)` guard — otherwise the
  // optional-chain short-circuits on the (async) initially-undefined surface and the effect never
  // subscribes to the prop, so it never re-runs when the prop changes (Svelte 5 dep-tracking gotcha).
  $effect(() => { const a = annotations; if (surface) { surface.setAnnotations(a); emitRect(); labelMarkers(); } });
  $effect(() => { void rectIds; void annotations; if (surface) emitRects(); });
  $effect(() => { const sf = styleOf; if (surface) surface.setStyle(sf); });
  // Coverage border (7e1f) — read `frame` first (dep-tracking gotcha); undefined = leave as-is, null clears.
  $effect(() => { const fr = frame; if (surface && fr !== undefined) surface.setFrame(fr); });
  $effect(() => { const t = tool; if (surface) surface.setDrawingTool(t); });
  $effect(() => { const d = drawing; if (surface) surface.setDrawingEnabled(d); });
  $effect(() => { const s = selected; if (controller && s !== controller.selected) controller.select(s); emitRect(); });
  // A Section's camera target (not an annotation) → fit the region. Read `focus` first (dep-tracking gotcha).
  $effect(() => { const f = focus; if (f && surface) surface.fitRegion(f); });

  onDestroy(() => { if (rectsRaf) cancelAnimationFrame(rectsRaf); if (labelRaf) cancelAnimationFrame(labelRaf); offViewport?.(); controller?.destroy(); });
</script>

<div class="archie-canvas-wrap">
  <div bind:this={el} class="archie-canvas"></div>
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
  /* Markers need a shadow to stay recognizable on LIGHT surfaces (light folios/paper) — the thin
     stroke alone vanishes against pale parchment. A subtle drop-shadow on the SVG shape group. */
  :global(.a9s-annotationlayer .a9s-annotation) { filter: drop-shadow(0 1px 2px rgba(59, 49, 56, 0.5)); }
  /* Worklist 1.1 (scale-aware marks): weight by zoom band — the mount stamps data-archie-zoom on
     the canvas root. Screen-space channels only (opacity / drop-shadow); never stroke-width (it is
     inline-set by the style expression in scaled coordinates). far = fit-width, marks need
     PRESENCE to be findable; near = inside-a-mark territory, outlines recede off the pixels. */
  :global([data-archie-zoom="far"] .a9s-annotationlayer .a9s-annotation) {
    filter: drop-shadow(0 0 3px rgba(59, 49, 56, 0.7)) drop-shadow(0 0 8px rgba(251, 246, 243, 0.4));
  }
  :global([data-archie-zoom="near"] .a9s-annotationlayer .a9s-annotation) {
    opacity: 0.45;
    transition: opacity 200ms ease;
  }
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
