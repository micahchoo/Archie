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
import type { ImageAnnotation, W3CImageAnnotation } from "@annotorious/openseadragon";
import { mountPlugin } from "@annotorious/plugin-tools";
import { resolveTileSource, isDegenerateSelectorValue, selectorBBox } from "@render/core";
import { dispatchFitBounds, applyFitBounds, type FitOptions, type ViewportLike } from "./fitbounds.js";
import type { W3CSelector } from "@render/core";
import type { MountSurface, SelectionId, FrameOverlay } from "./surface.js";

/** Plain fit (no sidebar reservation) — used when the adapter supplies no fit options. */
const PLAIN_FIT: FitOptions = { containerW: 0, sidebarW: 0, sidebarIsSheet: true, detailOpen: false };

export interface MountOptions {
  /** Image URL or IIIF source to LOAD into the viewer (classified by resolveTileSource — ADR-0004). */
  source: string;
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
}

function selectorValue(a: unknown): string | undefined {
  const v = (a as { target?: { selector?: { value?: unknown } } })?.target?.selector?.value;
  return typeof v === "string" ? v : undefined;
}

/**
 * Mount an OSD deep-zoom surface with an Annotorious annotator over `container`. Resolves once
 * the image has opened. Returns the imperative MountSurface (fitBounds/setSelected/destroy/onSelect).
 */
