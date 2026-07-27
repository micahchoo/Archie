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
import { dispatchFitBounds, applyFitBounds, clampedFitRect, type ViewportLike } from "./fitbounds.js";
import { createFrameOverlay, type FrameViewerLike } from "./frame-overlay.js";
import { createSelectionHalo, type HaloViewerLike } from "./selection-halo.js";
import { applyCanvasA11y, type A11yViewerLike } from "./canvas-a11y.js";
import { GestureGuard } from "./gesture-guard.js";
import { zoomBand } from "./zoom-band.js";
import { imageToNavigatorPixel, type NavigatorDot } from "./marker-dots.js";
import { xyzTileSource } from "./xyz.js";
import { dziOsdSource } from "./dzi.js";
import type { W3CSelector, TileSourceDescriptor, TileSource, AnnotationLike } from "@render/core";
import type { MountSurface, SelectionId, FrameOverlay, MarkerStyle } from "./surface.js";

/** Plain fit (no sidebar reservation) — used when the adapter supplies no fit options. */

/** The tileSources shape OpenSeadragon accepts (string URL, a `{type}`/custom config, or a parsed
 *  info.json object). Captured from OSD's own option type so the resolver stays byte-compatible. */
type OsdTileSourceInput = NonNullable<Parameters<typeof OpenSeadragon>[0]["tileSources"]>;

/**
 * The native-fetch escape hatch the packaged desktop app (Tauri) injects. The webview's own fetch fails
 * on CORS-restricted / cross-origin-redirecting hosts; these two calls route through Tauri's native http
 * instead. Absent on the web (and in every unit test) — the mount then uses the plain webview loader,
 * byte-identical to before. The mount NEVER imports `@tauri-apps/*`; the studio supplies the concrete
 * implementation (apps/studio/src/tauri-fs.ts) and passes it down as an option.
 */
export interface NativeFetch {
  /** Pull remote image bytes natively → a same-origin `blob:` URL (caller owns revoking it). */
  toBlobUrl(url: string): Promise<string>;
  /** Fetch + parse a remote JSON document natively (a IIIF `info.json`). */
  json(url: string): Promise<unknown>;
}

/** What resolveOsdTileSources hands back: the OSD input, plus any `blob:` URL it minted (so the caller
 *  revokes it on destroy — null when nothing was minted). */
export interface ResolvedTileSources {
  tileSources: OsdTileSourceInput;
  ownedBlobUrl: string | null;
}

/**
 * Resolve the OSD `tileSources` input for a classified source, routing remote images + IIIF info.json
 * through the injected native fetcher when present (desktop). Extracted from createMount so it's unit
 * testable without a real OSD/DOM (mount-fetch.test.ts).
 *
 * - `image` (a plain remote http(s) image): fetch the bytes natively → a same-origin `blob:` URL, so OSD
 *   `<img>`-loads same-origin bytes — no webview CORS, no WebGL taint. The minted URL is returned to revoke.
 * - `iiif`: fetch + parse `info.json` natively and hand OSD the parsed object as a DATA tile source
 *   (OSD's determineType → IIIFTileSource). This restores the OPEN of an info.json a webview XHR can't
 *   reach (302 / CORS). IIIF **tiles** deliberately stay on the webview `<img>` loader: a native per-tile
 *   fetch would cost one Tauri IPC round-trip per tile — dozens per deep-zoom viewport — for bytes the
 *   webview already fetches from any CORS-open tile host. A host that also blocks tile `<img>` CORS is a
 *   documented gap, not a regression (the pre-existing crossOriginPolicy behavior is unchanged).
 * - `xyz` / `dzi`: unchanged — a template slippy-map / a local baked pyramid, neither has the webview-CORS
 *   problem the native fetcher solves.
 *
 * A native-fetch throw is swallowed to the webview path, so the desktop result is never WORSE than web.
 */
