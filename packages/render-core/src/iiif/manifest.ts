// toManifest — Exhibit -> IIIF Presentation 3 Manifest (ADR-0001 / Q-1; CONTEXT §Language).
// Each Object becomes a Canvas with a painting AnnotationPage (the image/AV) plus a reference
// to the Archie heads AnnotationPage where the notes for that canvas load.

import type { AObject, Exhibit, MediaType, Section } from "../model/model.js";
import { resolveTileSource, thumbnailUrl, type TileSourceDescriptor } from "./resolve.js";

/** Object/Canvas extension key carrying a Map's tile-source descriptor (geo-annotation; ADR-0015). Emitted
 *  only when present (byte-stable when absent); pure IIIF viewers ignore it, Archie reads it to mount the map. */
const ARCHIE_TILE_SOURCE = "archie:tileSource" as const;

/** Validate a parsed archie:tileSource back into a descriptor; undefined if malformed (skip, not throw). */
function asTileSourceDescriptor(v: unknown): TileSourceDescriptor | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const d = v as Record<string, unknown>;
  if (d.kind !== "xyz" || typeof d.template !== "string" || typeof d.maxZoom !== "number") return undefined;
  return {
    kind: "xyz",
    template: d.template,
    maxZoom: d.maxZoom,
    ...(typeof d.tileSize === "number" ? { tileSize: d.tileSize } : {}),
    ...(typeof d.minZoom === "number" ? { minZoom: d.minZoom } : {}),
    ...(Array.isArray(d.bounds) && d.bounds.length === 4 && d.bounds.every((n) => typeof n === "number") ? { bounds: d.bounds as [number, number, number, number] } : {}),
    ...(typeof d.attribution === "string" ? { attribution: d.attribution } : {}),
  };
}
import {
  IIIF_PRESENTATION_CONTEXT,
  langMap,
  type IIIFCanvas,
  type IIIFContentResource,
  type IIIFManifest,
  type IIIFRange,
  type LangMap,
} from "./presentation.js";
import { rightsProps, rightsFromIIIF } from "./rights.js";

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

function toCanvas(manifestBase: string, obj: AObject, readingIds: string[] = []): IIIFCanvas {
  const canvasId = `${manifestBase}/canvas/${obj.id}`;
  const mediaType = bodyType(obj.mediaType);
  const body: IIIFContentResource = {
    id: obj.source,
    type: mediaType,
    ...(obj.format !== undefined ? { format: obj.format } : {}),
    ...(obj.width !== undefined ? { width: obj.width } : {}),
    ...(obj.height !== undefined ? { height: obj.height } : {}),
    ...(obj.duration !== undefined ? { duration: obj.duration } : {}),
  };
  // IIIF Image API service descriptor — declared so standard viewers can resolve the image.
  // Only for Image bodies whose source classifies as a IIIF service base (resolveTileSource → iiif;
  // NOT a blob:/data:/disallowed-scheme URL or a plain image file — the canonical classifier, which
  // also correctly rejects the bogus-service cases the old inline regex would have admitted). Default
  // to ImageService2 — most existing services are v2.
  const isIiifService = mediaType === "Image" && resolveTileSource(obj.source).kind === "iiif";
  if (isIiifService) {
    body.service = [{ id: obj.source, type: "ImageService2", profile: "level2" }];
  }
  const canvas: IIIFCanvas = {
    id: canvasId,
    type: "Canvas",
    label: langMap(obj.label),
    ...(obj.summary !== undefined && obj.summary !== "" ? { summary: langMap(obj.summary) } : {}),
    ...rightsProps(obj),
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
    // Sized thumbnail for gallery/overview — the canonical thumbnailUrl derives the Image API sized
    // JPEG from the service base (same `{base}/full/240,/0/default.jpg` the inline template built),
    // only for Image bodies that classify as a IIIF service (same gate as the service descriptor).
    ...(isIiifService
      ? { thumbnail: [{ id: thumbnailUrl(obj.source, 240), type: "Image" as const }] }
      : {}),
    // The base notes page + one page per Reading (ADR-0007) — the multi-AnnotationPage Canvas a
    // pure IIIF viewer (Mirador) can toggle. Reading pages carry partOf → the reading's collection.
    annotations: [
      { id: `${canvasId}/annotations.json`, type: "AnnotationPage" },
      ...readingIds.map((r) => ({ id: `${canvasId}/annotations-${r}.json`, type: "AnnotationPage" as const })),
    ],
  };
  // Map descriptor (geo-annotation, ADR-0015) — emit only when present, byte-stable when absent.
  if (obj.tileSource) (canvas as unknown as Record<string, unknown>)[ARCHIE_TILE_SOURCE] = obj.tileSource;
  return canvas;
}

function objIdFromCanvasId(canvasId: string): string {
  const parts = canvasId.split("/");
  return parts[parts.length - 1] ?? canvasId;
}

function mediaFromBodyType(t: string | undefined): MediaType {
  return t === "Sound" ? "sound" : t === "Video" ? "video" : "image";
}

/**
 * Map each Object id → its FULL canvas IRI as written in the manifest. The published source of
 * truth for canvas ids: a real publish bakes its own origin into them, which reconstructing from a
 * fixed viewer-side BASE would not match (the Phase-A canvasId SNAG). Consumers wire annotation
 * targeting from this, not from `canvasIdFor(slug,id)`. Additive — leaves objectsFromManifest's
 * round-trip contract (publish↔load) untouched.
 */
export function canvasIdMap(manifest: IIIFManifest): Record<string, string> {
  const map: Record<string, string> = {};
  for (const canvas of manifest.items) map[objIdFromCanvasId(canvas.id)] = canvas.id;
  return map;
}

/** Reverse of toManifest: recover the Objects from an IIIF Manifest's canvases (load path). */
export function objectsFromManifest(manifest: IIIFManifest): AObject[] {
  return manifest.items.map((canvas) => {
    const body = canvas.items[0]?.items[0]?.body;
    const tileSource = asTileSourceDescriptor((canvas as unknown as Record<string, unknown>)[ARCHIE_TILE_SOURCE]);
    const obj: AObject = {
      id: objIdFromCanvasId(canvas.id),
      source: body?.id ?? "",
      label: canvas.label?.none?.[0] ?? "",
      ...(canvas.summary !== undefined ? { summary: unLang(canvas.summary) } : {}),
      ...(body?.type !== undefined && body.type !== "Image" ? { mediaType: mediaFromBodyType(body.type) } : {}),
      ...(canvas.width !== undefined ? { width: canvas.width } : {}),
      ...(canvas.height !== undefined ? { height: canvas.height } : {}),
      ...(canvas.duration !== undefined ? { duration: canvas.duration } : {}),
      ...(body?.format !== undefined ? { format: body.format } : {}),
      ...(tileSource !== undefined ? { tileSource } : {}), // Map descriptor round-trip (ADR-0015)
      ...rightsFromIIIF(canvas), // round-trip the per-object credit/license (ADR rights & metadata)
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
    ...rightsProps(exhibit),
    items: exhibit.objects.map((obj) => toCanvas(manifestBase, obj, (exhibit.readings ?? []).map((r) => r.id))),
    ...(ranges.length > 0 ? { structures: ranges } : {}),
  };
}