export async function createMount(container: HTMLElement, opts: MountOptions): Promise<MountSurface> {
  const ts = resolveTileSource(opts.source);
  const tileSources = ts.kind === "image" ? { type: "image", url: ts.url } : ts.infoUrl;
  // Annotation target identity: the canvas IRI if given, else the loaded image url.
  const sourceIRI = opts.canvasId ?? (ts.kind === "image" ? ts.url : ts.infoUrl);

  const viewer = OpenSeadragon({
    element: container,
    tileSources,
    showNavigationControl: false,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
    immediateRender: true,
    maxZoomPixelRatio: 16, // fine-mark placement (anvil viewer.ts:94)
    minZoomImageRatio: 0.5,
  });

  await new Promise<void>((resolve, reject) => {
    viewer.addOnceHandler("open", () => resolve());
    viewer.addOnceHandler("open-failed", (e: { message?: string }) =>
      reject(new Error(`OpenSeadragon failed to open image: ${e.message ?? "unknown"}`)),
    );
  });

  const annotator = createOSDAnnotator<ImageAnnotation, W3CImageAnnotation>(viewer, {
    adapter: W3CImageFormat(sourceIRI),
    drawingEnabled: opts.drawingEnabled ?? false,
    // SELECT (not EDIT): clicking fires selectionChanged for the sidebar sync without entering
    // shape-edit mode (anvil viewer.ts:108-111).
    userSelectAction: UserSelectAction.SELECT,
  });

  // Degenerate-selector store guard — carried verbatim from anvil viewer.ts:123-157. The cast
  // reaches Annotorious's undocumented internal state.store; the warn fallback is the one place
  // an Annotorious upgrade can silently break the guard. Uses core's pure isDegenerateSelectorValue.
  const store = (
    annotator as unknown as {
      state?: {
        store?: {
          addAnnotation: (a: unknown, o?: unknown) => void;
          upsertAnnotation: (a: unknown, o?: unknown) => void;
        };
      };
    }
  ).state?.store;
  if (store) {
    const origAdd = store.addAnnotation.bind(store);
    const origUpsert = store.upsertAnnotation.bind(store);
    store.addAnnotation = (a, o) => {
      if (isDegenerateSelectorValue(selectorValue(a))) {
        console.warn("[@render/mount] suppressed degenerate annotation at store.addAnnotation", a);
        return;
      }
      origAdd(a, o);
    };
    store.upsertAnnotation = (a, o) => {
      if (isDegenerateSelectorValue(selectorValue(a))) {
        console.warn("[@render/mount] suppressed degenerate annotation at store.upsertAnnotation", a);
        return;
      }
      origUpsert(a, o);
    };
  } else {
    console.error(
      "[@render/mount] annotator.state.store not found — degenerate-annotation guard is inactive. Annotorious internals may have changed (carry from anvil viewer.ts:154).",
    );
  }

  mountPlugin(annotator);

  // Reactivity inverted into explicit listener sets (the spike module-1 change). Each lifecycle
  // event the editor needs (select / create / update / delete) flows OUT through a callback set.
  const selectL = new Set<(id: SelectionId | null) => void>();
  const createL = new Set<(a: W3CImageAnnotation) => void>();
  const updateL = new Set<(a: W3CImageAnnotation) => void>();
  const deleteL = new Set<(id: SelectionId) => void>();

  annotator.on("selectionChanged", (selected: W3CImageAnnotation[]) => {
    const id = (selected[0] as { id?: string } | undefined)?.id ?? null;
    for (const l of selectL) l(id);
  });
  annotator.on("createAnnotation", (a: W3CImageAnnotation) => {
    for (const l of createL) l(a);
  });
  annotator.on("updateAnnotation", (a: W3CImageAnnotation) => {
    for (const l of updateL) l(a);
  });
  annotator.on("deleteAnnotation", (a: W3CImageAnnotation) => {
    const id = (a as { id?: string }).id;
    if (id !== undefined) for (const l of deleteL) l(id);
  });
  if (opts.onSelect) selectL.add(opts.onSelect);

  const subscribe = <T>(set: Set<T>, cb: T): (() => void) => {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  };

  // Coverage-border overlay (7e1f) — a single canvas-wide SVG appended over the OSD container. Held in
  // a closure var so re-calling setFrame replaces it and null clears it. Annotorious is per-shape only,
  // so this is a NEW mechanism (not a marker style). The SVG ignores pointer events except at the 4
  // corner hit-targets, leaving the centre free for pan/zoom (donor legibility: stroke-over-stroke halo).
  let frameEl: SVGSVGElement | null = null;
  const clearFrame = (): void => {
    frameEl?.remove();
    frameEl = null;
  };
  const drawFrame = (frame: FrameOverlay): void => {
    clearFrame();
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "20",
    } as Partial<CSSStyleDeclaration>);

    // The border: a dark halo stroke under the colour stroke so it stays legible over any media
    // (stroke-over-stroke, matching the marker drop-shadow note). vector-effect keeps width constant.
    const inset = 1.2;
    const side = 100 - inset * 2;
    const halo = document.createElementNS(NS, "rect");
    const border = document.createElementNS(NS, "rect");
    for (const r of [halo, border]) {
      r.setAttribute("x", String(inset));
      r.setAttribute("y", String(inset));
      r.setAttribute("width", String(side));
      r.setAttribute("height", String(side));
      r.setAttribute("fill", "none");
      r.setAttribute("vector-effect", "non-scaling-stroke");
    }
    halo.setAttribute("stroke", "rgba(0,0,0,0.55)");
    halo.setAttribute("stroke-width", "5");
    border.setAttribute("stroke", frame.colour);
    border.setAttribute("stroke-width", "3");
    svg.append(halo, border);

    // 4 corner hit-targets — clickable L-brackets, centre untouched. pointer-events:auto only here.
    const arm = 14;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1], // TL
      [100 - inset, inset, -1, 1], // TR
      [inset, 100 - inset, 1, -1], // BL
      [100 - inset, 100 - inset, -1, -1], // BR
    ];
    for (const [cx, cy, sx, sy] of corners) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M ${cx} ${cy + sy * arm} L ${cx} ${cy} L ${cx + sx * arm} ${cy}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", frame.colour);
      path.setAttribute("stroke-width", "6");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.setAttribute("stroke-linecap", "round");
      path.style.pointerEvents = "stroke";
      path.style.cursor = "pointer";
      path.addEventListener("click", () => frame.onActivate());
      svg.append(path);
    }
    viewer.element.appendChild(svg);
    frameEl = svg;
  };

  let disposed = false;
  return {
    setAnnotations(annotations) {
      // Replace the in-store set (anvil viewer pattern: setAnnotations(_, true)).
      annotator.setAnnotations(annotations as never, true);
    },
    setStyle(styleFor) {
      // Wire a per-annotation style to Annotorious's DrawingStyleExpression: it passes the parsed
      // annotation; we key by its id and let the adapter map id → Reading colour (ADR-0007).
      annotator.setStyle(
        styleFor ? (((ann: { id?: unknown }) => styleFor(String(ann.id ?? ""))) as never) : undefined,
      );
    },
    fitBounds(id: SelectionId) {
      // The new path goes through the same dispatchFitBounds oracle the gate test pins.
      const anns = annotator.getAnnotations() as W3CImageAnnotation[];
      dispatchFitBounds(viewer.viewport as unknown as ViewportLike, anns, id, opts.getFitOptions?.() ?? PLAIN_FIT);
    },
    fitRegion(fragment: string) {
      // Fit an arbitrary region fragment (a Section's camera target — NOT an annotation). Same oracle
      // as fitBounds, but the selector is built from the fragment directly. `t=...` → fitBoundsRect null → no-op.
      const selector = { type: "FragmentSelector", value: fragment } as W3CSelector;
      applyFitBounds(viewer.viewport as unknown as ViewportLike, selector, opts.getFitOptions?.() ?? PLAIN_FIT);
    },
    setSelected(id: SelectionId | null) {
      if (id === null) annotator.cancelSelected();
      else annotator.setSelected(id);
    },
    setFrame(frame: FrameOverlay | null) {
      if (frame === null) clearFrame();
      else drawFrame(frame);
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
        const v = anns.find((a) => a.id === id)?.target?.selector?.value;
        if (!v) return null;
        const box = selectorBBox({ type: v.includes("<") ? "SvgSelector" : "FragmentSelector", value: v } as W3CSelector);
        if (!box) return null;
        const o = viewer.element.getBoundingClientRect();
        const tl = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(box.x, box.y));
        const br = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(box.x + box.w, box.y + box.h));
        return { left: tl.x + o.left, top: tl.y + o.top, right: br.x + o.left, bottom: br.y + o.top };
      } catch {
        return null;
      }
    },
    onViewportChange(cb) {
      viewer.addHandler("update-viewport", cb);
      return () => viewer.removeHandler("update-viewport", cb);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      clearFrame();
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
