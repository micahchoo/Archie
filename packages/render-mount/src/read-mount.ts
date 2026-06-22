// createReadOnlyMount — the READ-ONLY OSD mount (ADR-0019: read-only, NO Annotorious/PixiJS, NO
// unsafe-eval). It KEEPS OpenSeadragon (deep-zoom tiles) but does NOT import/call createOSDAnnotator,
// so @annotorious/* + pixi are ABSENT from this module's import graph (the keystone premise; P0-10
// proves it statically). The annotator's per-shape rendering + hit-test is replaced by the DOM-SVG
// `createReadOnlyOverlay` (read-overlay.ts). fitBounds routes through the SAME pure dispatchFitBounds
// oracle createMount uses (the gate-pinned rect+polygon→bbox path) — NOT a new fit computation.
//
// Donor: mount.ts:74-170 (the OSD-construction half — resolveTileSource, tileSources, crossOriginPolicy,
// the open/open-failed promise, showNavigationControl:false), STOPPING at createOSDAnnotator (mount.ts:172).
// The overlay-wiring is factored into the PURE `wireReadOnlySurface(viewport, overlay, getAnnotations)`
// seam the test drives without a live OSD (mirrors how gate.test.ts mocks the viewport, not OSD).

import OpenSeadragon from "openseadragon";
import { resolveTileSource } from "@render/core";
import type { TileSourceDescriptor, W3CAnnotation } from "@render/core";
import { dispatchFitBounds, type FitOptions, type ViewportLike } from "./fitbounds.js";
import { createReadOnlyOverlay, type LabelFor } from "./read-overlay.js";
import { xyzTileSource } from "./xyz.js";
import { dziOsdSource } from "./dzi.js";
import type { SelectionId } from "./surface.js";
import { guardImageDimensions, MAX_DECODE_DIM, type ImageGuardResult } from "./image-cap.js";

/** Plain fit (no sidebar reservation) — used when the adapter supplies no fit options (donor: mount.ts:28). */
const PLAIN_FIT: FitOptions = { containerW: 0, sidebarW: 0, sidebarIsSheet: true, detailOpen: false };

/**
 * The read-only subset of MountSurface: load/select annotations, fit a region, subscribe to selection,
 * tear down. NO setDrawingEnabled/onCreate/onUpdate/onDelete/draw-tools (ADR-0019: editing stays in Studio).
 */
export interface ReadOnlyMountSurface {
  /** Load (replace) the WADM annotations rendered on the surface. */
  setAnnotations(annotations: W3CAnnotation[]): void;
  /** Programmatically select a target (visual state), or clear with null. */
  setSelected(id: SelectionId | null): void;
  /** Zoom/pan so the target's region fills the viewport (handles polygon→bbox via the shared oracle). */
  fitBounds(id: SelectionId): void;
  /** Subscribe to user selection on the surface. Returns an unsubscribe fn. */
  onSelect(cb: (id: SelectionId | null) => void): () => void;
  /** Tear down the OSD viewer + overlay and release listeners. */
  destroy(): void;
}

export interface ReadOnlyMountOptions {
  /** Image URL or IIIF source to LOAD (classified by resolveTileSource — ADR-0004). */
  source: string;
  /** Structured tile-source descriptor (an xyz map / dzi pyramid) — classifies the surface (DESIGN.md). */
  tileSource?: TileSourceDescriptor;
  /** The canvas IRI annotations TARGET (defaults to the loaded image url). */
  canvasId?: string;
  /** Fired on user selection. */
  onSelect?: (id: SelectionId | null) => void;
  /** Adapter-supplied current sidebar state for fitBounds reservation. */
  getFitOptions?: () => FitOptions;
  /** Accessible-name source for an overlay shape (P0-6). */
  labelFor?: LabelFor;
  /** Show the OSD locator mini-map (worklist 1.1). */
  locator?: boolean;
}

/** The read subset of the overlay this surface drives — kept minimal so the seam is test-injectable. */
export interface ReadOnlyOverlayLike {
  setAnnotations(annotations: W3CAnnotation[]): void;
  setSelected(id: string | null): void;
  onSelect(cb: (id: string | null) => void): () => void;
  clear(): void;
}

/**
 * PURE overlay-wiring seam (no OSD construction): wire a viewport + a read-only overlay into the
 * ReadOnlyMountSurface contract. `getAnnotations` is the live annotation list (the surface's one source
 * of truth) — fitBounds resolves the id against it through the SAME dispatchFitBounds oracle createMount
 * uses. Selection round-trips overlay → subscribers AND select-then-fits (ADR-0006 nav contract).
 * Test-driven directly (no live OSD), mirroring gate.test.ts's mock-viewport idiom.
 */
export function wireReadOnlySurface(
  viewport: ViewportLike,
  overlay: ReadOnlyOverlayLike,
  getAnnotations: () => W3CAnnotation[],
  getFitOptions?: () => FitOptions,
): ReadOnlyMountSurface {
  const selectSubs = new Set<(id: SelectionId | null) => void>();

  const fitBounds = (id: SelectionId): void => {
    dispatchFitBounds(viewport, getAnnotations(), id, getFitOptions?.() ?? PLAIN_FIT);
  };

  // The overlay is the hit-test source: a shape click (or background → null) flows here, where we
  // notify subscribers AND select-then-fit (the nav contract). One subscription to the overlay.
  overlay.onSelect((id) => {
    for (const cb of selectSubs) cb(id);
    if (id !== null) fitBounds(id);
  });

  return {
    setAnnotations(annotations: W3CAnnotation[]): void {
      overlay.setAnnotations(annotations);
    },
    setSelected(id: SelectionId | null): void {
      overlay.setSelected(id);
    },
    fitBounds,
    onSelect(cb: (id: SelectionId | null) => void): () => void {
      selectSubs.add(cb);
      return () => selectSubs.delete(cb);
    },
    destroy(): void {
      overlay.clear();
    },
  };
}

