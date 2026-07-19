// createMount — the OSD + Annotorious wiring (spike-0001 module 1; ADR-0002 / Q-2).
//
// Delaminated from anvil viewer.ts:80-210 (the createViewer factory). The behavioral change
// vs anvil: selection reactivity is INVERTED out of Svelte $effect/$state into the imperative
// MountSurface (setSelected) + an onSelect callback the adapter owns. fitBounds dispatch goes
// through the pure applyFitBounds oracle (handles polygon→bbox, which OSD goToTarget can't).
//
// NOTE (presentation): the consuming app imports the Annotorious CSS (app-bundle concern):
//   import '@annotorious/openseadragon/annotorious-openseadragon.css';
//   import '@annotorious/plugin-tools/annotorious-plugin-tools.css';
// They are intentionally NOT imported here so @render/mount stays a pure-TS, node-importable lib.

import OpenSeadragon from "openseadragon";
import { createOSDAnnotator, W3CImageFormat, UserSelectAction } from "@annotorious/openseadragon";
import type { ImageAnnotation, W3CImageAnnotation, DrawingStyle, DrawingStyleExpression } from "@annotorious/openseadragon";
import { mountPlugin } from "@annotorious/plugin-tools";
import { resolveTileSource, isDegenerateSelectorValue, selectorOf, selectorBBox, regionPixelRect } from "@render/core";
import { dispatchFitBounds, applyFitBounds, clampedFitRect, type FitOptions, type ViewportLike } from "./fitbounds.js";
import { createFrameOverlay, type FrameViewerLike } from "./frame-overlay.js";
import { GestureGuard } from "./gesture-guard.js";
import { zoomBand } from "./zoom-band.js";
import { imageToNavigatorPixel, type NavigatorDot } from "./marker-dots.js";
import { xyzTileSource } from "./xyz.js";
import { dziOsdSource } from "./dzi.js";
import type { W3CSelector, TileSourceDescriptor } from "@render/core";
import type { MountSurface, SelectionId, FrameOverlay } from "./surface.js";

/** Plain fit (no sidebar reservation) — used when the adapter supplies no fit options. */
const PLAIN_FIT: FitOptions = { containerW: 0, sidebarW: 0, sidebarIsSheet: true, detailOpen: false };

export interface MountOptions {
  /** Image URL or IIIF source to LOAD into the viewer (classified by resolveTileSource — ADR-0004). */
  source: string;
  /**
   * A structured tile-source descriptor (geo-annotation extension; DESIGN.md). When present (an xyz map)
   * it CLASSIFIES the surface — OSD mounts a bounded slippy-map pixel raster instead of the `source` string
   * (which a `{z}/{x}/{y}` template could not classify; DESIGN.md R1). Annotations still target `canvasId`.
   */
  tileSource?: TileSourceDescriptor;
  /**
   * The canvas IRI annotations TARGET (the W3C adapter's source identity). Distinct from the
   * image `source` — annotations reference the Canvas, OSD loads the image. Defaults to `source`.
   */
  canvasId?: string;
  /** Fired on user selection (the inversion of anvil's $effect). */
  onSelect?: (id: SelectionId | null) => void;
  /** Adapter-supplied current sidebar state for fitBounds reservation (reactivity stays in the adapter). */
  getFitOptions?: () => FitOptions;
  drawingEnabled?: boolean;
  /** Worklist 1.1: show the locator mini-map (OSD navigator, bottom-right, auto-fading) — the
   *  viewport-within-image answer to "where am I at 8×?". Off by default (opt-in per surface). */
  locator?: boolean;
}

/**
 * The degenerate-guard's selector-value extractor. INTENTIONALLY DISTINCT from core's `selectorOf`
 * — they are NOT interchangeable and this is not a dedup candidate:
 *   - `selectorValue` returns the raw `value` STRING for ANY single selector regardless of `type`
 *     (the guard only asks "is this geometry empty/NaN?", which is type-agnostic).
 *   - `selectorOf` returns a typed `{type,value}` OBJECT only for Fragment/Svg, and dereferences
 *     ARRAY selectors via `[0]`.
 * Swapping in `selectorOf` would change the guard: array-shaped selectors (→ undefined here, but a
 * resolved value there) and non-Fragment/Svg single selectors (→ their string here, null there)
 * would feed `isDegenerateSelectorValue` differently. Characterized in mount-guard.test.ts.
 */