export async function resolveOsdTileSources(
  ts: TileSource,
  nativeFetch?: NativeFetch,
): Promise<ResolvedTileSources> {
  if (nativeFetch) {
    try {
      if (ts.kind === "image" && /^https?:\/\//i.test(ts.url)) {
        const blob = await nativeFetch.toBlobUrl(ts.url);
        return { tileSources: { type: "image", url: blob }, ownedBlobUrl: blob };
      }
      if (ts.kind === "iiif" && /^https?:\/\//i.test(ts.infoUrl)) {
        const info = (await nativeFetch.json(ts.infoUrl)) as OsdTileSourceInput;
        return { tileSources: info, ownedBlobUrl: null };
      }
    } catch (e) {
      console.warn("[@render/mount] native fetch failed; falling back to the webview loader", e);
    }
  }
  const tileSources: OsdTileSourceInput =
    ts.kind === "image" ? { type: "image", url: ts.url }
    : ts.kind === "xyz" ? xyzTileSource(ts)
    : ts.kind === "dzi" ? dziOsdSource(ts) // a baked Deep Zoom pyramid (Q-9) — OSD reads it natively
    : ts.infoUrl;
  return { tileSources, ownedBlobUrl: null };
}

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
  drawingEnabled?: boolean;
  /** Worklist 1.1: show the locator mini-map (OSD navigator, bottom-right, auto-fading) — the
   *  viewport-within-image answer to "where am I at 8×?". Off by default (opt-in per surface). */
  locator?: boolean;
  /** Desktop-only (Tauri) native-fetch escape hatch — see NativeFetch. When present, a remote image is
   *  pulled to a same-origin `blob:` URL and a IIIF info.json is fetched + parsed natively, so a
   *  CORS-restricted / redirecting host still opens. Absent on web → the plain webview loader, unchanged. */
  nativeFetch?: NativeFetch;
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
  // On desktop a remote image / IIIF info.json is pulled through the native fetcher (webview-CORS bypass);
  // `ownedBlobUrl` is any blob: URL minted for a remote image, revoked on destroy. Web/tests: webview path.
  const { tileSources, ownedBlobUrl } = await resolveOsdTileSources(ts, opts.nativeFetch);
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
    // RESIZE BEHAVIOUR IS OSD'S DEFAULT, AND THAT IS NOW A CHOICE RATHER THAN AN OVERSIGHT
    // (human ruling, 2026-07-26 — ADR-0019's layout row). We set no `autoResize` and no
    // `preserveImageSizeOnResize`, and nothing here re-fits on a container change (the one `resize`
    // handler below only repositions navigator dots). So when the docked note row opens or closes,
    // the canvas changes height and OSD re-centres: the image TRANSLATES by half the delta and its
    // on-screen size is unchanged.
    //
    // That is deliberate. Dismissing a note gives its height back to the image, because the reader
    // dismissed it in order to see more image; the alternative — reserving the row permanently — is a
    // flat ~141px (25% of the canvas at 1280x720) paid in the common case where no note is open.
    //
    // `preserveImageSizeOnResize: true` was measured and REJECTED: it preserves size, not anchor, so
    // holding the scale across the growth forces a zoom change and moves the mark further. Over 20
    // runs of `selection.spec.ts`'s real-click assertion it took 17/20 passing to 9/20. If you are
    // here to stop the image moving, an ANCHOR-preserving resize (pin the top-left, extend downward)
    // is the unexplored option — not this one. `selection.spec.ts` pins the current behaviour.

    // Worklist 1.1: the locator mini-map (verified openseadragon@5.0.1 options — showNavigator/
    // navigatorPosition/navigatorSizeRatio/navigatorAutoFade).
    ...(opts.locator ? { showNavigator: true, navigatorPosition: "BOTTOM_RIGHT", navigatorSizeRatio: 0.15, navigatorAutoFade: true } : {}),
  });

  // V90 (Archie-3d55) — name the canvas IMMEDIATELY, before the open await below. OSD builds its
  // canvas div in the constructor, so there is nothing to wait for; and doing it here means the stop
  // is named even when the open later FAILS, which is the state a reader is most likely to be stuck
  // tabbing through. (The Annotorious layer is a separate call after the annotator exists — it isn't
  // in the DOM yet.)
  applyCanvasA11y(viewer as unknown as A11yViewerLike);

  try {
    await new Promise<void>((resolve, reject) => {
      viewer.addOnceHandler("open", () => resolve());
      viewer.addOnceHandler("open-failed", (e: { message?: string }) => {
        console.error("[@render/mount] OpenSeadragon open-failed:", e.message ?? "unknown");
        reject(new Error("Couldn't load this media item."));
      });
    });
  } catch (e) {
    // Open failed: createMount rejects and the caller never gets a surface to destroy(), so release the
    // resources minted BEFORE the open here — the native-fetched image blob (else it orphans the full
    // remote bytes) and the viewer itself (pre-existing leak on open-fail, closed in the same breath).
    if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl);
    viewer.destroy();
    throw e;
  }

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
    selectedHaloId = id;
    paintHalo(id); // Archie-52a0 — the ring follows the USER's selection, not just setSelected's
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
    // A drag on the SELECTED mark moves the geometry the ring is anchored to; repaint or it
    // detaches and sits over the shape's old position.
    if (id !== undefined && id === selectedHaloId) paintHalo(id);
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
  // V90 (Archie-3d55) — name the OSD canvas, drop Annotorious's decorative layers out of the tab
  // order. Applied after the annotator exists (its layer is only in the DOM by then), and again on
  // `open`, because Annotorious rebuilds its layer when the image changes.
  applyCanvasA11y(viewer as unknown as A11yViewerLike);
  viewer.addHandler("open", () => applyCanvasA11y(viewer as unknown as A11yViewerLike));

  const frameOverlay = createFrameOverlay(viewer as unknown as FrameViewerLike);

  // Selection halo (Archie-52a0) — the ring that says WHICH mark is open. A third overlay layer
  // because neither renderer's style channel can express two strokes (selection-halo.ts's header).
  // `styleFor` is retained here solely so the halo can read the selected mark's own colour and pick
  // a contrasting ink; without it the halo still draws, just with the neutral white default.
  const halo = createSelectionHalo(viewer as unknown as HaloViewerLike);
  let styleForFn: ((id: SelectionId) => MarkerStyle | undefined) | undefined;
  let selectedHaloId: SelectionId | null = null;
  const paintHalo = (id: SelectionId | null): void => {
    if (id === null) { halo.hide(); return; }
    const anns = annotator.getAnnotations() as unknown as AnnotationLike[];
    // A whole-object note has no region geometry — showFor clears and returns false, leaving the
    // object FRAME as that note's indicator (frame-overlay.ts). Correct, not a miss.
    halo.showFor(anns, id, styleForFn?.(id)?.stroke);
  };

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
      // The ring is anchored to a geometry that may have just been replaced or removed. Repaint
      // against the NEW list rather than leaving a halo floating over a mark that no longer exists.
      paintHalo(selectedHaloId);
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
      // Retained for the halo's contrast choice (Archie-52a0): the reading colour it must not
      // spend. Repaint so a reading recolour is reflected in the ring's inner line immediately.
      styleForFn = styleFor;
      paintHalo(selectedHaloId);
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
      dispatchFitBounds(viewer.viewport as unknown as ViewportLike, anns, id, {});
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
      applyFitBounds(viewer.viewport as unknown as ViewportLike, selector, {});
    },
    setSelected(id: SelectionId | null) {
      if (id === null) annotator.cancelSelected();
      else annotator.setSelected(id);
      // Painted HERE as well as in selectionChanged, deliberately: a programmatic selection is not
      // guaranteed to echo back through the annotator's event, and paintHalo is idempotent (show
      // replaces, hide is a no-op when there is nothing to remove).
      selectedHaloId = id;
      paintHalo(id);
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
      if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl); // release the native-fetched remote image
      frameOverlay.clear();
      halo.hide();
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
