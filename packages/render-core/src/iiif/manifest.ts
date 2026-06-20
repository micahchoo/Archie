// toManifest — Exhibit -> IIIF Presentation 3 Manifest (ADR-0001 / Q-1; CONTEXT §Language).
// Each Object becomes a Canvas with a painting AnnotationPage (the image/AV) plus a reference
// to the Archie heads AnnotationPage where the notes for that canvas load.

import type { AObject, Exhibit, MediaType, Section } from "../model/model.js";
import type {
  SectionAnnotation,
  W3CAnnotation,
  W3CAnnotationCollection,
  W3CTarget,
  W3CTextualBody,
} from "../wadm/types.js";
import { WADM_CONTEXT } from "../wadm/types.js";
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
  type AnnotationPageRef,
  type IIIFCanvas,
  type IIIFContentResource,
  type IIIFManifest,
  type IIIFRange,
  type LangMap,
} from "./presentation.js";
import { rightsProps, rightsFromIIIF } from "./rights.js";
import { asObjectId } from "../wadm/brand.js";

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
    // Gallery/overview thumbnail. A BAKED sized derivative wins (imported rasters, set at Studio
    // import) — it spares the grid the full-resolution master. Else a IIIF-service source derives the
    // Image-API sized JPEG via the canonical thumbnailUrl (same `{base}/full/240,/0/default.jpg`), only
    // for Image bodies that classify as a service. A plain external raster has neither — the grid
    // derives at runtime (thumbnailUrl passthrough).
    ...(obj.thumbnail !== undefined
      ? { thumbnail: [{ id: obj.thumbnail, type: "Image" as const }] }
      : isIiifService
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
    // Recover only a BAKED thumbnail (the `/assets-thumb/` derivative) into the model — a derived
    // IIIF-service thumbnail is recomputed at render time, never persisted, so the round-trip stays
    // byte-stable for IIIF objects (manifest.test.ts pins that emit). Marker, not a stored flag.
    const thumbId = canvas.thumbnail?.[0]?.id;
    const thumbnail = thumbId !== undefined && thumbId.includes("/assets-thumb/") ? thumbId : undefined;
    const obj: AObject = {
      id: asObjectId(objIdFromCanvasId(canvas.id)),
      source: body?.id ?? "",
      label: canvas.label?.none?.[0] ?? "",
      ...(canvas.summary !== undefined ? { summary: unLang(canvas.summary) } : {}),
      ...(body?.type !== undefined && body.type !== "Image" ? { mediaType: mediaFromBodyType(body.type) } : {}),
      ...(canvas.width !== undefined ? { width: canvas.width } : {}),
      ...(canvas.height !== undefined ? { height: canvas.height } : {}),
      ...(canvas.duration !== undefined ? { duration: canvas.duration } : {}),
      ...(body?.format !== undefined ? { format: body.format } : {}),
      ...(tileSource !== undefined ? { tileSource } : {}), // Map descriptor round-trip (ADR-0015)
      ...(thumbnail !== undefined ? { thumbnail } : {}), // baked-thumbnail round-trip (grid overview perf)
      ...rightsFromIIIF(canvas), // round-trip the per-object credit/license (ADR rights & metadata)
    };
    return obj;
  });
}

/**
 * Extract the INLINE per-canvas annotation items a published manifest already carries. publishLibrary
 * embeds each canvas's base + per-reading heads page into `canvas.annotations[].items` (the IIIFCanvas
 * note above: a static site / portable zip has no server to dereference a bare reference). The Viewer's
 * reader prefers this over re-fetching the standalone `annotations.json` sidecars — the manifest is
 * already downloaded, so those fetches are pure redundancy. Base page id = `…/annotations.json`; a
 * reading page id = `…/annotations-{rid}.json` (rid recovered). An entry that carries NO `items` (an
 * external / legacy manifest that only references its pages) is omitted, so the reader can fall back to
 * fetching that one. Empty-but-present items (`[]`) are kept — a canvas legitimately has no notes.
 */
export function annotationsFromManifest(manifest: IIIFManifest): {
  byObject: Record<string, W3CAnnotation[]>;
  readingByObject: Record<string, Record<string, W3CAnnotation[]>>;
} {
  const byObject: Record<string, W3CAnnotation[]> = {};
  const readingByObject: Record<string, Record<string, W3CAnnotation[]>> = {};
  for (const canvas of manifest.items) {
    const objId = objIdFromCanvasId(canvas.id);
    for (const ap of canvas.annotations ?? []) {
      if (ap.items === undefined) continue; // a bare reference — leave it for the fetch fallback
      const m = /\/annotations(?:-(.+))?\.json$/.exec(ap.id);
      if (!m) continue;
      const rid = m[1];
      if (rid === undefined) byObject[objId] = ap.items;
      else (readingByObject[objId] ??= {})[rid] = ap.items;
    }
  }
  return { byObject, readingByObject };
}

/**
 * The inline content for ONE heads AnnotationPage reference, keyed by the ref's `id` in
 * {@link embedHeadsIntoManifest}. `items` is always embedded (possibly `[]`); `partOf`/`label`/`summary`
 * are present only for the pages that carry them (per-Reading partOf+label+summary; a "Base" label when
 * an exhibit has Readings). Mirrors the optional fields of {@link AnnotationPageRef}.
 */