export function selectorValue(a: unknown): string | undefined {
  const v = (a as { target?: { selector?: { value?: unknown } } })?.target?.selector?.value;
  return typeof v === "string" ? v : undefined;
}

/**
 * Mount an OSD deep-zoom surface with an Annotorious annotator over `container`. Resolves once
 * the image has opened. Returns the imperative MountSurface (fitBounds/setSelected/destroy/onSelect).
 */
export async function createMount(container: HTMLElement, opts: MountOptions): Promise<MountSurface> {
  // A structured tileSource descriptor (a map) classifies the surface; else the source string (ADR-0004).
  const ts = resolveTileSource(opts.tileSource ?? opts.source);
  const tileSources =
    ts.kind === "image" ? { type: "image", url: ts.url }
    : ts.kind === "xyz" ? xyzTileSource(ts)
    : ts.kind === "dzi" ? dziOsdSource(ts) // a baked Deep Zoom pyramid (Q-9) — OSD reads it natively
    : ts.infoUrl;
  // Annotation target identity: the canvas IRI if given, else the loaded image url (a map MUST set canvasId
  // — its tile template is not a canvas IRI; DESIGN.md canvas-identity note — so fall back to the source).
  // A dzi pyramid has no single image url either (its bytes are tiles), so it also falls back to the source.
  const sourceIRI = opts.canvasId ?? (
    ts.kind === "image" ? ts.url
    : ts.kind === "xyz" || ts.kind === "dzi" ? opts.source
    : ts.infoUrl);

  const viewer = OpenSeadragon({
    element: container,
    tileSources,
    // Remote IIIF (e.g. iiif.archive.org) is cross-origin: without a crossOrigin request the tile images
    // taint the canvas and OSD's WebGL drawer refuses to paint them ("WebGL cannot be used to draw this
    // TiledImage because it has tainted data"). 'Anonymous' makes the requests CORS so WebGL can draw —
    // same-origin/blob: sources are unaffected; a (rare) non-CORS server then fails to load rather than
    // load-but-taint, which is no worse than the silent blank it produced before.
    crossOriginPolicy: "Anonymous",
    // Slow institutional IIIF backends were hitting the 30s default and dropping tiles — give them longer.
    timeout: 60000,
    showNavigationControl: false,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
    immediateRender: true,
    maxZoomPixelRatio: 16, // fine-mark placement (anvil viewer.ts:94)
    minZoomImageRatio: 0.5,
    // Worklist 1.1: the locator mini-map (verified openseadragon@5.0.1 options — showNavigator/
    // navigatorPosition/navigatorSizeRatio/navigatorAutoFade).
    ...(opts.locator ? { showNavigator: true, navigatorPosition: "BOTTOM_RIGHT", navigatorSizeRatio: 0.15, navigatorAutoFade: true } : {}),
  });

  await new Promise<void>((resolve, reject) => {
    viewer.addOnceHandler("open", () => resolve());
    viewer.addOnceHandler("open-failed", (e: { message?: string }) => {
      console.error("[@render/mount] OpenSeadragon open-failed:", e.message ?? "unknown");
      reject(new Error("Couldn't load this media item."));
    });
  });

  // Bounded Map extent (ADR-0015, Option A): the tile source is the whole world; constrain the VIEWPORT to
  // the authored region so the reader opens framed and can't pan/zoom out past `bounds`. World pixels are
  // bounds-independent, so annotation pixel selectors never move when the extent changes. The tile-URL math
  // stays the verified whole-world path (R8-free). [browser-verify-owed: OSD pan/zoom runtime behavior.]
  // The bounded extent in VIEWPORT coords, shared with the surface's fitBounds so a note-fit lands
  // clamped-in-region in one motion (null = unbounded image/world map → plain fit). [SNAG fix: the
  // separate animation-finish clamp used to yank the camera OFF a just-fit note.]
  let mapRegion: { x: number; y: number; w: number; h: number } | null = null;
  if (ts.kind === "xyz" && ts.bounds) {
    const r = regionPixelRect(ts); // region rectangle in WORLD image pixels
    const region = viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(r.x, r.y, r.w, r.h));
    mapRegion = { x: region.x, y: region.y, w: region.width, h: region.height };
    viewer.viewport.fitBounds(region, true); // open framed on the region
    const minZoom = viewer.viewport.getZoom(true); // the region-fit zoom = the floor for zooming out
    // Soft constraint: once a gesture settles, floor the zoom and nudge the centre back so the view stays
    // within the region. Each branch acts only when out of bounds, so the clamp converges (no event loop).
    const clampToRegion = (): void => {
      if (viewer.viewport.getZoom() < minZoom - 1e-9) {
        viewer.viewport.zoomTo(minZoom, undefined, true); // can't zoom out past the framed region
        return; // the next settle pass handles panning
      }
      const b = viewer.viewport.getBounds();
      const c = viewer.viewport.getCenter();
      let cx = c.x;
      let cy = c.y;
      if (b.width <= region.width) cx = Math.min(region.x + region.width - b.width / 2, Math.max(region.x + b.width / 2, c.x));
      if (b.height <= region.height) cy = Math.min(region.y + region.height - b.height / 2, Math.max(region.y + b.height / 2, c.y));
      if (Math.abs(c.x - cx) > 1e-9 || Math.abs(c.y - cy) > 1e-9) viewer.viewport.panTo(new OpenSeadragon.Point(cx, cy), true);
    };
    viewer.addHandler("animation-finish", clampToRegion);
  }

  // Map-aware fit: zoom to an image-pixel box but land it CLAMPED inside the region in one motion, so
  // the animation-finish clamp above finds nothing to correct (no second pan that shoves the note off
  // centre). Only called when mapRegion is set (a bounded map); the image path uses dispatchFitBounds.
  const fitBoxOnMap = (box: { x: number; y: number; w: number; h: number }): void => {
    if (!mapRegion) return;
    const vr = viewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(box.x, box.y, box.w, box.h));
    const fit = clampedFitRect({ x: vr.x, y: vr.y, w: vr.width, h: vr.height }, viewer.viewport.getAspectRatio(), mapRegion);
    viewer.viewport.fitBounds(new OpenSeadragon.Rect(fit.x, fit.y, fit.w, fit.h), false);
  };

  // Current zoom / home zoom — the ONE place this ratio is computed, shared by the zoom-band stamp
  // below and getZoomRatio (Archie-93fd scale cue) so the two never drift apart.
  const zoomRatio = () => viewer.viewport.getZoom(true) / viewer.viewport.getHomeZoom();

  // Worklist 1.1 (scale-aware marks): stamp the coarse zoom band on the container so CSS can
  // weight markers by distance (far = fit-width presence, near = recede while inside a mark).
  // Screen-space channels only (opacity / drop-shadow) — stroke-width is inline-set per shape by
  // the style expression and lives in scaled coordinates, so CSS must not fight it.
  const updateZoomBand = () => {
    const band = zoomBand(zoomRatio());
    if (container.dataset.archieZoom !== band) container.dataset.archieZoom = band;
  };
  viewer.addHandler("zoom", updateZoomBand);
  updateZoomBand();

  // Quick path to fit (zoom level 0): five consecutive zoom-OUT wheel notches snap the viewport home.
  // OSD's canvas-scroll `scroll` is the wheel delta (positive = zoom in, negative = zoom out; it normalizes
  // rapid devices via minScrollDeltaTime, so one event ≈ one notch). A zoom-IN notch breaks the streak, so
  // it only fires on a deliberate run of scroll-outs. For a bounded map, "home" is the authored region.
  let outNotches = 0;
  viewer.addHandler("canvas-scroll", (e: { scroll?: number }) => {
    if ((e.scroll ?? 0) >= 0) { outNotches = 0; return; } // zoom-in (or a no-op) resets the streak
    if (++outNotches < 5) return;
    outNotches = 0;
    if (mapRegion) viewer.viewport.fitBounds(new OpenSeadragon.Rect(mapRegion.x, mapRegion.y, mapRegion.w, mapRegion.h), false);
    else viewer.viewport.goHome(false);
  });

  const annotator = createOSDAnnotator<ImageAnnotation, W3CImageAnnotation>(viewer, {
    adapter: W3CImageFormat(sourceIRI),
    drawingEnabled: opts.drawingEnabled ?? false,
    // SELECT (not EDIT): clicking fires selectionChanged for the sidebar sync without entering
    // shape-edit mode (anvil viewer.ts:108-111).
    userSelectAction: UserSelectAction.SELECT,
  });

  mountPlugin(annotator);

  // Reactivity inverted into explicit listener sets (the spike module-1 change). Each lifecycle
  // event the editor needs (select / create / update / delete) flows OUT through a callback set.
  const selectL = new Set<(id: SelectionId | null) => void>();
  const createL = new Set<(a: W3CImageAnnotation) => void>();
  const updateL = new Set<(a: W3CImageAnnotation) => void>();
  const deleteL = new Set<(id: SelectionId) => void>();

  // Degenerate-gesture guard (worklist 0.2) — REPLACES the anvil state.store monkey-patch. The
  // decision logic lives in the pure, tested GestureGuard; this block only actuates it through the
  // PUBLIC API (removeAnnotation / updateAnnotation), so no undocumented internals are touched.
  // Net contract is unchanged: listeners (and therefore the append-only log) never see a
  // degenerate gesture; the log stays the one writer of annotation state.
  const guard = new GestureGuard();

  annotator.on("selectionChanged", (selected: W3CImageAnnotation[]) => {
    const id = (selected[0] as { id?: string } | undefined)?.id ?? null;
    for (const l of selectL) l(id);
  });
  annotator.on("createAnnotation", (a: W3CImageAnnotation) => {
    const id = (a as { id?: string }).id;
    const decision = guard.onCreate(id, isDegenerateSelectorValue(selectorValue(a)));
    if (decision === "remove") {
      console.warn("[@render/mount] removed degenerate draw (empty/NaN geometry)", a);
      if (id !== undefined) annotator.removeAnnotation(id);
      return;
    }
    for (const l of createL) l(a);
  });
  annotator.on("updateAnnotation", (a: W3CImageAnnotation, previous: W3CImageAnnotation) => {
    const id = (a as { id?: string }).id;
    const decision = guard.onUpdate(id, isDegenerateSelectorValue(selectorValue(a)));
    if (decision === "revert") {
      console.warn("[@render/mount] reverted degenerate geometry edit (restored previous shape)", a);
      if (id !== undefined) annotator.updateAnnotation(previous);
      return;
    }
    if (decision === "swallow") return; // the echo of our own restore — listeners already hold this state
    for (const l of updateL) l(a);
  });
  annotator.on("deleteAnnotation", (a: W3CImageAnnotation) => {
    const id = (a as { id?: string }).id;
    if (guard.onDelete(id) === "swallow") return; // the echo of our own degenerate-draw removal
    if (id !== undefined) for (const l of deleteL) l(id);
  });
  if (opts.onSelect) selectL.add(opts.onSelect);

  const subscribe = <T>(set: Set<T>, cb: T): (() => void) => {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  };

  // Coverage-border overlay (7e1f) — a standalone rendering concern (createFrameOverlay). It frames the
  // WHOLE OBJECT: the SVG is added as an OSD overlay at the image's bounds, so it tracks the object through
  // pan/zoom (not a fixed viewport border). setFrame re-draws (replacing any current frame); null clears it.
  // FrameViewerLike is deliberately a minimal duck-typed capability (frame-overlay.ts stays
  // decoupled from OSD's concrete Point/Rect/OverlayOptions types); OSD's real Viewer satisfies it
  // at runtime (addOverlay takes {element, location}) but its own types are narrower/wider than
  // the duck type in ways TS can't verify structurally — asserted once here, at the wiring point.
  const frameOverlay = createFrameOverlay(viewer as unknown as FrameViewerLike);

  // Navigator note-dots (Archie-c1d9) — tiny dots INSIDE the OSD navigator marking where each note
  // lives on the whole image. Appended as CHILDREN of the navigator element so they inherit its
  // position AND its auto-fade (a sibling fixed layer would float on over a faded navigator). The
  // navigator shows the whole image aspect-fit, so a note's image-space centre maps via the pure
  // imageToNavigatorPixel letterbox fit; positions are static in navigator space (recomputed on
  // resize / annotation change, not per pan frame). Colour = the note's Reading hue.
  let navDots: NavigatorDot[] = [];
  const navDotEls = new Map<string, HTMLElement>();
  const navigatorEl = (): HTMLElement | undefined =>
    (viewer as unknown as { navigator?: { element?: HTMLElement } }).navigator?.element ?? undefined;
  const renderNavDots = (): void => {
    const navEl = navigatorEl();
    if (!navEl) return; // locator off — nothing to plot into
    const item = viewer.world.getItemAt(0);
    const size = item?.getContentSize?.();
    const navW = navEl.clientWidth, navH = navEl.clientHeight;
    // Reconcile: drop dot els no longer in the set.
    for (const [id, el] of navDotEls) {
      if (!navDots.some((d) => d.id === id)) { el.remove(); navDotEls.delete(id); }
    }
    if (!size) return; // image not painted yet — re-render fires again on open/resize
    const anns = annotator.getAnnotations() as Array<{ id?: string; target?: { selector?: { value?: string } } }>;
    for (const d of navDots) {
      const v = anns.find((a) => a.id === d.id)?.target?.selector?.value;
      const box = v ? selectorBBox({ type: v.includes("<") ? "SvgSelector" : "FragmentSelector", value: v } as W3CSelector) : null;
      const px = box
        ? imageToNavigatorPixel({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, { w: size.x, h: size.y }, { w: navW, h: navH })
        : null;
      let el = navDotEls.get(d.id);
      if (!px) { if (el) { el.remove(); navDotEls.delete(d.id); } continue; } // whole-object/bare-IRI note → no dot
      if (!el) {
        el = document.createElement("div");
        el.className = "archie-nav-dot";
        el.setAttribute("aria-hidden", "true");
        // Inline-styled (the mount is a CSS-free lib, and these live in OSD's navigator DOM where the
        // app's stylesheet can't reach): a tiny centred dot with a hairline ring for contrast on any tile.
        Object.assign(el.style, {
          position: "absolute",
          pointerEvents: "none",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
          zIndex: "20",
        } as Partial<CSSStyleDeclaration>);
        navEl.appendChild(el);
        navDotEls.set(d.id, el);
      }
      el.style.left = `${px.x}px`;
      el.style.top = `${px.y}px`;
      el.style.background = d.colour;
    }
  };
  // The navigator re-lays-out on viewer resize; note dots are otherwise static (whole-image map).
  viewer.addHandler("resize", renderNavDots);

  // Shared rect math for markerScreenRect(s): selector bbox in image px → viewer-element coords +
  // the container's page offset, so a position:fixed anchor works regardless of layout (ADR-0006).
  const rectFromSelectorValue = (
    v: string | undefined,
    o: { left: number; top: number },
  ): { left: number; top: number; right: number; bottom: number } | null => {
    if (!v) return null;
    const box = selectorBBox({ type: v.includes("<") ? "SvgSelector" : "FragmentSelector", value: v } as W3CSelector);
    if (!box) return null;
    const tl = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(box.x, box.y));
    const br = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(box.x + box.w, box.y + box.h));
    return { left: tl.x + o.left, top: tl.y + o.top, right: br.x + o.left, bottom: br.y + o.top };
  };

  let disposed = false;
  return {
    setAnnotations(annotations) {
      // Replace the in-store set (anvil viewer pattern: setAnnotations(_, true)). New sessions can't
      // hold degenerates (the log boundary rejects them — core session), but a LEGACY persisted log
      // might: filter those out LOUDLY so the SVG layer never renders NaN geometry. The note still
      // shows in the host's list (it reads the log) — visible divergence beats a silent one.
      const ok = (annotations as Array<{ id?: string }>).filter((a) => {
        if (!isDegenerateSelectorValue(selectorValue(a))) return true;
        console.warn(`[@render/mount] legacy log record ${String(a.id)} has degenerate geometry — marker not rendered`, a);
        return false;
      });
      // The MountSurface contract takes W3CAnnotation[]; the OSD annotator's external model is
      // W3CImageAnnotation. setAnnotations accepts Partial<E>[] (replace mode) — a WADM record that
      // omits optional fields is still a valid partial. Narrow to that instead of erasing the type.
      annotator.setAnnotations(ok as Partial<W3CImageAnnotation>[], true);
      renderNavDots(); // note positions may have moved — reconcile the navigator dots
    },
    setStyle(styleFor) {
      // Wire a per-annotation style to Annotorious's DrawingStyleExpression<ImageAnnotation>: it
      // passes the parsed internal annotation; we key by its id and let the adapter map id → Reading
      // colour (ADR-0007). The expression's typed shape — (ann, state?) => DrawingStyle | undefined.
      const expr: DrawingStyleExpression<ImageAnnotation> | undefined = styleFor
        ? (ann: ImageAnnotation) => styleFor(String(ann.id ?? "")) as DrawingStyle | undefined
        : undefined;
      // MarkerStyle is structurally a DrawingStyle but with plain `string` fill/stroke (vs the
      // Color template-literal); the single narrowing cast above is the only boundary type assertion.
      annotator.setStyle(expr);
    },
    fitBounds(id: SelectionId) {
      const anns = annotator.getAnnotations() as W3CImageAnnotation[];
      if (mapRegion) {
        // Bounded map: land the note clamped-in-region in one motion (no animation-finish yank).
        const sel = selectorOf(anns.find((a) => (a as { id?: string }).id === id));
        const box = sel ? selectorBBox(sel) : null;
        if (box) fitBoxOnMap(box);
        return;
      }
      // Image path: the same dispatchFitBounds oracle the gate test pins.
      dispatchFitBounds(viewer.viewport as unknown as ViewportLike, anns, id, opts.getFitOptions?.() ?? PLAIN_FIT);
    },
    fitRegion(fragment: string) {
      // Fit an arbitrary region fragment (a Section's camera target — NOT an annotation). Same oracle
      // as fitBounds, but the selector is built from the fragment directly. `t=...` → fitBoundsRect null → no-op.
      const selector = { type: "FragmentSelector", value: fragment } as W3CSelector;
      if (mapRegion) {
        const box = selectorBBox(selector);
        if (box) fitBoxOnMap(box);
        return;
      }
      applyFitBounds(viewer.viewport as unknown as ViewportLike, selector, opts.getFitOptions?.() ?? PLAIN_FIT);
    },
    setSelected(id: SelectionId | null) {
      if (id === null) annotator.cancelSelected();
      else annotator.setSelected(id);
    },
    setFrame(frame: FrameOverlay | null) {
      if (frame === null) frameOverlay.clear();
      else frameOverlay.draw(frame);
    },
    setNavigatorDots(dots: NavigatorDot[]) {
      navDots = dots;
      renderNavDots();
    },
    setDrawingEnabled(enabled: boolean) {
      annotator.setDrawingEnabled(enabled);
    },
    setDrawingTool(tool) {
      annotator.setDrawingTool(tool);
    },
    markerScreenRect(id) {
      // Compute from the PUBLIC annotation list + core geometry (NOT Annotorious internals — that store
      // lookup proved fragile). Find the W3C annotation by id, take its selector bbox (rect or polygon via
      // core selectorBBox), convert image px → VIEWPORT px (element coords + the OSD container's page offset)
      // so a position:fixed popover anchors to the marker regardless of layout (ADR-0006).
      try {
        const anns = annotator.getAnnotations() as Array<{ id?: string; target?: { selector?: { value?: string } } }>;
        return rectFromSelectorValue(anns.find((a) => a.id === id)?.target?.selector?.value, viewer.element.getBoundingClientRect());
      } catch {
        return null;
      }
    },
    markerScreenRects(ids) {
      // Cut A (worklist 2.1): the marginalia layout's per-frame input — ONE offset read + ONE pass
      // over the public annotation list for ALL requested markers. Unresolvable ids stay null.
      const out: Record<string, { left: number; top: number; right: number; bottom: number } | null> = {};
      for (const id of ids) out[id] = null;
      if (ids.length === 0) return out;
      try {
        const o = viewer.element.getBoundingClientRect();
        const want = new Set<string>(ids);
        const anns = annotator.getAnnotations() as Array<{ id?: string; target?: { selector?: { value?: string } } }>;
        for (const a of anns) {
          if (a.id === undefined || !want.has(a.id)) continue;
          out[a.id] = rectFromSelectorValue(a.target?.selector?.value, o);
        }
      } catch { /* leave the nulls — same degrade contract as markerScreenRect */ }
      return out;
    },
    onViewportChange(cb) {
      viewer.addHandler("update-viewport", cb);
      return () => viewer.removeHandler("update-viewport", cb);
    },
    getZoomRatio() {
      return zoomRatio();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      frameOverlay.clear();
      for (const el of navDotEls.values()) el.remove();
      navDotEls.clear();
      selectL.clear();
      createL.clear();
      updateL.clear();
      deleteL.clear();
      annotator.destroy();
      viewer.destroy();
    },
    onSelect: (cb) => subscribe(selectL, cb),
    onCreate: (cb) => subscribe(createL, cb as (a: W3CImageAnnotation) => void),
    onUpdate: (cb) => subscribe(updateL, cb as (a: W3CImageAnnotation) => void),
    onDelete: (cb) => subscribe(deleteL, cb),
  };
}
