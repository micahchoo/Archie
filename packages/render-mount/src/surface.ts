// The imperative mount-surface CONTRACT (ADR-0002 / Q-2). A framework adapter drives these
// methods and subscribes to onSelect; reactivity lives in the adapter, NOT here (the spike
// module-1 inversion). Declared separately from index/mount to avoid a circular import.

import type { W3CAnnotation } from "@render/core";

/** A live selection target on the mounted surface (note logicalId or version id). */
export type SelectionId = string;

/** The v1 drawing tools (the rect + polygon shape vocab — Q-1). */
export type DrawTool = "rectangle" | "polygon";

export interface MountSurface {
  /** Load (replace) the WADM annotations rendered on the surface — e.g. a canvas heads page. */
  setAnnotations(annotations: W3CAnnotation[]): void;
  /** Zoom/pan so the target's region fills the viewport. Handles polygon→bbox (core selectorBBox). */
  fitBounds(id: SelectionId): void;
  /** Zoom/pan to an arbitrary REGION fragment that is NOT an annotation — a narrative Section's camera
   *  target (ADR-0005 `Section.start`). `xywh=...` fits the region; a temporal `t=...` no-ops here (a
   *  spatial canvas can't fit time — AV sections seek via the player instead). */
  fitRegion(fragment: string): void;
  /** Programmatically select a target, or clear selection with null. */
  setSelected(id: SelectionId | null): void;
  /** Toggle drawing mode (off = pan/select). */
  setDrawingEnabled(enabled: boolean): void;
  /** Pick the active drawing tool (rect or polygon — the v1 vocab). */
  setDrawingTool(tool: DrawTool): void;
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