/** An opened OSD world item — exposes getContentSize() returning the source pixel dims (a Point). */
export interface OpenedSourceLike {
  getContentSize(): { x: number; y: number };
}

/**
 * PURE decode-cap seam: once OSD reports an opened source's content size, decide whether the bitmap
 * is safe to decode. Tiled sources (dzi/xyz/iiif) are pyramids → NEVER capped; a non-tiled
 * `{ type:"image" }` source decodes its WHOLE bitmap at once, so a declared longer edge over
 * MAX_DECODE_DIM is rejected (the mount degrades to an error rather than crashing). Unknown dims (0)
 * pass — degrade-upward (ADR-0021). Drives `guardImageDimensions` with the opened item's dims.
 */
export function guardOpenedImageSource(item: OpenedSourceLike, tiled: boolean): ImageGuardResult {
  const size = item.getContentSize();
  return guardImageDimensions({ tiled, width: size.x, height: size.y });
}

/**
 * Mount a read-only OSD deep-zoom surface with a DOM-SVG overlay over `container`. Resolves once the
 * image has opened. Builds OSD EXACTLY as createMount does (donor: mount.ts:74-170), then instantiates
 * `createReadOnlyOverlay(viewer)` INSTEAD of the Annotorious annotator (mount.ts:172 onward is omitted).
 */
export async function createReadOnlyMount(
  container: HTMLElement,
  opts: ReadOnlyMountOptions,
): Promise<ReadOnlyMountSurface> {
  const ts = resolveTileSource(opts.tileSource ?? opts.source);
  const tileSources =
    ts.kind === "image" ? { type: "image", url: ts.url }
    : ts.kind === "xyz" ? xyzTileSource(ts)
    : ts.kind === "dzi" ? dziOsdSource(ts)
    : ts.infoUrl;

  const viewer = OpenSeadragon({
    element: container,
    tileSources,
    crossOriginPolicy: "Anonymous",
    timeout: 60000,
    showNavigationControl: false,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
    immediateRender: true,
    maxZoomPixelRatio: 16,
    minZoomImageRatio: 0.5,
    ...(opts.locator ? { showNavigator: true, navigatorPosition: "BOTTOM_RIGHT", navigatorSizeRatio: 0.15, navigatorAutoFade: true } : {}),
  });

  // A non-tiled `{ type:"image" }` source decodes its WHOLE bitmap into webview memory; tiled
  // sources (dzi/xyz/iiif) are pyramids and are never capped (image-cap.ts).
  const tiled = ts.kind !== "image";

  await new Promise<void>((resolve, reject) => {
    viewer.addOnceHandler("open", () => {
      // Decode-cap guard: once OSD reports the source dims, reject an oversized non-tiled bitmap
      // BEFORE it is decoded for display — degrade to an error rather than crashing the webview.
      try {
        const item = viewer.world.getItemAt(0) as unknown as OpenedSourceLike | undefined;
        if (item) {
          const guard = guardOpenedImageSource(item, tiled);
          if (!guard.ok) {
            console.error(
              `[@render/mount] read-only source exceeds decode cap (${guard.declared.width}×${guard.declared.height} > ${MAX_DECODE_DIM}px); skipping.`,
            );
            reject(new Error("Couldn't load this media item."));
            return;
          }
        }
      } catch (err) {
        // A missing world item / API shape is non-fatal — degrade upward, let the open succeed.
        console.warn("[@render/mount] read-only decode-cap guard skipped:", err);
      }
      resolve();
    });
    viewer.addOnceHandler("open-failed", (e: { message?: string }) => {
      console.error("[@render/mount] read-only OpenSeadragon open-failed:", e.message ?? "unknown");
      reject(new Error("Couldn't load this media item."));
    });
  });

  // The DOM-SVG overlay replaces the Annotorious annotator (no @annotorious/* / pixi here).
  const overlay = createReadOnlyOverlay(
    viewer as unknown as Parameters<typeof createReadOnlyOverlay>[0],
    opts.labelFor ? { labelFor: opts.labelFor } : {},
  );

  // The surface's one source of truth for the annotation list (fitBounds resolves ids against it).
  let current: W3CAnnotation[] = [];

  const surface = wireReadOnlySurface(
    viewer.viewport as unknown as ViewportLike,
    overlay,
    () => current,
    opts.getFitOptions,
  );

  if (opts.onSelect) surface.onSelect(opts.onSelect);

  return {
    setAnnotations(annotations: W3CAnnotation[]): void {
      current = annotations;
      surface.setAnnotations(annotations);
    },
    setSelected: surface.setSelected,
    fitBounds: surface.fitBounds,
    onSelect: surface.onSelect,
    destroy(): void {
      surface.destroy();
      try { viewer.destroy(); } catch { /* already destroyed */ }
    },
  };
}