export interface HeadsEmbed {
  items: W3CAnnotation[];
  partOf?: Array<{ id: string; type: "AnnotationCollection" }>;
  label?: LangMap;
  summary?: LangMap;
}

/**
 * Embed each canvas's heads page content INLINE into the manifest's `canvas.annotations[]` references
 * (the write-path inverse of {@link annotationsFromManifest}) — returning a NEW manifest, leaving the
 * input untouched. publishLibrary builds the bare manifest, projects per-canvas heads pages, then calls
 * this to fold them in before writing (a static site / blob: origin can't dereference a bare reference).
 * A ref whose id has no embed is passed through unchanged. Key order on each embedded ref is frozen as
 * `id, type, items, partOf?, label?, summary?` (the published-JSON byte contract — see the byte-stability
 * snapshot in publish/voynich-readings.test.ts). Pure: no mutation of the input manifest or its canvases.
 */
export function embedHeadsIntoManifest(manifest: IIIFManifest, embeds: Map<string, HeadsEmbed>): IIIFManifest {
  return {
    ...manifest,
    items: manifest.items.map((canvas) =>
      canvas.annotations === undefined
        ? canvas
        : {
            ...canvas,
            annotations: canvas.annotations.map((ref): AnnotationPageRef => {
              const e = embeds.get(ref.id);
              if (e === undefined) return ref;
              return {
                id: ref.id,
                type: ref.type,
                items: e.items,
                ...(e.partOf !== undefined ? { partOf: e.partOf } : {}),
                ...(e.label !== undefined ? { label: e.label } : {}),
                ...(e.summary !== undefined ? { summary: e.summary } : {}),
              };
            }),
          },
    ),
  };
}

/** Project narrative Sections to IIIF Ranges (CONTEXT: Section = Range; the Narrative spine).
 *  Each Range links to the exhibit's narrative-spine AnnotationCollection via `supplementary` (ADR-0017) —
 *  the WADM view of the same Sections — so annotation tools that don't read Ranges still find the narrative. */
export function toRanges(exhibit: Exhibit, opts: ManifestOptions = {}): IIIFRange[] {
  const manifestBase = `${opts.baseUrl ?? ""}${exhibit.slug}`;
  const supplementary = { id: narrativeCollectionId(manifestBase), type: "AnnotationCollection" as const };
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
      supplementary,
    };
  });
}

/** Deterministic id/path of an exhibit's narrative AnnotationCollection (the WADM view of its Sections).
 *  Both `toRanges` (the Range `supplementary` link) and the publish writer derive the same value, so the
 *  reference resolves without either side knowing the other built it. */
function narrativeCollectionId(manifestBase: string): string {
  return `${manifestBase}/annotations/narrative.json`;
}

/**
 * Project one narrative Section to a WADM annotation (ADR-0017) — the additive, all-round-compatible view a
 * pure annotation tool can read (the canonical transport stays the IIIF Range in `structures[]`). The Range
 * affordances are baked in: `motivation: "supplementing"` (the IIIF supplementary semantics), the title as a
 * IIIF `label`, the active region as a media-fragment `target`, the prose as a `describing` body, the spine
 * position as `archie:order`. Carries NO archie DAG fields, so the reload importer ignores it (no double-count).
 */
export function sectionToAnnotation(section: Section, index: number, manifestBase: string): SectionAnnotation {
  const canvasId = `${manifestBase}/canvas/${section.objectId}`;
  const target: W3CTarget =
    section.start !== undefined
      ? {
          type: "SpecificResource",
          source: canvasId,
          selector: { type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: section.start },
        }
      : canvasId;
  return {
    id: `${manifestBase}/section/${section.id}`,
    type: "Annotation",
    motivation: "supplementing",
    label: langMap(section.title),
    target,
    "archie:role": "section",
    "archie:order": index,
    ...(section.prose !== undefined
      ? { body: { type: "TextualBody", value: section.prose, format: "text/html", purpose: "describing" } satisfies W3CTextualBody }
      : {}),
  };
}

/**
 * Project an Exhibit's narrative Sections to one self-contained WADM AnnotationCollection (ADR-0017): the
 * section-annotations embedded inline in spine order in the `first` AnnotationPage, so a static export needs
 * no second fetch. Each IIIF Range links here via `supplementary`. Returns `undefined` for a non-narrative
 * exhibit (no sections) — nothing to write.
 */
export function sectionsToAnnotationCollection(exhibit: Exhibit, opts: ManifestOptions = {}): W3CAnnotationCollection | undefined {
  const sections = exhibit.sections ?? [];
  if (sections.length === 0) return undefined;
  const manifestBase = `${opts.baseUrl ?? ""}${exhibit.slug}`;
  const id = narrativeCollectionId(manifestBase);
  const items = sections.map((s, i) => sectionToAnnotation(s, i, manifestBase));
  return {
    "@context": WADM_CONTEXT,
    id,
    type: "AnnotationCollection",
    label: langMap(exhibit.title),
    total: items.length,
    first: { id: `${id}#page-1`, type: "AnnotationPage", items, partOf: { id, type: "AnnotationCollection" } },
  };
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
