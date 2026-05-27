// Minimal IIIF Presentation 3 types (https://iiif.io/api/presentation/3.0/). Just the shapes
// Archie's projections emit: Collection (Library), Manifest (Exhibit), Canvas (Object) with a
// painting AnnotationPage. Language maps use the `none` key (no declared language) in v1.

export const IIIF_PRESENTATION_CONTEXT = "http://iiif.io/api/presentation/3/context.json" as const;

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
  /** Where Archie attaches the heads annotation page (the notes viewers load). */
  annotations?: Array<{ id: string; type: "AnnotationPage" }>;
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
