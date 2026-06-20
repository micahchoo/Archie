// Minimal IIIF Presentation 3 types (https://iiif.io/api/presentation/3.0/). Just the shapes
// Archie's projections emit: Collection (Library), Manifest (Exhibit), Canvas (Object) with a
// painting AnnotationPage. Language maps use the `none` key (no declared language) in v1.

import type { W3CAnnotation } from "../wadm/types.js";

export const IIIF_PRESENTATION_CONTEXT = "https://iiif.io/api/presentation/3/context.json" as const;

/** IIIF language map (e.g. `{ none: ["My Title"] }`). */
export type LangMap = Record<string, string[]>;

/** A IIIF label/value pair (both language maps) — used by `requiredStatement` and `metadata` entries. */
export interface IIIFLabelValue {
  label: LangMap;
  value: LangMap;
}

/** A IIIF Agent (the `provider` of a resource — an institution/person). Additive; emitted in the later phase. */
export interface IIIFAgent {
  id: string;
  type: "Agent";
  label: LangMap;
  homepage?: Array<{ id: string; type: "Text"; label?: LangMap }>;
  logo?: Array<{ id: string; type: "Image"; format?: string }>;
}

/**
 * The IIIF rights properties Archie projects onto a Collection / Manifest / Canvas
 * (CONTEXT "Exhibit / Library rights & metadata"). `rights` = one license URI; `requiredStatement` =
 * a MUST-display credit; `metadata` / `provider` are additive. Mixed into the three resource types so
 * the same fields appear at every level (mirrors the model's `RightsFields`).
 */
export interface IIIFRightsProps {
  rights?: string;
  requiredStatement?: IIIFLabelValue;
  metadata?: IIIFLabelValue[];
  provider?: IIIFAgent[];
}

export interface IIIFContentResource {
  id: string;
  type: "Image" | "Sound" | "Video" | "Text" | "Dataset";
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  /** IIIF Image API service descriptor (Image-type bodies only). */
  service?: Array<{ id: string; type: string; profile?: string }>;
}

export interface IIIFPaintingAnnotation {
  id: string;
  type: "Annotation";
  motivation: "painting";
  body: IIIFContentResource;
  target: string;
}

export interface IIIFAnnotationPage {
  id: string;
  type: "AnnotationPage";
  items: IIIFPaintingAnnotation[];
}

/**
 * A reference to a heads AnnotationPage that MAY embed its content inline (ADR-0007).
 * Bare `{id, type}` = dereference target; with `items` = embedded so a pure IIIF viewer
 * renders notes with no second fetch. A per-Reading page carries `partOf` → its collection.
 * Canonical shape for IIIFCanvas.annotations[] and the publish-time staging map (site.ts).
 */
export interface AnnotationPageRef {
  id: string;
  type: "AnnotationPage";
  label?: LangMap;
  summary?: LangMap;
  partOf?: Array<{ id: string; type: "AnnotationCollection" }>;
  items?: W3CAnnotation[];
}

export interface IIIFCanvas extends IIIFRightsProps {
  id: string;
  type: "Canvas";
  label?: LangMap;
  /** Optional per-object description/caption (Archie's AObject.summary). */
  summary?: LangMap;
  width?: number;
  height?: number;
  duration?: number;
  /** Painting content (the image/AV). */
  items: IIIFAnnotationPage[];
  /**
   * The heads annotation page(s) the notes load from — a base page + one per Reading (ADR-0007).
   * `items` are embedded INLINE: a static site / portable `.archie.zip` has no server to dereference
   * a bare `id`, so a pure IIIF viewer (Clover, Mirador) renders the notes with no second fetch and no
   * CORS, regardless of the base IRI. A Reading page carries `partOf` → its AnnotationCollection. The
   * standalone sidecar file at each `id` is still written, as the citation / PROV dereference target.
   */
  annotations?: AnnotationPageRef[];
  /** Sized thumbnail derivative (Image canvases only). */
  thumbnail?: Array<{ id: string; type: "Image" }>;
}

/** A narrative Range (CONTEXT: Section). `start` is what the canvas shows when active. */
export interface IIIFRange {
  id: string;
  type: "Range";
  label: LangMap;
  /** The Section's narrative prose (carried so the published tree round-trips back to authored Sections). */
  summary?: LangMap;
  items: Array<{ id: string; type: "Canvas" }>;
  start?: { id: string; type: "Canvas" };
  /** Link to the AnnotationCollection of supplementing annotations for this Range (IIIF Pres 3 §5.4) —
   *  Archie points it at the exhibit's narrative-spine collection (the WADM view of the Sections; ADR-0017),
   *  the ecosystem-sanctioned Range↔annotation bridge. Additive: `sectionsFromManifest` ignores it. */
  supplementary?: { id: string; type: "AnnotationCollection" };
}

export interface IIIFManifest extends IIIFRightsProps {
  "@context": typeof IIIF_PRESENTATION_CONTEXT;
  id: string;
  type: "Manifest";
  label: LangMap;
  summary?: LangMap;
  items: IIIFCanvas[];
  /** Narrative structure (ordered Ranges) — present only for Narrative-layout exhibits. */
  structures?: IIIFRange[];
}

export interface IIIFCollectionItem {
  id: string;
  type: "Manifest";
  label: LangMap;
  thumbnail?: Array<{ id: string; type: "Image" }>;
}

export interface IIIFCollection extends IIIFRightsProps {
  "@context": typeof IIIF_PRESENTATION_CONTEXT;
  id: string;
  type: "Collection";
  label: LangMap;
  summary?: LangMap;
  items: IIIFCollectionItem[];
}

/** Build a single-language `none` language map. */
export function langMap(value: string): LangMap {
  return { none: [value] };
}
