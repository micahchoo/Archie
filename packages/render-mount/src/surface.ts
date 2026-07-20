// The imperative mount-surface CONTRACT (ADR-0002 / Q-2). A framework adapter drives these
// methods and subscribes to onSelect; reactivity lives in the adapter, NOT here (the spike
// module-1 inversion). Declared separately from index/mount to avoid a circular import.

import type { W3CAnnotation } from "@render/core";
import type { NavigatorDot } from "./marker-dots.js";

/** A live selection target on the mounted surface (note logicalId or version id). */
export type SelectionId = string;

/** The v1 drawing tools (the rect + polygon shape vocab — Q-1). Geo-annotations reuse these on a Map
 *  surface (Box/Outline + geo-truth); there is NO point/pin tool (2026-06-18 grilling, Q4). */
export type DrawTool = "rectangle" | "polygon";

/** Per-marker draw style (maps to Annotorious DrawingStyle) — used to colour a marker by its Reading (ADR-0007). */
export interface MarkerStyle {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

/** A canvas-wide coverage border (7e1f) — frames the WHOLE media (image/OSD only) when a single mark
 *  covers the object. Distinct from per-shape MarkerStyle: Annotorious styles individual shapes; this
 *  is a NEW overlay mechanism over the OSD container. `onActivate` fires when a corner hit-target is
 *  clicked (the centre stays unobstructed for normal pan/zoom). */
export interface FrameOverlay {
  colour: string;
  onActivate: () => void;
}

export interface MountSurface {
  /** Load (replace) the WADM annotations rendered on the surface — e.g. a canvas heads page. */
  setAnnotations(annotations: W3CAnnotation[]): void;
  /** Style markers per-annotation (by id) — e.g. colour each marker by its Reading (ADR-0007). Return
   *  undefined for the default style. Persistent: applies to current + future annotations. Pass undefined to reset. */
  setStyle(styleFor: ((annotationId: SelectionId) => MarkerStyle | undefined) | undefined): void;
  /** Zoom/pan so the target's region fills the viewport. Handles polygon→bbox (core selectorBBox). */
  fitBounds(id: SelectionId): void;
  /** Zoom/pan to an arbitrary REGION fragment that is NOT an annotation — a narrative Section's camera
   *  target (ADR-0005 `Section.start`). `xywh=...` fits the region; a temporal `t=...` no-ops here (a
   *  spatial canvas can't fit time — AV sections seek via the player instead). */
  fitRegion(fragment: string): void;
  /** Programmatically select a target, or clear selection with null. */
  setSelected(id: SelectionId | null): void;
  /** Draw (or replace) a canvas-wide coverage border framing the WHOLE media, with 4 clickable corner
   *  hit-targets (the centre stays unobstructed). Clicking any corner → `frame.onActivate()`. Pass null
   *  to clear; re-calling replaces the current frame. Image/OSD only (AV deferred — 7e1f). */
  setFrame(frame: FrameOverlay | null): void;
  /** Plot tiny note-position dots INSIDE the OSD navigator (Archie-c1d9) — where each note lives on the
   *  whole image, mapped image-space → navigator-element px (imageToNavigatorPixel) and appended as
   *  children of the navigator element so they inherit its position + auto-fade. No-op when the locator
   *  (navigator) is off. Pass an empty array to clear; re-calling reconciles to the new set. Decorative
   *  (aria-hidden) — the navigator is a spatial overview, not a keyboard surface. */
  setNavigatorDots(dots: NavigatorDot[]): void;
  /** Toggle drawing mode (off = pan/select). */
  setDrawingEnabled(enabled: boolean): void;
  /** Pick the active drawing tool (rect or polygon — the v1 vocab). */
  setDrawingTool(tool: DrawTool): void;
  /** On-screen rect (in viewer-element pixels) of an annotation's marker, for anchoring an editing popover
   *  to it (ADR-0006). Uses Annotorious geometry bounds → OSD `imageToViewerElementCoordinates` (donor:
   *  annotorious-svelte OpenSeadragonPopup.svelte:53-68). Null if the marker/viewport isn't resolvable.
   *  Recompute via onViewportChange — OSD re-anchors natively on pan/zoom, no positioning dep needed. */
  markerScreenRect(id: SelectionId): { left: number; top: number; right: number; bottom: number } | null;
  /** Batched form of markerScreenRect (MARGINALIA-PLAN cut A): ALL requested markers' on-screen
   *  rects in ONE pass over the annotation list + ONE container-offset read — the per-frame input
   *  to the marginalia layout (worklist 2.1). Unresolvable ids map to null. Recompute via
   *  onViewportChange, throttled to rAF by the consumer. */
  markerScreenRects(ids: SelectionId[]): Record<string, { left: number; top: number; right: number; bottom: number } | null>;
  /** Subscribe to OSD pan/zoom (`update-viewport`) — fires each frame the viewport moves, so a popover can
   *  follow its marker (donor: OpenSeadragonPopup.svelte:70-81). Returns an unsubscribe fn. */
  onViewportChange(cb: () => void): () => void;
  /** Current zoom / home zoom (Archie-93fd scale cue) — the SAME raw ratio zoom-band.ts bands, so 1
   *  means OSD's home zoom (fit-to-viewport), matching zoomBand's own baseline. Like the ratio fed to
   *  `zoomBand`, this can read NaN/Infinity on a degenerate first-paint race (before `getHomeZoom`
   *  resolves) — callers format it with `formatZoomRatio` (zoom-cue.ts), which owns the degrade-to-"1×"
   *  policy, the same division of labour zoomBand already uses. Recompute via onViewportChange. */
  getZoomRatio(): number;
  /** Tear down OSD + Annotorious instances and release listeners. */
  destroy(): void;
  /** Subscribe to user selection on the surface. Returns an unsubscribe fn. */
  onSelect(cb: (id: SelectionId | null) => void): () => void;
  /** Subscribe to a newly-drawn annotation (the create path). Returns unsubscribe. */
  onCreate(cb: (annotation: W3CAnnotation) => void): () => void;
  /** Subscribe to an edited annotation (geometry change on canvas). Returns unsubscribe. */
  onUpdate(cb: (annotation: W3CAnnotation) => void): () => void;
  /** Subscribe to a deleted annotation (by id). Returns unsubscribe. */
  onDelete(cb: (id: SelectionId) => void): () => void;
}
