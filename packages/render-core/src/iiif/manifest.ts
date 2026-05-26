// toManifest — Exhibit -> IIIF Presentation 3 Manifest (ADR-0001 / Q-1; CONTEXT §Language).
// Each Object becomes a Canvas with a painting AnnotationPage (the image/AV) plus a reference
// to the Archie heads AnnotationPage where the notes for that canvas load.

import type { AObject, Exhibit, MediaType, Section } from "../model/model.js";
import {
  IIIF_PRESENTATION_CONTEXT,
  langMap,
  type IIIFCanvas,
  type IIIFContentResource,
  type IIIFManifest,
  type IIIFRange,
  type LangMap,
} from "./presentation.js";

/** First value of a IIIF language map (Archie writes single-language `none` maps). */
function unLang(m: LangMap): string {
  return Object.values(m)[0]?.[0] ?? "";
}

export interface ManifestOptions {
  /** Absolute base for ids, e.g. `https://user.github.io/lib/`. Default "" (relative). */
  baseUrl?: string;
}

function bodyType(media: MediaType | undefined): IIIFContentResource["type"] {
  if (media === "sound") return "Sound";
  if (media === "video") return "Video";
  return "Image";
}

function toCanvas(manifestBase: string, obj: AObject): IIIFCanvas {
  const canvasId = `${manifestBase}/canvas/${obj.id}`;
  const body: IIIFContentResource = {
    id: obj.source,
    type: bodyType(obj.mediaType),
    ...(obj.format !== undefined ? { format: obj.format } : {}),
    ...(obj.width !== undefined ? { width: obj.width } : {}),
    ...(obj.height !== undefined ? { height: obj.height } : {}),
    ...(obj.duration !== undefined ? { duration: obj.duration } : {}),
  };
  return {
    id: canvasId,
    type: "Canvas",
    label: langMap(obj.label),
    ...(obj.width !== undefined ? { width: obj.width } : {}),
    ...(obj.height !== undefined ? { height: obj.height } : {}),
    ...(obj.duration !== undefined ? { duration: obj.duration } : {}),
    items: [
      {
        id: `${canvasId}/page/1`,
        type: "AnnotationPage",
        items: [{ id: `${canvasId}/painting/1`, type: "Annotation", motivation: "painting", body, target: canvasId }],
      },
    ],
    // Where the notes (Archie heads page) for this canvas live — a real static file path.
    annotations: [{ id: `${canvasId}/annotations.json`, type: "AnnotationPage" }],
  };
}

function objIdFromCanvasId(canvasId: string): string {
  const parts = canvasId.split("/");
  return parts[parts.length - 1] ?? canvasId;
}

function mediaFromBodyType(t: string | undefined): MediaType {
  return t === "Sound" ? "sound" : t === "Video" ? "video" : "image";
}

/** Reverse of toManifest: recover the Objects from an IIIF Manifest's canvases (load path). */
export function objectsFromManifest(manifest: IIIFManifest): AObject[] {
  return manifest.items.map((canvas) => {
    const body = canvas.items[0]?.items[0]?.body;
    const obj: AObject = {
      id: objIdFromCanvasId(canvas.id),
      source: body?.id ?? "",
      label: canvas.label?.none?.[0] ?? "",
      ...(body?.type !== undefined && body.type !== "Image" ? { mediaType: mediaFromBodyType(body.type) } : {}),
      ...(canvas.width !== undefined ? { width: canvas.width } : {}),
      ...(canvas.height !== undefined ? { height: canvas.height } : {}),
      ...(canvas.duration !== undefined ? { duration: canvas.duration } : {}),
      ...(body?.format !== undefined ? { format: body.format } : {}),
    };
    return obj;
  });
}

/** Project narrative Sections to IIIF Ranges (CONTEXT: Section = Range; the Narrative spine). */
export function toRanges(exhibit: Exhibit, opts: ManifestOptions = {}): IIIFRange[] {
  const manifestBase = `${opts.baseUrl ?? ""}${exhibit.slug}`;
  return (exhibit.sections ?? []).map((section: Section) => {
    const canvasId = `${manifestBase}/canvas/${section.objectId}`;
    const startId = section.start !== undefined ? `${canvasId}#${section.start}` : canvasId;
    return {
      id: `${manifestBase}/range/${section.id}`,
      type: "Range",
      label: langMap(section.title),
      ...(section.prose !== undefined ? { summary: langMap(section.prose) } : {}),
      items: [{ id: canvasId, type: "Canvas" }],
      start: { id: startId, type: "Canvas" },
    };
  });
}

/**
 * Reconstruct narrative Sections from a published manifest's Ranges — the inverse of `toRanges`, so the
 * Viewer reads the narrative spine from the published tree (not from hand-maintained sample-data).
 * Recovers id (from the range IRI), title (label), objectId (canvas IRI), region (`start` #xywh), and
 * prose (`summary`). Round-trip-exact for the fields `toRanges` emits.
 */
export function sectionsFromManifest(manifest: IIIFManifest): Section[] {
  return (manifest.structures ?? []).map((r) => {
    const id = r.id.split("/range/")[1] ?? r.id;
    const canvasId = r.items[0]?.id ?? (r.start?.id ?? "").split("#")[0]!;
    const objectId = canvasId.split("/canvas/")[1] ?? "";
    const startId = r.start?.id ?? "";
    const hashIdx = startId.indexOf("#"); // the canvas IRI has no '#'; the fragment (xywh=/t=) follows it
    const start = hashIdx >= 0 ? startId.slice(hashIdx + 1) : undefined;
    const prose = r.summary !== undefined ? unLang(r.summary) : undefined;
    return {
      id,
      title: unLang(r.label),
      objectId,
      ...(start !== undefined ? { start } : {}),
      ...(prose !== undefined ? { prose } : {}),
    };
  });
}

export function toManifest(exhibit: Exhibit, opts: ManifestOptions = {}): IIIFManifest {
  const baseUrl = opts.baseUrl ?? "";
  const manifestBase = `${baseUrl}${exhibit.slug}`;
  const ranges = toRanges(exhibit, opts);
  return {
    "@context": IIIF_PRESENTATION_CONTEXT,
    id: `${manifestBase}/manifest.json`,
    type: "Manifest",
    label: langMap(exhibit.title),
    ...(exhibit.summary !== undefined ? { summary: langMap(exhibit.summary) } : {}),
    items: exhibit.objects.map((obj) => toCanvas(manifestBase, obj)),
    ...(ranges.length > 0 ? { structures: ranges } : {}),
  };
}
